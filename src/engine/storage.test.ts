import { afterEach, describe, expect, it } from 'vitest';
import { clearBundle, loadBundle, saveBundle, storageKey, type PersistedBundle } from './storage';
import { coastalFlow } from './coastalFlow';
import { createInitialState } from './engine';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const original = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: original,
    configurable: true,
    writable: true,
  });
});

describe('本地持久化（刷新恢复）', () => {
  it('保存后可原样读回，键名按 kiosk 隔离', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    });
    const bundle: PersistedBundle = {
      version: 1,
      flow: coastalFlow,
      state: createInitialState(coastalFlow.id),
      preBoot: null,
    };
    saveBundle('kiosk-a', bundle);
    expect(storageKey('kiosk-a')).toContain('kiosk-a');
    expect(loadBundle('kiosk-b')).toBeNull();
    expect(loadBundle('kiosk-a')).toEqual(bundle);
  });

  it('损坏 / 版本不符的数据被安全忽略', () => {
    const store = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: store,
      configurable: true,
      writable: true,
    });
    store.setItem(storageKey('kiosk-a'), '{not-json');
    expect(loadBundle('kiosk-a')).toBeNull();
    saveBundle('kiosk-a', { version: 99, state: {} } as PersistedBundle);
    expect(loadBundle('kiosk-a')).toBeNull();
    clearBundle('kiosk-a');
    expect(loadBundle('kiosk-a')).toBeNull();
  });
});
