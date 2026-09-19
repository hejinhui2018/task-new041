import type {
  Action,
  BlockedReason,
  FlowDef,
  FlowState,
  LogEntry,
  Screen,
} from './types';

export const SCREEN_DONE_PREFIX = 'screen-done:';
const LOG_LIMIT = 300;

export const screenDoneFact = (screenId: string) =>
  `${SCREEN_DONE_PREFIX}${screenId}`;

export function createInitialState(flowId: string): FlowState {
  return {
    flowId,
    status: 'idle',
    currentIndex: -1,
    facts: [],
    elapsedMs: 0,
    promptAcknowledged: true,
    pendingAck: 0,
    blocked: null,
    seq: 0,
    clock: 0,
    poweredOffAt: null,
    enteredAt: 0,
    visitedScreenIds: [],
    log: [],
  };
}

/* ------------------------------- 工具函数 ------------------------------- */

function factSet(facts: string[]): Set<string> {
  return new Set(facts);
}

export function missingRequires(screen: Screen, facts: string[]): string[] {
  const have = factSet(facts);
  return screen.requires.filter((f) => !have.has(f));
}

function appendLog(
  state: FlowState,
  event: string,
  detail?: string,
  atOverride?: number,
): { seq: number; log: LogEntry[] } {
  const seq = state.seq + 1;
  const entry: LogEntry = { seq, at: atOverride ?? state.clock, event, detail };
  const log = [...state.log, entry];
  if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
  return { seq, log };
}

function withLog(
  state: FlowState,
  patch: Partial<FlowState>,
  event: string,
  detail?: string,
): FlowState {
  const { seq, log } = appendLog(state, event, detail);
  return { ...state, ...patch, seq, log };
}

function addFact(facts: string[], fact: string): string[] {
  return facts.includes(fact) ? facts : [...facts, fact];
}

/**
 * 进入指定页面：先过前置条件守卫。
 * 守卫不通过时不移动位置，只登记阻断原因，返回原状态（blocked 已更新）。
 */
function enterScreen(
  flow: FlowDef,
  state: FlowState,
  index: number,
  action: string,
  detail?: string,
): FlowState {
  const screen = flow.screens[index];
  if (!screen) return state;

  const missing = missingRequires(screen, state.facts);
  if (missing.length > 0) {
    const reason: BlockedReason = {
      action,
      targetScreenId: screen.id,
      missingFacts: missing,
      message: `进入「${screen.title}」被阻断：缺少前置条件 ${missing
        .map((m) => factLabel(flow, m))
        .join('、')}`,
      at: state.clock,
    };
    return withLog(
      { ...state, blocked: reason },
      { blocked: reason },
      'BLOCKED',
      reason.message,
    );
  }

  const hasPrompt = screen.prompt !== null;
  // nonce 单调刷新：旧触摸事件携带的 nonce 立即失效，杜绝重复确认
  const { seq, log } = appendLog(
    state,
    'ENTER_SCREEN',
    `#${index + 1} ${screen.title}（${screen.mode === 'auto' ? '自动播放' : '人工讲解'}）${
      detail ? ' · ' + detail : ''
    }`,
  );
  return {
    ...state,
    currentIndex: index,
    elapsedMs: 0,
    promptAcknowledged: !hasPrompt,
    pendingAck: hasPrompt ? seq : 0,
    blocked: null,
    status: hasPrompt ? 'interrupted' : 'running',
    enteredAt: state.clock,
    seq,
    log,
  };
}

function completeScreen(state: FlowState, screen: Screen): FlowState {
  const facts = addFact(state.facts, screenDoneFact(screen.id));
  const visitedScreenIds = state.visitedScreenIds.includes(screen.id)
    ? state.visitedScreenIds
    : [...state.visitedScreenIds, screen.id];
  return { ...state, facts, visitedScreenIds };
}

