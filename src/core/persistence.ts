import type { FlowState } from './types';
import { rearmTimer } from './reducer';

/**
 * 持久化：状态快照写入 localStorage，刷新后恢复。
 * 快照只保存“剩余时长”，不保存绝对截止时间；
 * 恢复时基于当前时间重新武装计时器。
 */

export const STORAGE_KEY = 'kioskflow:v1';

export function serializeState(state: FlowState, now: number): string {
  // 运行中的状态先把截止时间换算回剩余时长，避免刷新后计时“偷跑”
  const remainingMs =
    state.status === 'running' && state.deadlineAt !== null
      ? Math.max(0, state.deadlineAt - now)
      : state.remainingMs;
  const snapshot: FlowState = { ...state, remainingMs, deadlineAt: null };
  return JSON.stringify(snapshot);
}

export function deserializeState(raw: string, now: number): FlowState {
  const parsed: unknown = JSON.parse(raw);
  return sanitizeState(parsed, now);
}

/** 校验并修复快照；非法快照直接抛错，由调用方回退到初始状态 */
export function sanitizeState(value: unknown, now: number): FlowState {
  const s = value as FlowState;
  if (!s || typeof s !== 'object') throw new Error('快照不是对象');
  if (s.version !== 1) throw new Error('快照版本不兼容');
  if (!s.flow || !Array.isArray(s.flow.steps) || s.flow.steps.length === 0) {
    throw new Error('流程定义缺失');
  }
  for (const step of s.flow.steps) {
    if (typeof step.id !== 'string' || typeof step.title !== 'string') {
      throw new Error('步骤定义不完整');
    }
    if (typeof step.dwellMs !== 'number' || !Number.isFinite(step.dwellMs) || step.dwellMs < 0) {
      throw new Error(`步骤 ${step.id} 的停留时长非法`);
    }
    if (!Array.isArray(step.requires) || !Array.isArray(step.grants)) {
      throw new Error(`步骤 ${step.id} 的前置条件/事实定义非法`);
    }
  }
  const ids = new Set(s.flow.steps.map((step) => step.id));
  if (ids.size !== s.flow.steps.length) throw new Error('步骤 id 重复');
  if (typeof s.currentStepId !== 'string' || !ids.has(s.currentStepId)) {
    throw new Error('当前步骤已失效');
  }
  const statuses: FlowState['status'][] = [
    'running',
    'paused',
    'blocked',
    'powered-off',
    'finished',
  ];
  if (!statuses.includes(s.status)) throw new Error('运行状态非法');

  // 运行时表修复：流程里每个步骤都必须有记录
  const steps: FlowState['steps'] = {};
  for (const step of s.flow.steps) {
    const rt = s.steps?.[step.id];
    steps[step.id] = {
      visits: toNonNegNumber(rt?.visits),
      completions: toNonNegNumber(rt?.completions),
      completed: rt?.completed === true,
    };
  }
  const facts: Record<string, true> = {};
  if (s.facts && typeof s.facts === 'object') {
    for (const [key, v] of Object.entries(s.facts)) {
      if (v === true) facts[key] = true;
    }
  }
  const restored: FlowState = {
    version: 1,
    flow: s.flow,
    status: s.status,
    currentStepId: s.currentStepId,
    currentEpoch: toNonNegNumber(s.currentEpoch),
    facts,
    steps,
    remainingMs: toNonNegNumber(s.remainingMs),
    deadlineAt: null,
    lastAdvanceAt: typeof s.lastAdvanceAt === 'number' ? s.lastAdvanceAt : Number.NEGATIVE_INFINITY,
    blocked:
      s.status === 'blocked' && s.blocked && typeof s.blocked.pendingStepId === 'string'
        ? { pendingStepId: s.blocked.pendingStepId, reason: String(s.blocked.reason ?? '') }
        : null,
    ignoredEvents: toNonNegNumber(s.ignoredEvents),
    powerOffFrom:
      s.powerOffFrom === 'running' || s.powerOffFrom === 'paused' || s.powerOffFrom === 'blocked'
        ? s.powerOffFrom
        : null,
    log: Array.isArray(s.log)
      ? s.log
          .filter(
            (e): e is FlowState['log'][number] =>
              !!e && typeof e.at === 'number' && typeof e.message === 'string',
          )
          .slice(-MAX_PERSISTED_LOG)
      : [],
  };
  if (restored.status === 'blocked' && !restored.blocked) {
    // 阻断信息丢失时不能假装还在阻断，回退到运行态由守卫重新校验
    restored.status = 'running';
  }
  // 运行中的状态：基于保存的剩余时长重新武装计时器（并递增 epoch 作废旧回执）
  return rearmTimer(restored, now);
}

export function loadState(now: number): FlowState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserializeState(raw, now);
  } catch {
    return null;
  }
}

export function saveState(state: FlowState, now: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeState(state, now));
  } catch {
    // 存储不可用（隐私模式等）时静默降级：功能不受影响，只是不持久化
  }
}

const MAX_PERSISTED_LOG = 200;

function toNonNegNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
