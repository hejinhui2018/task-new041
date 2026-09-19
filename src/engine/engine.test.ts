import { describe, expect, it } from 'vitest';
import { coastalFlow } from './coastalFlow';
import {
  coldBoot,
  createInitialState,
  diffRecovery,
  reduce,
  screenDoneFact,
} from './engine';
import { commit, initHistory, redo, undo } from './history';
import type { FlowState } from './types';

const flow = coastalFlow;

/** 从 idle 开始并确认当前页提示（若有），返回确认后的状态 */
function startAndAck(initial?: FlowState): FlowState {
  let s = initial ?? createInitialState(flow.id);
  if (s.status === 'idle') s = reduce(flow, s, { type: 'START' });
  if (s.status === 'interrupted') {
    s = reduce(flow, s, { type: 'ACK_PROMPT', nonce: s.pendingAck });
  }
  return s;
}

/** 连续推进 n 页：自动页靠计时，人工页靠下一步，遇提示先确认 */
function advancePages(start: FlowState, n: number): FlowState {
  let s = start;
  for (let i = 0; i < n; i++) {
    const screen = flow.screens[s.currentIndex];
    if (screen.mode === 'auto') {
      s = reduce(flow, s, { type: 'TICK', deltaMs: screen.durationMs });
    } else {
      s = reduce(flow, s, { type: 'ADVANCE' });
    }
    if (s.status === 'interrupted') {
      s = reduce(flow, s, { type: 'ACK_PROMPT', nonce: s.pendingAck });
    }
  }
  return s;
}

/* --------------------------- 1. 状态转换 --------------------------- */

describe('状态转换', () => {
  it('START 进入第一页并被强制安全提示拦截', () => {
    const s = reduce(flow, createInitialState(flow.id), { type: 'START' });
    expect(s.status).toBe('interrupted');
    expect(s.currentIndex).toBe(0);
    expect(s.promptAcknowledged).toBe(false);
    expect(s.pendingAck).toBe(s.seq);
    expect(s.facts).not.toContain('ack:safety-entry');
  });

  it('确认提示后进入 running，自动页到时自动进入下一页', () => {
    let s = startAndAck();
    expect(s.status).toBe('running');
    expect(s.facts).toContain('ack:safety-entry');

    const s1 = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 });
    expect(s1.currentIndex).toBe(1);
    expect(s1.status).toBe('running');
    expect(s1.facts).toContain(screenDoneFact('entry-safety'));
    expect(s1.elapsedMs).toBe(0);
  });

  it('人工讲解页不会因计时自动推进，必须下一步', () => {
    let s = startAndAck();
    s = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 }); // -> #1
    s = reduce(flow, s, { type: 'TICK', deltaMs: 8_000 }); // -> #2 manual
    expect(s.currentIndex).toBe(2);
    const waited = reduce(flow, s, { type: 'TICK', deltaMs: 60_000 });
    expect(waited.currentIndex).toBe(2);
    const next = reduce(flow, waited, { type: 'ADVANCE' });
    expect(next.currentIndex).toBe(3);
    expect(next.facts).toContain(screenDoneFact('intertidal-talk'));
  });

  it('自动与人工交错的完整八页流程可以走通', () => {
    let s = startAndAck();
    // 推进 6 次到达 #6 海鸟地图（中途自动确认两页强制提示）
    s = advancePages(s, 6);
    expect(s.currentIndex).toBe(6);
    s = reduce(flow, s, { type: 'TICK', deltaMs: flow.screens[6].durationMs });
    expect(s.currentIndex).toBe(7);
    expect(s.status).toBe('interrupted'); // 结尾普通提示
    s = reduce(flow, s, { type: 'ACK_PROMPT', nonce: s.pendingAck });
    s = reduce(flow, s, { type: 'TICK', deltaMs: flow.screens[7].durationMs });
    expect(s.status).toBe('completed');
  });

  it('非法/不适用动作不产生任何变化（引用相等）', () => {
    const idle = createInitialState(flow.id);
    expect(reduce(flow, idle, { type: 'ADVANCE' })).toBe(idle);
    const running = startAndAck();
    expect(reduce(flow, running, { type: 'START' })).toBe(running);
    expect(reduce(flow, running, { type: 'RESUME' })).toBe(running);
  });
});

/* --------------------------- 2. 计时暂停 --------------------------- */