/** 离开当前页（计时到点 / 下一步）：登记完成事实并尝试进入下一页 */
function leaveForward(flow: FlowDef, state: FlowState, cause: string): FlowState {
  const current = flow.screens[state.currentIndex];
  if (!current) return state;
  const completed = completeScreen(state, current);
  const nextIndex = current.index + 1;
  if (nextIndex >= flow.screens.length) {
    return withLog(
      { ...completed, status: 'completed' },
      { status: 'completed' },
      'FLOW_COMPLETED',
      `全部 ${flow.screens.length} 页播放完成`,
    );
  }
  const entered = enterScreen(flow, completed, nextIndex, 'ADVANCE');
  if (entered.blocked) {
    return withLog(entered, {}, 'ADVANCE_BLOCKED', `${cause} 后无法进入下一页`);
  }
  return withLog(entered, {}, 'SCREEN_DONE', `${current.title} · ${cause}`);
}

/* ------------------------------ 冷启动恢复 ------------------------------ */

export interface RecoveryDiff {
  /** 恢复前所在页（null=无快照） */
  beforeScreenId: string | null;
  /** 恢复后所在页 */
  afterScreenId: string | null;
  beforeStatus: FlowState['status'] | null;
  afterStatus: FlowState['status'];
  /** 冷启动被强制移除的安全事实 */
  strippedFacts: string[];
  /** 回退经过的页面数（0 = 留在原页） */
  rewoundPages: number;
  /** 恢复后是否正被强制安全提示拦住 */
  safetyPromptReShown: boolean;
  reasons: string[];
}

/**
 * 冷启动（上电 / 浏览器刷新）恢复。
 *
 * 规则：
 * 1. flowId 不匹配或无快照 => 全新初始状态，不接受任何外部状态注入。
 * 2. 强制安全事实（flow.safetyFacts）一律移除——断电后必须重新确认，
 *    无法通过保留旧快照绕过。
 * 3. 位置回退：只要被移除的安全事实是在某页的强制提示上确认的，
 *    就回到「最早的那一页」重新走必经路径，绝不留在后续页面。
 */
export function coldBoot(flow: FlowDef, snapshot: FlowState | undefined): FlowState {
  if (!snapshot || snapshot.flowId !== flow.id) {
    return createInitialState(flow.id);
  }

  const had = new Set(snapshot.facts);
  // 强制安全事实 = 流程静态清单 ∪ 所有 required 提示产出的事实
  // （后者覆盖验收台用户临时把某页提示改成强制安全提示的情况）
  const requiredPromptFacts = flow.screens
    .filter((s) => s.prompt?.required)
    .map((s) => s.prompt!.factId);
  const safetyFacts = Array.from(
    new Set([...flow.safetyFacts, ...requiredPromptFacts]),
  );
  const strippedFacts = safetyFacts.filter((f) => had.has(f));
  const facts = snapshot.facts.filter((f) => !safetyFacts.includes(f));

  // 提供被移除安全事实的页面（强制提示所在页），取最早一页
  const providerIndexes = flow.screens
    .filter(
      (s) =>
        s.prompt?.required &&
        s.prompt.factId &&
        strippedFacts.includes(s.prompt.factId),
    )
    .map((s) => s.index);
  const rewindTarget = providerIndexes.length ? Math.min(...providerIndexes) : null;

  let index = snapshot.currentIndex;
  if (index < 0 || index >= flow.screens.length) index = -1;
  if (rewindTarget !== null && rewindTarget < index) index = rewindTarget;

  let restored: FlowState = {
    ...createInitialState(flow.id),
    ...snapshot,
    facts,
    blocked: null,
    poweredOffAt: null,
  };

  if (index < 0) {
    // 断在开始之前：全新待启动
    return { ...restored, currentIndex: -1, status: 'idle' };
  }

  const screen = flow.screens[index];

  // 回退路径上当前页自身的守卫也要满足，否则继续拦截
  const missing = missingRequires(screen, facts);
  if (missing.length > 0) {
    const reason: BlockedReason = {
      action: 'POWER_ON',
      targetScreenId: screen.id,
      missingFacts: missing,
      message: `恢复后停在「${screen.title}」，但前置条件缺失：${missing.join('、')}`,
      at: snapshot.clock,
    };
    restored = { ...restored, currentIndex: index, blocked: reason };
  }

  // 当前页强制提示的安全事实被移除 => 重新弹出，恢复即拦截
  const promptActive =
    screen.prompt !== null &&
    screen.prompt.required &&
    strippedFacts.includes(screen.prompt.factId);

  // 守卫未满足且无提示可确认：进入拦截态等待工作人员处置（撤销/重置），
  // 不制造可被「继续」放行的暂停，也绝不允许计时或下一步滑过关卡
  const guardHeld = missing.length > 0 && !promptActive;

  const { seq, log } = appendLog(
    { ...restored, currentIndex: index },
    'COLD_BOOT',
    strippedFacts.length
      ? `冷启动：强制重验 ${strippedFacts.map((f) => factLabel(flow, f)).join('、')}`
      : '冷启动：无强制安全事实需要重验',
  );

  return {
    ...restored,
    currentIndex: index,
    seq,
    log,
    enteredAt: restored.clock,
    promptAcknowledged: promptActive ? false : restored.promptAcknowledged,
    pendingAck: promptActive ? seq : restored.pendingAck,
    status: promptActive
      ? 'interrupted'
      : guardHeld
        ? 'interrupted' // 无提示可确认的守卫拦截：TICK/ADVANCE/RESUME 均不放行
        : 'running',
  };
}

