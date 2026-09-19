import { describe, expect, it } from 'vitest';
import { coastalFlow } from '../coastalFlow';
import { initialState, reduce } from '../reducer';

describe('幂等触发', () => {
  it('过期的定时器回执被丢弃，不会偷偷推进', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'timeout', epoch: 1 }, 6000); // → safety（epoch 变为 2）
    const s2 = reduce(s1, { type: 'timeout', epoch: 1 }, 6000); // 旧 epoch 的回执
    expect(s2.currentStepId).toBe('safety');
    expect(s2.ignoredEvents).toBe(1);
    expect(s2.facts['safety-viewed']).toBeUndefined();
  });

  it('同一轮次的重复超时只推进一次', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'timeout', epoch: 1 }, 6000);
    const s2 = reduce(s1, { type: 'timeout', epoch: 1 }, 6001);
    expect(s2.currentStepId).toBe('safety'); // 没有连跳两页
    expect(s2.steps.welcome.completions).toBe(1);
  });

  it('去抖窗口内的重复 next 只生效一次，窗口外正常推进', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000); // → coral-narration
    const t0 = 25000;
    s = reduce(s, { type: 'next' }, t0); // → touchpool
    expect(s.currentStepId).toBe('touchpool');
    s = reduce(s, { type: 'next' }, t0 + 100); // 去抖拦截
    expect(s.currentStepId).toBe('touchpool');
    expect(s.ignoredEvents).toBe(1);
    s = reduce(s, { type: 'next' }, t0 + 1000); // 窗口外，正常推进
    expect(s.currentStepId).toBe('conservation');
  });

  it('触摸屏的连击只完成一次互动', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000);
    s = reduce(s, { type: 'touch' }, 25000); // coral → touchpool
    s = reduce(s, { type: 'touch' }, 26000); // touchpool → conservation
    expect(s.currentStepId).toBe('conservation');
    s = reduce(s, { type: 'touch' }, 26100); // 连击被去抖
    expect(s.currentStepId).toBe('conservation');
    expect(s.steps.touchpool.completions).toBe(1);
    expect(s.ignoredEvents).toBe(1);
  });

  it('重复完成同一页：事实不重复记录，也不会多推进', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000); // welcome 完成 → safety
    const factsAfterFirst = Object.keys(s.facts);
    s = reduce(s, { type: 'jump', stepId: 'welcome' }, 7000); // 跳回重播
    s = reduce(s, { type: 'timeout', epoch: s.currentEpoch }, 13000); // 再次完成
    expect(Object.keys(s.facts)).toEqual(factsAfterFirst); // 事实集合不变
    expect(s.currentStepId).toBe('safety'); // 只推进到紧邻的下一页
    expect(s.steps.welcome.completions).toBe(2); // 完成次数如实记录
    expect(s.steps.welcome.visits).toBe(2);
  });

  it('无停留计时的步骤收到超时回执会被拦截', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000);
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000);
    s = reduce(s, { type: 'timeout', epoch: 3 }, 24000); // → coral-narration（dwell 0）
    const before = s;
    s = reduce(s, { type: 'timeout', epoch: s.currentEpoch }, 30000);
    expect(s.currentStepId).toBe('coral-narration');
    expect(s.ignoredEvents).toBe(before.ignoredEvents + 1);
  });
});
