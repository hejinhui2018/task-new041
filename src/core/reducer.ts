import type {
  FlowDefinition,
  FlowEvent,
  FlowState,
  FlowStep,
  LogEntry,
  LogKind,
  StepRuntime,
} from './types';
import {
  ADVANCE_DEBOUNCE_MS,
  factLabel,
  firstIncompleteMandatoryBefore,
  getStep,
  missingRequires,
  statusLabel,
  stepIndex,
} from './flow';

const MAX_LOG = 200;

/** 进入校验的结果：允许（可能被必经守卫重定向）或阻断（带原因） */
export type EntryResolution =
  | { ok: true; stepId: string; redirectedFrom?: string }
  | { ok: false; reason: string };

const EMPTY_RUNTIME: StepRuntime = { visits: 0, completions: 0, completed: false };

export function initialState(flow: FlowDefinition, now: number): FlowState {
  const steps: Record<string, StepRuntime> = {};
  for (const step of flow.steps) steps[step.id] = { ...EMPTY_RUNTIME };
  const first = flow.steps[0];
  const base: FlowState = {
    version: 1,
    flow,
    status: 'running',
    currentStepId: first.id,
    currentEpoch: 0,
    facts: {},
    steps,
    remainingMs: 0,
    deadlineAt: null,
    lastAdvanceAt: Number.NEGATIVE_INFINITY,
    blocked: null,
    ignoredEvents: 0,
    powerOffFrom: null,
    log: [],
  };
  return enterStep(base, first.id, now, '流程开始');
}

/**
 * 进入校验（纯函数）：
 * 1. 目标必须存在；
 * 2. 必经步骤守卫——目标之前存在未完成的必看步骤时，重定向到该步骤（绝不绕过）；
 * 3. 目标自身的前置条件必须全部满足，否则阻断并给出原因。
 */
export function resolveEntry(state: FlowState, targetId: string, depth = 0): EntryResolution {
  if (depth > 8) return { ok: false, reason: '前置条件链路过深，无法判定' };
  const target = getStep(state.flow, targetId);
  if (!target) return { ok: false, reason: `目标步骤不存在：${targetId}` };
  const guard = firstIncompleteMandatoryBefore(state, stepIndex(state.flow, targetId));
  if (guard) {
    const inner = resolveEntry(state, guard.id, depth + 1);
    if (!inner.ok) return inner;
    return { ok: true, stepId: inner.stepId, redirectedFrom: targetId };
  }
  const missing = missingRequires(state, target);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `缺少前置条件：${missing.map((f) => factLabel(state.flow, f)).join('、')}`,
    };
  }
  return { ok: true, stepId: targetId };
}