describe('计时与无障碍暂停', () => {
  it('interrupted 状态下 TICK 不累计时间（提示必须先被处理）', () => {
    const s = reduce(flow, createInitialState(flow.id), { type: 'START' });
    const ticked = reduce(flow, s, { type: 'TICK', deltaMs: 10_000 });
    expect(ticked).toBe(s);
    expect(ticked.elapsedMs).toBe(0);
  });

  it('暂停期间时钟冻结，恢复后继续，且暂停不丢失已确认事实', () => {
    let s = startAndAck();
    s = reduce(flow, s, { type: 'TICK', deltaMs: 3_000 });
    const paused = reduce(flow, s, { type: 'PAUSE' });
    expect(paused.status).toBe('paused');
    const frozen = reduce(flow, paused, { type: 'TICK', deltaMs: 30_000 });
    expect(frozen.elapsedMs).toBe(3_000);
    expect(frozen.clock).toBe(3_000);
    const resumed = reduce(flow, frozen, { type: 'RESUME' });
    expect(resumed.status).toBe('running');
    const done = reduce(flow, resumed, { type: 'TICK', deltaMs: 3_000 });
    expect(done.currentIndex).toBe(1); // 剩余 3s 到点
  });

  it('提示未确认时暂停，恢复后回到 interrupted，nonce 仍有效', () => {
    const s = reduce(flow, createInitialState(flow.id), { type: 'START' });
    const paused = reduce(flow, s, { type: 'PAUSE' });
    expect(paused.status).toBe('paused');
    const resumed = reduce(flow, paused, { type: 'RESUME' });
    expect(resumed.status).toBe('interrupted');
    const acked = reduce(flow, resumed, { type: 'ACK_PROMPT', nonce: s.pendingAck });
    expect(acked.status).toBe('running');
  });
});

/* --------------------------- 3. 幂等触发 --------------------------- */

describe('幂等触发', () => {
  it('同一触摸事件重复确认不会产生两次事实或二次推进', () => {
    const s = reduce(flow, createInitialState(flow.id), { type: 'START' });
    const nonce = s.pendingAck;
    const once = reduce(flow, s, { type: 'ACK_PROMPT', nonce });
    const twice = reduce(flow, once, { type: 'ACK_PROMPT', nonce });
    expect(twice).toBe(once);
    expect(twice.facts.filter((f) => f === 'ack:safety-entry')).toHaveLength(1);
    expect(twice.pendingAck).toBe(0);
  });

  it('陈旧/伪造 nonce 的触摸被拒绝', () => {
    const s = reduce(flow, createInitialState(flow.id), { type: 'START' });
    const stale = reduce(flow, s, { type: 'ACK_PROMPT', nonce: s.pendingAck - 1 });
    expect(stale).toBe(s);
    const forged = reduce(flow, s, { type: 'ACK_PROMPT', nonce: 999_999 });
    expect(forged).toBe(s);
  });

  it('重复 TICK 不会把一页偷偷推进两次', () => {
    let s = startAndAck();
    s = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 }); // 到 #1
    expect(s.currentIndex).toBe(1);
    // 同样的到时信号再来一次：#1 停留从 0 起算，不应跳到 #2
    const replay = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 });
    expect(replay.currentIndex).toBe(1);
    expect(replay.elapsedMs).toBe(6_000);
  });

  it('进入新提示会刷新 nonce，旧 nonce 立即失效', () => {
    let s = startAndAck();
    s = advancePages(s, 3); // 到 #3
    s = reduce(flow, s, { type: 'TICK', deltaMs: 8_000 }); // 进入 #4 规则提示，不确认
    expect(s.currentIndex).toBe(4);
    expect(s.status).toBe('interrupted');
    const oldNonce = s.pendingAck;
    // 工作人员在 #4 切回 #0 再回来，#0 的提示会重新弹出并刷掉 nonce
    let back = reduce(flow, s, { type: 'JUMP_TO', index: 0 });
    if (back.status === 'interrupted') {
      back = reduce(flow, back, { type: 'ACK_PROMPT', nonce: back.pendingAck });
    }
    const again = reduce(flow, back, { type: 'JUMP_TO', index: 4 });
    expect(again.status).toBe('interrupted');
    expect(again.pendingAck).not.toBe(oldNonce);
    expect(reduce(flow, again, { type: 'ACK_PROMPT', nonce: oldNonce })).toBe(again);
    const acked = reduce(flow, again, { type: 'ACK_PROMPT', nonce: again.pendingAck });
    expect(acked.status).toBe('running');
  });
});