/** 对比断电瞬间快照与冷启动恢复后状态 */
export function diffRecovery(
  flow: FlowDef,
  before: FlowState | undefined,
  after: FlowState,
): RecoveryDiff {
  const strippedFacts =
    before?.facts.filter((f) => !after.facts.includes(f)) ?? [];
  const beforeScreen =
    before && before.currentIndex >= 0 ? flow.screens[before.currentIndex] : null;
  const afterScreen =
    after.currentIndex >= 0 ? flow.screens[after.currentIndex] : null;
  const rewoundPages =
    before && before.currentIndex >= 0 && after.currentIndex >= 0
      ? before.currentIndex - after.currentIndex
      : 0;
  const reasons: string[] = [];
  if (strippedFacts.length) {
    reasons.push(
      `强制安全事实已失效，需重新确认：${strippedFacts
        .map((f) => factLabel(flow, f))
        .join('、')}`,
    );
  }
  if (rewoundPages > 0) {
    reasons.push(`位置回退 ${rewoundPages} 页，重新经过必经步骤`);
  }
  if (after.status === 'interrupted') {
    reasons.push('恢复后立即停在安全提示，未确认前不能推进');
  }
  if (reasons.length === 0) reasons.push('无安全门禁触发，恢复到原播放位置');
  return {
    beforeScreenId: beforeScreen?.id ?? null,
    afterScreenId: afterScreen?.id ?? null,
    beforeStatus: before?.status ?? null,
    afterStatus: after.status,
    strippedFacts,
    rewoundPages,
    safetyPromptReShown: after.status === 'interrupted',
    reasons,
  };
}

function factLabel(flow: FlowDef, fact: string): string {
  if (fact.startsWith(SCREEN_DONE_PREFIX)) {
    const id = fact.slice(SCREEN_DONE_PREFIX.length);
    return `已看完「${flow.screens.find((s) => s.id === id)?.title ?? id}」`;
  }
  for (const s of flow.screens) {
    if (s.prompt?.factId === fact) return `已确认「${s.prompt.title}」`;
  }
  return fact;
}

/* -------------------------------- Reducer ------------------------------- */