/** 主归约函数：所有状态转换的唯一入口 */
export function reduce(state: FlowState, event: FlowEvent, now: number): FlowState {
  switch (event.type) {
    case 'touch': {
      if (state.status !== 'running') {
        return ignore(state, now, `触摸被拦截：当前状态为「${statusLabel(state.status)}」`);
      }
      const step = currentStep(state);
      if (!step) return ignore(state, now, '触摸被拦截：当前步骤缺失');
      if (step.kind === 'autoplay') {
        return ignore(state, now, `触摸被拦截：「${step.title}」自动播放中，不响应触摸`);
      }
      if (withinDebounce(state, now)) {
        return ignore(state, now, '触摸被拦截：与上次推进间隔过短，按重复触发处理（幂等）');
      }
      return completeCurrent(state, now, 'touch');
    }

    case 'next': {
      // 阻断状态下，“下一步”= 重试被阻断的推进
      if (state.status === 'blocked' && state.blocked) {
        const resolution = resolveEntry(state, state.blocked.pendingStepId);
        if (!resolution.ok) {
          return ignore(state, now, `仍被阻断：${resolution.reason}`);
        }
        return enterStep(state, resolution.stepId, now, '阻断解除，继续推进');
      }
      if (state.status !== 'running') {
        return ignore(state, now, `无法推进：当前状态为「${statusLabel(state.status)}」`);
      }
      const step = currentStep(state);
      if (!step) return ignore(state, now, '无法推进：当前步骤缺失');
      if (!step.skippable) {
        return ignore(state, now, `「${step.title}」为必看步骤，不可跳过`);
      }
      if (withinDebounce(state, now)) {
        return ignore(state, now, '推进被拦截：与上次推进间隔过短，按重复触发处理（幂等）');
      }
      return completeCurrent(state, now, 'next');
    }

    case 'timeout': {
      // 幂等触发：定时器回执必须属于当前轮次，过期回执直接丢弃
      if (event.epoch !== state.currentEpoch) {
        return ignore(state, now, '忽略过期的定时器回执（epoch 不匹配，幂等丢弃）');
      }
      if (state.status !== 'running') {
        return ignore(state, now, `超时回执被拦截：当前状态为「${statusLabel(state.status)}」`);
      }
      const step = currentStep(state);
      if (!step) return ignore(state, now, '超时回执被拦截：当前步骤缺失');
      if (step.dwellMs <= 0) {
        return ignore(state, now, '超时回执被拦截：当前步骤无停留计时');
      }
      return completeCurrent(state, now, 'timeout');
    }

    case 'pause': {
      if (state.status !== 'running') {
        return ignore(state, now, `无法暂停：当前状态为「${statusLabel(state.status)}」`);
      }
      const step = currentStep(state);
      if (!step) return ignore(state, now, '无法暂停：当前步骤缺失');
      if (!step.interruptible) {
        return ignore(state, now, `「${step.title}」为不可中断提示，暂停被拒绝`);
      }
      // 计时暂停：把剩余时长从“截止时间”换算回“剩余毫秒”并冻结
      const remaining =
        state.deadlineAt !== null ? Math.max(0, state.deadlineAt - now) : state.remainingMs;
      const next: FlowState = {
        ...state,
        status: 'paused',
        remainingMs: remaining,
        deadlineAt: null,
      };
      return appendLog(next, now, 'pause', `无障碍暂停，剩余 ${Math.ceil(remaining / 1000)} 秒`);
    }

    case 'resume': {
      if (state.status !== 'paused') {
        return ignore(state, now, `无法继续：当前状态为「${statusLabel(state.status)}」`);
      }
      const step = currentStep(state);
      const next: FlowState = {
        ...state,
        status: 'running',
        deadlineAt: step && step.dwellMs > 0 ? now + state.remainingMs : null,
      };
      return appendLog(next, now, 'resume', '继续播放，计时从暂停点恢复');
    }

    case 'power-off': {
      if (state.status !== 'running' && state.status !== 'paused' && state.status !== 'blocked') {
        return ignore(state, now, `无法断电：当前状态为「${statusLabel(state.status)}」`);
      }
      // 冻结现场：换算剩余时长，记录断电前状态
      const remaining =
        state.status === 'running' && state.deadlineAt !== null
          ? Math.max(0, state.deadlineAt - now)
          : state.remainingMs;
      const next: FlowState = {
        ...state,
        status: 'powered-off',
        powerOffFrom: state.status,
        remainingMs: remaining,
        deadlineAt: null,
      };
      return appendLog(next, now, 'power', '断电，现场状态已冻结（剩余时长已保存）');
    }

    case 'power-on': {
      if (state.status !== 'powered-off') {
        return ignore(state, now, `无法恢复供电：当前状态为「${statusLabel(state.status)}」`);
      }
      const step = currentStep(state);
      if (!step) return ignore(state, now, '恢复失败：当前步骤缺失');

      // 恢复守卫 1：当前步骤之前有未完成的必看步骤 → 重定向，绝不绕过
      const guard = firstIncompleteMandatoryBefore(state, stepIndex(state.flow, step.id));
      if (guard) {
        const resolution = resolveEntry(state, guard.id);
        if (resolution.ok) {
          return enterStep(
            state,
            resolution.stepId,
            now,
            `恢复守卫：必看步骤「${guard.title}」尚未完成，已重定向（不绕过必经步骤）`,
          );
        }
        const blockedState: FlowState = {
          ...state,
          status: 'blocked',
          powerOffFrom: null,
          blocked: { pendingStepId: guard.id, reason: resolution.reason },
        };
        return appendLog(blockedState, now, 'block', `恢复被阻断：${resolution.reason}`);
      }

      // 恢复守卫 2：当前步骤本身就是未完成的必看步骤 → 完整重播
      if (step.mandatory && !state.steps[step.id]?.completed) {
        return enterStep(state, step.id, now, '恢复守卫：必看步骤未看完，完整重播');
      }

      // 恢复守卫 3：当前步骤的前置条件被篡改/丢失 → 阻断而不是硬闯
      const missing = missingRequires(state, step);
      if (missing.length > 0) {
        const reason = `缺少前置条件：${missing.map((f) => factLabel(state.flow, f)).join('、')}`;
        const blockedState: FlowState = {
          ...state,
          status: 'blocked',
          powerOffFrom: null,
          blocked: { pendingStepId: step.id, reason },
        };
        return appendLog(blockedState, now, 'block', `恢复被阻断：${reason}`);
      }

      // 正常恢复：还原断电前状态，计时从断点继续
      if (state.powerOffFrom === 'paused') {
        const next: FlowState = { ...state, status: 'paused', powerOffFrom: null };
        return appendLog(next, now, 'power', '恢复供电，回到无障碍暂停状态');
      }
      if (state.powerOffFrom === 'blocked') {
        const next: FlowState = { ...state, status: 'blocked', powerOffFrom: null };
        return appendLog(next, now, 'power', '恢复供电，回到被阻断状态（原因保留）');
      }
      const next: FlowState = {
        ...state,
        status: 'running',
        powerOffFrom: null,
        deadlineAt: step.dwellMs > 0 ? now + state.remainingMs : null,
      };
      return appendLog(
        next,
        now,
        'power',
        `恢复供电，从「${step.title}」断点继续（剩余 ${Math.ceil(state.remainingMs / 1000)} 秒）`,
      );
    }

    case 'jump': {
      if (state.status === 'powered-off') {
        return ignore(state, now, '断电中，无法跳转');
      }
      const resolution = resolveEntry(state, event.stepId);
      if (!resolution.ok) {
        const target = getStep(state.flow, event.stepId);
        const next: FlowState = {
          ...state,
          status: 'blocked',
          blocked: { pendingStepId: event.stepId, reason: resolution.reason },
        };
        return appendLog(
          next,
          now,
          'block',
          `跳转${target ? `至「${target.title}」` : ''}被阻断：${resolution.reason}`,
        );
      }
      const note = resolution.redirectedFrom
        ? '跳转被必经步骤守卫重定向'
        : event.stepId === state.currentStepId
          ? '重播当前页'
          : '手动跳转';
      return enterStep(state, resolution.stepId, now, note);
    }

    case 'replace-step': {
      const replacement = event.step;
      if (!replacement.title.trim()) {
        return ignore(state, now, '替换失败：页面标题不能为空');
      }
      if (!Number.isFinite(replacement.dwellMs) || replacement.dwellMs < 0) {
        return ignore(state, now, '替换失败：停留时长必须是不小于 0 的数字');
      }
      const idx = stepIndex(state.flow, replacement.id);
      if (idx < 0) {
        return ignore(state, now, `替换失败：步骤 ${replacement.id} 不存在`);
      }
      const steps = [...state.flow.steps];
      steps[idx] = replacement;
      let next: FlowState = { ...state, flow: { ...state.flow, steps } };
      // 替换的是当前页：收敛剩余时长并重设计时
      if (state.currentStepId === replacement.id) {
        const remainingMs = Math.min(state.remainingMs, replacement.dwellMs);
        next = {
          ...next,
          remainingMs,
          deadlineAt:
            state.status === 'running' && replacement.dwellMs > 0 ? now + remainingMs : null,
        };
      }
      next = appendLog(
        next,
        now,
        'edit',
        `已替换页面「${replacement.title}」（${replacement.id}）`,
      );
      // 处于阻断时重新校验，提示是否已可继续
      if (next.status === 'blocked' && next.blocked) {
        const resolution = resolveEntry(next, next.blocked.pendingStepId);
        if (resolution.ok) {
          next = appendLog(next, now, 'edit', '页面替换后阻断条件已解除，按「下一步」继续');
        }
      }
      return next;
    }

    case 'inject-fault': {
      // 复现事故现场：旧控制器在讲解中途切换展厅，跳过必看安全提示后断电。
      // 该事件刻意构造出“不一致”状态，用于验收恢复守卫。
      const flow = state.flow;
      const mandatoryIdx = flow.steps.findIndex((s) => s.mandatory && !s.skippable);
      if (mandatoryIdx < 0) {
        return ignore(state, now, '当前流程没有必看步骤，无法注入故障现场');
      }
      const targetIdx = Math.min(mandatoryIdx + 3, flow.steps.length - 1);
      const target = flow.steps[targetIdx];
      const facts: Record<string, true> = {};
      const steps: Record<string, StepRuntime> = {};
      flow.steps.forEach((s, i) => {
        if (i < mandatoryIdx) {
          steps[s.id] = { visits: 1, completions: 1, completed: true };
          for (const g of s.grants) facts[g] = true;
        } else {
          steps[s.id] = { visits: i === targetIdx ? 1 : 0, completions: 0, completed: false };
        }
      });
      const next: FlowState = {
        ...state,
        status: 'powered-off',
        powerOffFrom: 'running',
        currentStepId: target.id,
        currentEpoch: state.currentEpoch + 1,
        facts,
        steps,
        remainingMs: 0,
        deadlineAt: null,
        blocked: null,
      };
      return appendLog(
        next,
        now,
        'power',
        `故障注入：旧控制器在讲解中途切换至「${target.title}」，必看步骤被跳过，随后断电`,
      );
    }

    case 'reset': {
      const fresh = initialState(state.flow, now);
      return appendLog(fresh, now, 'reset', '流程已重置（保留页面编辑）');
    }

    default: {
      return state;
    }
  }
}