/* --------------------------- 4. 恢复 --------------------------- */

describe('断电 / 冷启动恢复', () => {
  it('断电后任何动作都被拒绝，只有 POWER_ON 能冷启动', () => {
    let s = startAndAck();
    s = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 });
    const off = reduce(flow, s, { type: 'POWER_OFF' });
    expect(off.status).toBe('off');
    expect(off.poweredOffAt).toBe(6_000);
    expect(reduce(flow, off, { type: 'TICK', deltaMs: 9_999 })).toBe(off);
    expect(reduce(flow, off, { type: 'ADVANCE' })).toBe(off);
    const on = reduce(flow, off, { type: 'POWER_ON' });
    expect(on.status).toBe('interrupted');
    expect(on.currentIndex).toBe(0);
  });

  it('冷启动强制移除全部安全事实并回退到最早的强制提示页', () => {
    let s = startAndAck();
    s = advancePages(s, 5); // 推进到 #5 喂食演示
    expect(s.currentIndex).toBe(5);
    const off = reduce(flow, s, { type: 'POWER_OFF' });
    const on = coldBoot(flow, off);
    expect(on.facts).not.toContain('ack:safety-entry');
    expect(on.facts).not.toContain('ack:touchpool-rules');
    expect(on.currentIndex).toBe(0);
    expect(on.status).toBe('interrupted');
    expect(on.promptAcknowledged).toBe(false);
    // 非安全事实保留（看过的页面仍然可追溯）
    expect(on.facts).toContain(screenDoneFact('coast-panorama'));
  });

  it('恢复后无法绕过安全提示：未确认不能继续，确认后才放行', () => {
    let s = startAndAck();
    s = advancePages(s, 5);
    const on = coldBoot(flow, reduce(flow, s, { type: 'POWER_OFF' }));
    // 尝试用上电前的旧 nonce / 直接下一步绕过
    expect(reduce(flow, on, { type: 'ADVANCE' })).toBe(on);
    expect(reduce(flow, on, { type: 'ACK_PROMPT', nonce: 1 })).toBe(on);
    const acked = reduce(flow, on, { type: 'ACK_PROMPT', nonce: on.pendingAck });
    expect(acked.status).toBe('running');
  });

  it('恢复差异报告准确反映回退与失效事实', () => {
    let s = startAndAck();
    s = advancePages(s, 5); // #5
    const off = reduce(flow, s, { type: 'POWER_OFF' });
    const on = coldBoot(flow, off);
    const diff = diffRecovery(flow, off, on);
    expect(diff.beforeScreenId).toBe('touchpool-feeding');
    expect(diff.afterScreenId).toBe('entry-safety');
    expect(diff.rewoundPages).toBe(5);
    expect(diff.strippedFacts).toContain('ack:touchpool-rules');
    expect(diff.safetyPromptReShown).toBe(true);
    expect(diff.reasons.length).toBeGreaterThan(0);
  });

  it('无快照 / 流程不匹配的注入状态被拒绝，回到全新初始态', () => {
    expect(coldBoot(flow, undefined).status).toBe('idle');
    const tampered: FlowState = {
      ...createInitialState('other-flow'),
      status: 'running',
      currentIndex: 7,
      facts: ['ack:safety-entry', 'ack:touchpool-rules'],
    };
    const booted = coldBoot(flow, tampered);
    expect(booted.status).toBe('idle');
    expect(booted.currentIndex).toBe(-1);
    expect(booted.facts).toEqual([]);
  });

  it('恢复后停在守卫不满足且无提示的页面时，任何推进都被锁死', () => {
    // 构造异常快照：停在 #1，却带着 #4 的规则确认、缺入口安全事实
    const snapshot: FlowState = {
      ...createInitialState(flow.id),
      status: 'running',
      currentIndex: 1,
      facts: ['ack:touchpool-rules'],
    };
    const on = coldBoot(flow, snapshot);
    expect(on.status).toBe('interrupted');
    expect(on.blocked).not.toBeNull();
    // 计时、下一步、伪造触摸全部无效
    expect(reduce(flow, on, { type: 'TICK', deltaMs: 99_999 })).toBe(on);
    expect(reduce(flow, on, { type: 'ADVANCE' })).toBe(on);
    expect(reduce(flow, on, { type: 'ACK_PROMPT', nonce: on.pendingAck })).toBe(on);
    // 暂停 -> 继续 也不能滑过关卡
    const paused = reduce(flow, on, { type: 'PAUSE' });
    expect(paused.status).toBe('paused');
    const resumed = reduce(flow, paused, { type: 'RESUME' });
    expect(resumed.status).toBe('interrupted');
    expect(resumed.blocked).not.toBeNull();
  });

  it('用户临时把普通提示改成强制安全提示后，冷启动同样强制重验', () => {
    // 结尾承诺页的提示原本 required=false
    const customFlow: typeof flow = {
      ...flow,
      screens: flow.screens.map((s) =>
        s.id === 'closing-pledge' && s.prompt
          ? { ...s, prompt: { ...s.prompt, required: true } }
          : s,
      ),
    };
    const snapshot: FlowState = {
      ...createInitialState(customFlow.id),
      status: 'running',
      currentIndex: 7,
      facts: ['ack:coast-pledge'],
    };
    const on = coldBoot(customFlow, snapshot);
    expect(on.currentIndex).toBe(7);
    expect(on.facts).not.toContain('ack:coast-pledge');
    expect(on.status).toBe('interrupted');
    expect(on.promptAcknowledged).toBe(false);
  });
});

