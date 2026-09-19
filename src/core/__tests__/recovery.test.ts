import { describe, expect, it } from 'vitest';
import { coastalFlow } from '../coastalFlow';
import { initialState, reduce } from '../reducer';
import { deserializeState, serializeState } from '../persistence';
import type { FlowState } from '../types';

describe('断电恢复', () => {
  it('运行中断电再恢复：同一页从断点继续，事实不丢', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000); // → safety
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000); // → tide-pools（截止 24000）
    s = reduce(s, { type: 'power-off' }, 17000); // 剩余 7000
    expect(s.status).toBe('powered-off');
    expect(s.remainingMs).toBe(7000);
    const factsBefore = { ...s.facts };
    s = reduce(s, { type: 'power-on' }, 50000);
    expect(s.status).toBe('running');
    expect(s.currentStepId).toBe('tide-pools');
    expect(s.remainingMs).toBe(7000);
    expect(s.deadlineAt).toBe(57000);
    expect(s.facts).toEqual(factsBefore);
  });

  it('事故现场：讲解中途切厅跳过安全提示后断电，恢复时被守卫重定向回必看步骤', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'inject-fault' }, 1000);
    expect(s.status).toBe('powered-off');
    expect(s.currentStepId).toBe('touchpool');
    expect(s.facts['safety-viewed']).toBeUndefined();
    expect(s.steps.safety.completed).toBe(false);
    // 恢复供电：不得从被跳过的位置继续，必须回到必看步骤
    s = reduce(s, { type: 'power-on' }, 2000);
    expect(s.status).toBe('running');
    expect(s.currentStepId).toBe('safety');
    expect(s.remainingMs).toBe(8000); // 完整重播
    expect(s.log.some((e) => e.kind === 'enter' && e.message.includes('恢复守卫'))).toBe(true);
    // 看完安全提示后，流程才能继续
    s = reduce(s, { type: 'timeout', epoch: s.currentEpoch }, 10000);
    expect(s.currentStepId).toBe('tide-pools');
    expect(s.facts['safety-viewed']).toBe(true);
  });

  it('必看步骤播放到一半断电：恢复后完整重播而不是接着放', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000); // → safety（截止 14000）
    s = reduce(s, { type: 'power-off' }, 9000); // 剩余 5000
    s = reduce(s, { type: 'power-on' }, 20000);
    expect(s.currentStepId).toBe('safety');
    expect(s.remainingMs).toBe(8000); // 从头重播，不是 5000
    expect(s.deadlineAt).toBe(28000);
    expect(s.steps.safety.visits).toBe(2);
  });

  it('前置条件被篡改时，恢复供电进入阻断而不是硬闯', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000); // → coral-narration
    const tampered: FlowState = {
      ...s,
      facts: { welcomed: true, 'safety-viewed': true }, // 删掉 tide-introduced
      status: 'powered-off',
      powerOffFrom: 'running',
      deadlineAt: null,
    };
    const restored = reduce(tampered, { type: 'power-on' }, 5000);
    expect(restored.status).toBe('blocked');
    expect(restored.blocked?.pendingStepId).toBe('coral-narration');
    expect(restored.blocked?.reason).toContain('tide-introduced');
    expect(restored.currentStepId).toBe('coral-narration');
  });

  it('快照往返：当前步骤、事实、计数完整恢复', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000); // → coral-narration
    const restored = deserializeState(serializeState(s, 25000), 60000);
    expect(restored.currentStepId).toBe('coral-narration');
    expect(restored.facts).toEqual(s.facts);
    expect(restored.status).toBe('running');
    expect(restored.ignoredEvents).toBe(s.ignoredEvents);
    expect(restored.steps['tide-pools'].completed).toBe(true);
  });

  it('损坏或被篡改的快照被拒绝', () => {
    expect(() => deserializeState('{"version":2}', 0)).toThrow();
    expect(() => deserializeState('not json', 0)).toThrow();
    const s = initialState(coastalFlow, 0);
    const ghost = { ...JSON.parse(serializeState(s, 0)), currentStepId: 'ghost' };
    expect(() => deserializeState(JSON.stringify(ghost), 0)).toThrow();
  });
});