/**
 * 重新武装计时器：用于撤销/重做与刷新恢复后，
 * 让“运行中”的状态基于保存的剩余时长重建截止时间。
 * 同时递增 epoch，使此前调度的一切定时器回执失效（幂等）。
 */
export function rearmTimer(state: FlowState, now: number): FlowState {
  if (state.status !== 'running') return state;
  const step = getStep(state.flow, state.currentStepId);
  if (!step || step.dwellMs <= 0) return state;
  return {
    ...state,
    currentEpoch: state.currentEpoch + 1,
    deadlineAt: now + state.remainingMs,
  };
}

// ---------- 内部辅助 ----------

function currentStep(state: FlowState): FlowStep | undefined {
  return getStep(state.flow, state.currentStepId);
}

function withinDebounce(state: FlowState, now: number): boolean {
  return now - state.lastAdvanceAt < ADVANCE_DEBOUNCE_MS;
}

function appendLog(state: FlowState, now: number, kind: LogKind, message: string): FlowState {
  const entry: LogEntry = { at: now, kind, message };
  const log = [...state.log, entry];
  return { ...state, log: log.length > MAX_LOG ? log.slice(log.length - MAX_LOG) : log };
}

/** 被拦截的事件：计入 ignoredEvents 并写日志，状态其余部分不变 */
function ignore(state: FlowState, now: number, message: string): FlowState {
  return appendLog({ ...state, ignoredEvents: state.ignoredEvents + 1 }, now, 'ignore', message);
}

