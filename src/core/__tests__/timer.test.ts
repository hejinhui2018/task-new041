import { describe, expect, it } from 'vitest';
import { coastalFlow } from '../coastalFlow';
import { initialState, reduce } from '../reducer';
import { deserializeState, serializeState } from '../persistence';

describe('计时暂停', () => {
  it('暂停冻结剩余时长，继续后从暂停点精确恢复', () => {
    const s0 = initialState(coastalFlow, 0); // welcome，截止 6000
    const s1 = reduce(s0, { type: 'pause' }, 3000);
    expect(s1.status).toBe('paused');
    expect(s1.remainingMs).toBe(3000);
    expect(s1.deadlineAt).toBeNull();
    const s2 = reduce(s1, { type: 'resume' }, 10000);
    expect(s2.status).toBe('running');
    expect(s2.remainingMs).toBe(3000);
    expect(s2.deadlineAt).toBe(13000); // 10000 + 3000，分毫不差
  });

  it('暂停期间到达的超时回执被拦截，不会推进', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'pause' }, 3000);
    const s2 = reduce(s1, { type: 'timeout', epoch: s1.currentEpoch }, 4000);
    expect(s2.status).toBe('paused');
    expect(s2.currentStepId).toBe('welcome');
    expect(s2.ignoredEvents).toBe(1);
  });

  it('不可中断的必看页拒绝暂停，计时不受影响', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'timeout', epoch: 1 }, 6000); // → safety（不可中断）
    const s2 = reduce(s1, { type: 'pause' }, 7000);
    expect(s2.status).toBe('running');
    expect(s2.deadlineAt).toBe(14000);
    expect(s2.ignoredEvents).toBe(1);
  });

  it('断电冻结计时，恢复供电后从断点继续', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'power-off' }, 2000); // 剩余 4000
    expect(s1.status).toBe('powered-off');
    expect(s1.remainingMs).toBe(4000);
    expect(s1.deadlineAt).toBeNull();
    const s2 = reduce(s1, { type: 'power-on' }, 100000);
    expect(s2.status).toBe('running');
    expect(s2.remainingMs).toBe(4000);
    expect(s2.deadlineAt).toBe(104000);
  });

  it('暂停中断电，恢复供电后仍是暂停，剩余时长不变', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'pause' }, 3000);
    const s2 = reduce(s1, { type: 'power-off' }, 5000);
    expect(s2.status).toBe('powered-off');
    expect(s2.remainingMs).toBe(3000);
    const s3 = reduce(s2, { type: 'power-on' }, 90000);
    expect(s3.status).toBe('paused');
    expect(s3.remainingMs).toBe(3000);
    expect(s3.deadlineAt).toBeNull();
  });

  it('刷新恢复：序列化保存剩余时长，反序列化重新武装计时器并作废旧回执', () => {
    const s0 = initialState(coastalFlow, 0);
    const raw = serializeState(s0, 2500); // 剩余 3500
    const restored = deserializeState(raw, 10000);
    expect(restored.status).toBe('running');
    expect(restored.remainingMs).toBe(3500);
    expect(restored.deadlineAt).toBe(13500);
    expect(restored.currentEpoch).toBe(s0.currentEpoch + 1);
  });

  it('刷新恢复：暂停状态原样恢复，不会偷偷计时', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'pause' }, 3000);
    const restored = deserializeState(serializeState(s1, 4000), 50000);
    expect(restored.status).toBe('paused');
    expect(restored.remainingMs).toBe(3000);
    expect(restored.deadlineAt).toBeNull();
  });
});
