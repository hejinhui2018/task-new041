import type { FlowDef, FlowState } from './types';

/**
 * 浏览器本地持久化。每块互动屏（kiosk）一个键，
 * 同时保存最新运行快照与「断电前快照」用于恢复差异展示。
 */

const VERSION = 1;
const KEY_PREFIX = 'kioskflow:v1:';

export interface PersistedBundle {
  version: number;
  flow: FlowDef;
  state: FlowState;
  /** 断电瞬间（或刷新前最后一次）的状态，用于恢复前后差异 */
  preBoot: FlowState | null;
}

export function storageKey(kioskId: string): string {
  return `${KEY_PREFIX}${kioskId}`;
}

export function loadBundle(kioskId: string): PersistedBundle | null {
  try {
    const raw = localStorage.getItem(storageKey(kioskId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBundle;
    if (parsed.version !== VERSION || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBundle(kioskId: string, bundle: PersistedBundle): void {
  try {
    localStorage.setItem(storageKey(kioskId), JSON.stringify(bundle));
  } catch {
    // 隐私模式 / 配额不足时降级为纯内存运行
  }
}

export function clearBundle(kioskId: string): void {
  try {
    localStorage.removeItem(storageKey(kioskId));
  } catch {
    /* ignore */
  }
}