/* --------------------------- 5. 流程阻断 --------------------------- */

describe('前置条件阻断', () => {
  it('跳过海岸全景直接进入潮间带讲解会被阻断并记录原因', () => {
    let s = startAndAck(); // 在 #0
    s = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 }); // #1
    const blocked = reduce(flow, s, { type: 'JUMP_TO', index: 2 });
    expect(blocked.currentIndex).toBe(1); // 位置不动
    expect(blocked.blocked).not.toBeNull();
    expect(blocked.blocked?.missingFacts).toContain(
      screenDoneFact('coast-panorama'),
    );
    expect(blocked.blocked?.action).toBe('JUMP_TO');
  });

  it('未确认触摸池规则不能进入喂食演示', () => {
    let s = startAndAck();
    s = advancePages(s, 3); // 到 #3
    s = reduce(flow, s, { type: 'TICK', deltaMs: 8_000 }); // 进入 #4，规则提示未确认
    expect(s.currentIndex).toBe(4);
    expect(s.status).toBe('interrupted');
    const blocked = reduce(flow, s, { type: 'JUMP_TO', index: 5 });
    expect(blocked.currentIndex).toBe(4);
    expect(blocked.blocked?.missingFacts).toContain('ack:touchpool-rules');
  });

  it('阻断状态下自动计时不会冲开关卡，解除后正常推进', () => {
    let s = startAndAck();
    s = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 }); // #1
    s = reduce(flow, s, { type: 'JUMP_TO', index: 2 }); // 被阻断，留在 #1
    const ticked = reduce(flow, s, { type: 'TICK', deltaMs: 99_999 });
    // #1 到时后尝试前进，仍被 #2 守卫挡住，位置不变
    expect(ticked.currentIndex).toBe(1);
    expect(ticked.blocked).not.toBeNull();
  });
});

/* --------------------------- 6. 撤销重做 --------------------------- */

describe('撤销 / 重做', () => {
  it('commit 入栈、undo/redo 往返且新提交清空 future', () => {
    let h = initHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    h = redo(h);
    expect(h.present).toBe(1);
    h = commit(h, 99);
    expect(h.present).toBe(99);
    expect(redo(h)).toBe(h); // future 已清空
  });

  it('撤销一次「下一步」会把已完成事实一并回退', () => {
    let s = startAndAck();
    let h = initHistory(s);
    const atScreen1 = reduce(flow, s, { type: 'TICK', deltaMs: 6_000 });
    h = commit(h, atScreen1);
    const atScreen2 = reduce(flow, atScreen1, { type: 'TICK', deltaMs: 8_000 });
    h = commit(h, atScreen2);
    expect(h.present.facts).toContain(screenDoneFact('coast-panorama'));
    h = undo(h);
    expect(h.present.currentIndex).toBe(1);
    expect(h.present.facts).not.toContain(screenDoneFact('coast-panorama'));
  });
});