function enterStep(state: FlowState, stepId: string, now: number, note?: string): FlowState {
  const step = getStep(state.flow, stepId);
  if (!step) return ignore(state, now, `无法进入不存在的步骤：${stepId}`);
  const runtime = state.steps[step.id] ?? { ...EMPTY_RUNTIME };
  const next: FlowState = {
    ...state,
    status: 'running',
    currentStepId: step.id,
    currentEpoch: state.currentEpoch + 1,
    remainingMs: step.dwellMs,
    deadlineAt: step.dwellMs > 0 ? now + step.dwellMs : null,
    blocked: null,
    powerOffFrom: null,
    steps: { ...state.steps, [step.id]: { ...runtime, visits: runtime.visits + 1 } },
  };
  return appendLog(
    next,
    now,
    'enter',
    `进入「${step.title}」（屏 ${step.screen}）${note ? ` — ${note}` : ''}`,
  );
}

type AdvanceCause = 'timeout' | 'next' | 'touch';

/**
 * 完成当前步骤并推进：
 * - 事实记录是集合语义，重复完成不会重复记录（幂等）；
 * - 推进目标经过进入校验，前置条件不满足则进入阻断态（记录原因）。
 */
function completeCurrent(state: FlowState, now: number, cause: AdvanceCause): FlowState {
  const step = currentStep(state);
  if (!step) return ignore(state, now, '无法完成：当前步骤缺失');
  const runtime = state.steps[step.id] ?? { ...EMPTY_RUNTIME };
  const facts = { ...state.facts };
  const newFacts: string[] = [];
  for (const g of step.grants) {
    if (!facts[g]) newFacts.push(g);
    facts[g] = true;
  }
  let next: FlowState = {
    ...state,
    facts,
    remainingMs: 0,
    deadlineAt: null,
    lastAdvanceAt: cause === 'timeout' ? state.lastAdvanceAt : now,
    steps: {
      ...state.steps,
      [step.id]: { ...runtime, completed: true, completions: runtime.completions + 1 },
    },
  };
  next = appendLog(
    next,
    now,
    'complete',
    newFacts.length > 0
      ? `完成「${step.title}」，记录事实：${newFacts.map((f) => factLabel(state.flow, f)).join('、')}`
      : `完成「${step.title}」（事实已记录，幂等跳过）`,
  );

  const idx = stepIndex(state.flow, step.id);
  const upcoming = state.flow.steps[idx + 1];
  if (!upcoming) {
    next = { ...next, status: 'finished' };
    return appendLog(next, now, 'finish', '流程结束，全部步骤已完成');
  }
  const resolution = resolveEntry(next, upcoming.id);
  if (!resolution.ok) {
    next = {
      ...next,
      status: 'blocked',
      blocked: { pendingStepId: upcoming.id, reason: resolution.reason },
    };
    return appendLog(next, now, 'block', `推进被阻断：${resolution.reason}`);
  }
  return enterStep(
    next,
    resolution.stepId,
    now,
    resolution.redirectedFrom ? '被必经步骤守卫重定向' : undefined,
  );
}
