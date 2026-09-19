import { describe, expect, it } from 'vitest';
import { coastalFlow } from '../coastalFlow';
import { initialState, reduce } from '../reducer';

describe('流程阻断', () => {
  it('跳转到前置条件未满足的步骤被阻断，并记录原因', () => {
    const s0 = initialState(coastalFlow, 0);
    const s1 = reduce(s0, { type: 'jump', stepId: 'conservation' }, 1000);
    expect(s1.status).toBe('blocked');
    expect(s1.currentStepId).toBe('welcome'); // 原地不动
    expect(s1.blocked?.pendingStepId).toBe('conservation');
    expect(s1.blocked?.reason).toContain('缺少前置条件');
    expect(s1.log.some((e) => e.kind === 'block')).toBe(true);
  });

  it('阻断状态下重试仍然失败，跳到合法步骤才能解除', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'jump', stepId: 'conservation' }, 1000); // blocked
    const s2 = reduce(s, { type: 'next' }, 2000); // 重试 → 仍被阻断
    expect(s2.status).toBe('blocked');
    expect(s2.ignoredEvents).toBe(s.ignoredEvents + 1);
    const s3 = reduce(s2, { type: 'jump', stepId: 'welcome' }, 3000);
    expect(s3.status).toBe('running');
    expect(s3.blocked).toBeNull();
  });

  it('跳转不会绕过未完成的必看步骤，而是被重定向', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000); // 进入 safety（未看完）
    s = reduce(s, { type: 'jump', stepId: 'tide-pools' }, 7000);
    expect(s.currentStepId).toBe('safety'); // 被守卫重定向回必看步骤
    expect(s.status).toBe('running');
    expect(s.log.some((e) => e.message.includes('重定向'))).toBe(true);
    expect(s.facts['safety-viewed']).toBeUndefined();
  });

  it('自动推进遇到前置条件缺失时进入阻断，修复页面定义后可继续', () => {
    let s = initialState(coastalFlow, 0);
    // 模拟编辑失误：把 tide-pools 的前置条件改成不存在的事实
    const tidePools = coastalFlow.steps.find((x) => x.id === 'tide-pools')!;
    s = reduce(s, { type: 'replace-step', step: { ...tidePools, requires: ['ghost-fact'] } }, 500);
    s = reduce(s, { type: 'timeout', epoch: 1 }, 6000); // welcome → safety
    s = reduce(s, { type: 'timeout', epoch: 2 }, 14000); // safety 完成 → 推进被阻断
    expect(s.status).toBe('blocked');
    expect(s.currentStepId).toBe('safety');
    expect(s.blocked?.pendingStepId).toBe('tide-pools');
    expect(s.blocked?.reason).toContain('ghost-fact');
    // 修复页面定义
    s = reduce(s, { type: 'replace-step', step: tidePools }, 15000);
    expect(s.log.some((e) => e.message.includes('阻断条件已解除'))).toBe(true);
    // 重试推进
    s = reduce(s, { type: 'next' }, 16000);
    expect(s.status).toBe('running');
    expect(s.currentStepId).toBe('tide-pools');
  });

  it('阻断原因随断电冻结，恢复供电后原样保留', () => {
    let s = initialState(coastalFlow, 0);
    s = reduce(s, { type: 'jump', stepId: 'conservation' }, 1000); // blocked
    s = reduce(s, { type: 'power-off' }, 2000);
    expect(s.status).toBe('powered-off');
    s = reduce(s, { type: 'power-on' }, 3000);
    expect(s.status).toBe('blocked');
    expect(s.blocked?.reason).toContain('缺少前置条件');
  });
});
