import type { FlowEvent, FlowState } from './types';
import { rearmTimer, reduce } from './reducer';

/**
 * 撤销/重做：以状态快照为基础的命令历史。
 * 恢复快照时重新武装计时器，使“回到过去”后计时行为可预期。
 */

export interface RecoveryPair {
  before: FlowState;
  after: FlowState;
}

export interface UndoableState {
  past: FlowState[];
  present: FlowState;
  future: FlowState[];
  /** 最近一次“恢复供电”的前后对照（用于恢复前后差异视图） */
  lastRecovery: RecoveryPair | null;
}

const HISTORY_LIMIT = 100;

export function initUndoable(present: FlowState): UndoableState {
  return { past: [], present, future: [], lastRecovery: null };
}

export function applyEvent(u: UndoableState, event: FlowEvent, now: number): UndoableState {
  const next = reduce(u.present, event, now);
  // 只在“真的从断电中恢复过来”时记录前后对照，忽略无效的 power-on
  const recovered =
    event.type === 'power-on' &&
    u.present.status === 'powered-off' &&
    next.status !== 'powered-off';
  return {
    past: [...u.past.slice(-(HISTORY_LIMIT - 1)), u.present],
    present: next,
    future: [],
    lastRecovery: recovered ? { before: u.present, after: next } : u.lastRecovery,
  };
}

export function undo(u: UndoableState, now: number): UndoableState {
  if (u.past.length === 0) return u;
  const previous = u.past[u.past.length - 1];
  return {
    ...u,
    past: u.past.slice(0, -1),
    present: rearmTimer(previous, now),
    future: [u.present, ...u.future],
  };
}

export function redo(u: UndoableState, now: number): UndoableState {
  if (u.future.length === 0) return u;
  const [next, ...rest] = u.future;
  return {
    ...u,
    past: [...u.past, u.present],
    present: rearmTimer(next, now),
    future: rest,
  };
}

export function clearRecovery(u: UndoableState): UndoableState {
  return { ...u, lastRecovery: null };
}
