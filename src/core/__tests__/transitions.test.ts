import { describe, expect, it } from 'vitest';
import { coastalFlow } from '../coastalFlow';
import { initialState, reduce } from '../reducer';

describe('状态转换', () => {
  it('初始状态进入第一页并开始计时', () => {
    const s = initialState(coastalFlow, 0);
    expect(s.status).toBe('running');
    expect(s.currentStepId).toBe('welcome');
    expect(s.currentEpoch).toBe(1);
    expect(s.remainingMs).toBe(6000);
    expect(s.deadlineAt).toBe(6000);
    expect(s.steps.welcome.visits).toBe(1);
    expect(s.facts).toEqual({});
  });

  it('超时完成自动播放页：记录事实并推进到下一页', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'timeout', epoch: s0.currentEpoch }, 6000);
    expect(s1.status).toBe('running');
    expect(s1.currentStepId).toBe('safety');
    expect(s1.facts.welcomed).toBe(true);
    expect(s1.steps.welcome.completed).toBe(true);
    expect(s1.remainingMs).toBe(8000);
    expect(s1.deadlineAt).toBe(14000);
  });

  it('必看步骤不可跳过：next 被拦截，状态不变', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'timeout', epoch: s0.currentEpoch }, 6000); // → safety
    const s2 = reduce(s1, { type: 'next' }, 7000);
    expect(s2.currentStepId).toBe('safety');
    expect(s2.ignoredEvents).toBe(1);
    expect(s2.facts['safety-viewed']).toBeUndefined();
    expect(s2.log.some((e) => e.kind === 'ignore' && e.message.includes('必看'))).toBe(true);
  });

  it('自动播放页不响应触摸', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'touch' }, 1000);
    expect(s1.currentStepId).toBe('welcome');
    expect(s1.ignoredEvents).toBe(1);
  });

  it('可跳过的自动播放页可用 next 提前完成', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'next' }, 2000);
    expect(s1.currentStepId).toBe('safety');
    expect(s1.facts.welcomed).toBe(true);
  });

  it('人工讲解页用触摸推进，互动页用触摸完成', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000); // → safety
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000); // → tide-pools
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000); // → coral-narration
    expect(s.currentStepId).toBe('coral-narration');
    expect(s.deadlineAt).toBeNull(); // 人工讲解不计时
    s = reduce(s, { type: 'touch' }, 25000);
    expect(s.currentStepId).toBe('touchpool');
    expect(s.facts['coral-narrated']).toBe(true);
    s = reduce(s, { type: 'touch' }, 26000);
    expect(s.currentStepId).toBe('conservation');
    expect(s.facts['touchpool-done']).toBe(true);
  });

  it('完整流程可以一路走到结束，事实全部记录', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000);
    s = reduce(s, { type: 'touch' }, 25000);
    s = reduce(s, { type: 'touch' }, 26000);
    s = reduce(s, { type: 'next' }, 27000); // conservation → finale
    expect(s.currentStepId).toBe('finale');
    s = reduce(s, { type: 'timeout', epoch: s.currentEpoch }, 35000);
    expect(s.status).toBe('finished');
    expect(Object.keys(s.facts)).toHaveLength(7);
    for (const step of coastalFlow.steps) {
      expect(s.steps[step.id].completed).toBe(true);
    }
  });

  it('流程结束后的事件被拦截', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000);
    s = reduce(s, { type: 'touch' }, 25000);
    s = reduce(s, { type: 'touch' }, 26000);
    s = reduce(s, { type: 'next' }, 27000);
    s = reduce(s, { type: 'timeout', epoch: s.currentEpoch }, 35000);
    expect(s.status).toBe('finished');
    const after = reduce(s, { type: 'next' }, 36000);
    expect(after.status).toBe('finished');
    expect(after.ignoredEvents).toBe(s.ignoredEvents + 1);
  });

  it('跳转到当前页 = 重播：visits 增加，计时重置', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'jump', stepId: 'welcome' }, 3000);
    expect(s1.currentStepId).toBe('welcome');
    expect(s1.steps.welcome.visits).toBe(2);
    expect(s1.currentEpoch).toBe(2);
    expect(s1.remainingMs).toBe(6000);
    expect(s1.deadlineAt).toBe(9000);
  });
});