export function reduce(
  flow: FlowDef,
  state: FlowState,
  action: Action,
): FlowState {
  switch (action.type) {
    case 'START': {
      if (state.status !== 'idle') return state;
      return enterScreen(flow, state, 0, 'START');
    }

    case 'TICK': {
      if (state.status !== 'running' || action.deltaMs <= 0) return state;
      const current = flow.screens[state.currentIndex];
      if (!current) return state;
      const delta = Math.min(action.deltaMs, 60_000); // 单步上限，避免跳帧穿透
      const clock = state.clock + delta;
      const elapsedMs = state.elapsedMs + delta;
      let next: FlowState = { ...state, clock, elapsedMs };

      // 自动播放页：到时自动推进，且只在阻断尚未清除时尝试一次
      if (
        current.mode === 'auto' &&
        state.blocked === null &&
        elapsedMs >= current.durationMs
      ) {
        next = leaveForward(flow, next, '停留到时自动播放');
      }
      return next;
    }

    case 'ACK_PROMPT': {
      const current = flow.screens[state.currentIndex];
      // 状态不符、nonce 不匹配（重复/陈旧触摸）一律无效，状态原样返回
      if (
        state.status !== 'interrupted' ||
        !current?.prompt ||
        state.promptAcknowledged ||
        action.nonce !== state.pendingAck
      ) {
        return state;
      }
      const facts = addFact(state.facts, current.prompt.factId);
      return withLog(
        state,
        {
          facts,
          promptAcknowledged: true,
          pendingAck: 0, // 立即消费，同一块屏幕再次触摸不会二次推进
          status: 'running',
          blocked: null,
        },
        'PROMPT_ACKED',
        `确认「${current.prompt.title}」`,
      );
    }

    case 'ADVANCE': {
      if (state.status !== 'running') return state;
      const current = flow.screens[state.currentIndex];
      if (!current) return state;
      if (current.prompt && !state.promptAcknowledged) {
        const reason: BlockedReason = {
          action: 'ADVANCE',
          targetScreenId: current.id,
          missingFacts: [current.prompt.factId],
          message: `「${current.title}」的安全提示尚未确认，不能进入下一步`,
          at: state.clock,
        };
        return withLog({ ...state, blocked: reason }, { blocked: reason }, 'BLOCKED', reason.message);
      }
      return leaveForward(flow, state, '手动下一步');
    }

    case 'PAUSE': {
      if (state.status !== 'running' && state.status !== 'interrupted') return state;
      return withLog({ ...state, status: 'paused' }, { status: 'paused' }, 'PAUSED', '无障碍暂停');
    }

    case 'RESUME': {
      if (state.status !== 'paused') return state;
      const current = flow.screens[state.currentIndex];
      const backToPrompt = current?.prompt !== null && !state.promptAcknowledged;
      // 恢复时若守卫仍未满足，继续保持拦截，不能靠暂停/继续滑过关卡
      const stillBlocked =
        current && state.blocked !== null
          ? missingRequires(current, state.facts).length > 0
          : false;
      const status = backToPrompt || stillBlocked ? 'interrupted' : 'running';
      return withLog(
        { ...state, status },
        { status },
        'RESUMED',
        backToPrompt
          ? '回到未确认的安全提示'
          : stillBlocked
            ? '前置条件仍缺失，维持拦截'
            : '继续播放',
      );
    }

    case 'POWER_OFF': {
      if (state.status === 'off' || state.status === 'idle' || state.status === 'completed') {
        return state;
      }
      return withLog(
        { ...state, status: 'off', poweredOffAt: state.clock },
        { status: 'off', poweredOffAt: state.clock },
        'POWER_OFF',
        `断电 @${state.clock}ms`,
      );
    }

    case 'POWER_ON': {
      if (state.status === 'off') {
        return coldBoot(flow, state);
      }
      // 也允许从快照直接冷启动（应用刷新入口使用）
      if (action.snapshot && state.status === 'idle') {
        return coldBoot(flow, action.snapshot);
      }
      return state;
    }

    case 'RESET': {
      return withLog(createInitialState(flow.id), {}, 'RESET', '流程已重置');
    }

    case 'JUMP_TO': {
      if (state.status === 'off' || state.status === 'idle' || state.status === 'completed') {
        return state;
      }
      if (action.index === state.currentIndex) return state;
      if (action.index < 0 || action.index >= flow.screens.length) return state;
      return enterScreen(flow, state, action.index, 'JUMP_TO', '工作人员跳转（故障点演练）');
    }

    default:
      return state;
  }
}
