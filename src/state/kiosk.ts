import { coastalFlow } from '../engine/coastalFlow';
import {
  coldBoot,
  createInitialState,
  diffRecovery,
  reduce,
  type RecoveryDiff,
} from '../engine/engine';
import {
  commit,
  initHistory,
  redo as historyRedo,
  undo as historyUndo,
  type History,
} from '../engine/history';
import type { Action, FlowDef, FlowState, Screen } from '../engine/types';
import { clearBundle, loadBundle, saveBundle } from '../engine/storage';

/** 撤销重做历史同时携带流程定义与运行状态，替换页面也可撤销 */
export interface SessionSnapshot {
  flow: FlowDef;
  state: FlowState;
}

export interface Kiosk {
  id: string;
  name: string;
  history: History<SessionSnapshot>;
  /** 断电 / 刷新前最后一次快照，用于恢复对比 */
  preBoot: FlowState | null;
  diff: RecoveryDiff | null;
  speed: number;
}

export const KIOSKS: Array<{ id: string; name: string }> = [
  { id: 'kiosk-a', name: '入口互动屏' },
  { id: 'kiosk-b', name: '序厅互动屏' },
  { id: 'kiosk-c', name: '尾厅互动屏' },
];

export function snapshot(flow: FlowDef, state: FlowState): SessionSnapshot {
  return { flow, state };
}

export function createKiosk(id: string, name: string, flow: FlowDef = coastalFlow): Kiosk {
  return {
    id,
    name,
    history: initHistory(snapshot(flow, createInitialState(flow.id))),
    preBoot: null,
    diff: null,
    speed: 1,
  };
}

const get = (k: Kiosk): SessionSnapshot => k.history.present;

/** 离散动作：统一进撤销栈；状态无变化则不入栈 */
function dispatchDiscrete(k: Kiosk, action: Action): Kiosk {
  const cur = get(k);
  const nextState = reduce(cur.flow, cur.state, action);
  if (nextState === cur.state) return k;
  return { ...k, history: commit(k.history, snapshot(cur.flow, nextState)) };
}

export const start = (k: Kiosk) => dispatchDiscrete(k, { type: 'START' });
export const acknowledge = (k: Kiosk, nonce: number) =>
  dispatchDiscrete(k, { type: 'ACK_PROMPT', nonce });
export const advance = (k: Kiosk) => dispatchDiscrete(k, { type: 'ADVANCE' });
export const pause = (k: Kiosk) => dispatchDiscrete(k, { type: 'PAUSE' });
export const resume = (k: Kiosk) => dispatchDiscrete(k, { type: 'RESUME' });
export const jumpTo = (k: Kiosk, index: number) =>
  dispatchDiscrete(k, { type: 'JUMP_TO', index });

/** 时钟推进：高频不进撤销栈，仅在发生跨页/状态翻转时落栈 */
export function tick(k: Kiosk, deltaMs: number): Kiosk {
  const cur = get(k);
  if (cur.state.status !== 'running') return k;
  const nextState = reduce(cur.flow, cur.state, { type: 'TICK', deltaMs });
  if (nextState === cur.state) return k;
  const crossed =
    nextState.currentIndex !== cur.state.currentIndex ||
    nextState.status !== cur.state.status;
  const history = crossed
    ? commit(k.history, snapshot(cur.flow, nextState))
    : { ...k.history, present: snapshot(cur.flow, nextState) };
  return { ...k, history };
}

export function powerOff(k: Kiosk): Kiosk {
  const cur = get(k);
  const nextState = reduce(cur.flow, cur.state, { type: 'POWER_OFF' });
  if (nextState === cur.state) return k;
  return {
    ...k,
    preBoot: cur.state,
    diff: null,
    history: commit(k.history, snapshot(cur.flow, nextState)),
  };
}

export function powerOn(k: Kiosk): Kiosk {
  const cur = get(k);
  if (cur.state.status !== 'off') return k;
  const nextState = coldBoot(cur.flow, cur.state);
  return {
    ...k,
    preBoot: cur.state,
    diff: diffRecovery(cur.flow, cur.state, nextState),
    history: commit(k.history, snapshot(cur.flow, nextState)),
  };
}

export function reset(k: Kiosk): Kiosk {
  const cur = get(k);
  const fresh = reduce(cur.flow, cur.state, { type: 'RESET' });
  clearBundle(k.id);
  return {
    ...k,
    preBoot: null,
    diff: null,
    history: commit(k.history, snapshot(cur.flow, fresh)),
  };
}

export function undo(k: Kiosk): Kiosk {
  if (k.history.past.length === 0) return k;
  return { ...k, history: historyUndo(k.history), diff: null };
}

export function redo(k: Kiosk): Kiosk {
  if (k.history.future.length === 0) return k;
  return { ...k, history: historyRedo(k.history), diff: null };
}

export function setSpeed(k: Kiosk, speed: number): Kiosk {
  return { ...k, speed };
}

export function dismissDiff(k: Kiosk): Kiosk {
  return { ...k, diff: null };
}

/** 替换一页定义；运行状态结构不变（按下标索引），整体可撤销 */
export function replaceScreen(k: Kiosk, index: number, screen: Screen): Kiosk {
  const cur = get(k);
  if (index < 0 || index >= cur.flow.screens.length) return k;
  const screens = cur.flow.screens.map((s, i) => (i === index ? screen : s));
  const flow: FlowDef = { ...cur.flow, screens };
  return { ...k, history: commit(k.history, snapshot(flow, cur.state)) };
}

/* --------------------------- 刷新（冷启动）恢复 --------------------------- */

/**
 * 应用启动时读取本地持久化：
 * 有运行中快照则一律走冷启动门禁（等价于设备重新上电），
 * 返回带恢复差异的 kiosk。
 */
export function restoreKiosk(id: string, name: string): Kiosk {
  const fresh = createKiosk(id, name);
  const bundle = loadBundle(id);
  if (!bundle) return fresh;

  const flow = bundle.flow ?? coastalFlow;
  const saved = bundle.state;
  if (!saved || saved.status === 'idle') {
    return {
      ...fresh,
      history: initHistory(snapshot(flow, saved ?? createInitialState(flow.id))),
    };
  }

  const booted = coldBoot(flow, saved);
  return {
    ...fresh,
    history: initHistory(snapshot(flow, booted)),
    preBoot: saved,
    diff: diffRecovery(flow, saved, booted),
  };
}

export function persistKiosk(k: Kiosk): void {
  const { flow, state } = get(k);
  saveBundle(k.id, { version: 1, flow, state, preBoot: k.preBoot });
}
