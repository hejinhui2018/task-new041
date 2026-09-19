import { useEffect, useState } from 'react';
import { coastalFlow } from './core/coastalFlow';
import { initialState } from './core/reducer';
import { loadState, saveState } from './core/persistence';
import type { FlowEvent } from './core/types';
import {
  applyEvent,
  initUndoable,
  redo,
  undo,
  type UndoableState,
} from './core/history';
import { FlowMap } from './ui/FlowMap';
import { KioskScreen } from './ui/KioskScreen';
import { Controls } from './ui/Controls';
import { StateInspector } from './ui/StateInspector';
import { StepEditor } from './ui/StepEditor';
import { EventLog } from './ui/EventLog';
import { RecoveryDiff } from './ui/RecoveryDiff';
import { FaultPanel } from './ui/FaultPanel';

/** 驱动界面上的倒计时等时间显示（不影响状态机，状态机的时间由事件携带） */
function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export default function App() {
  const [u, setU] = useState<UndoableState>(() => {
    const restored = loadState(Date.now());
    return initUndoable(restored ?? initialState(coastalFlow, Date.now()));
  });
  const now = useNow();
  const present = u.present;

  // 刷新恢复：每次状态变化都把快照写入 localStorage
  useEffect(() => {
    saveState(present, Date.now());
  }, [present]);

  // 定时器：运行中的自动播放步骤到点自动推进。
  // 回执携带调度时的 epoch；过期回执由状态机幂等丢弃，不会重复推进。
  useEffect(() => {
    if (present.status !== 'running' || present.deadlineAt === null) return;
    const epoch = present.currentEpoch;
    const delay = Math.max(0, present.deadlineAt - Date.now());
    const timer = window.setTimeout(() => {
      setU((prev) => applyEvent(prev, { type: 'timeout', epoch }, Date.now()));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [present.status, present.deadlineAt, present.currentEpoch]);

  const dispatch = (event: FlowEvent) => {
    setU((prev) => applyEvent(prev, event, Date.now()));
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>KioskFlow 展示终端流程验收台</h1>
          <p className="subtitle">
            {present.flow.title} · 全部本地运行 · 状态已持久化，刷新自动恢复
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => setU((prev) => undo(prev, Date.now()))}
            disabled={u.past.length === 0}
          >
            撤销（{u.past.length}）
          </button>
          <button
            type="button"
            onClick={() => setU((prev) => redo(prev, Date.now()))}
            disabled={u.future.length === 0}
          >
            重做（{u.future.length}）
          </button>
          <button type="button" className="danger" onClick={() => dispatch({ type: 'reset' })}>
            重置流程
          </button>
        </div>
      </header>
      <main className="layout">
        <section className="col">
          <FlowMap state={present} onJump={(stepId) => dispatch({ type: 'jump', stepId })} />
          <FaultPanel onInject={() => dispatch({ type: 'inject-fault' })} />
        </section>
        <section className="col">
          <KioskScreen state={present} now={now} onTouch={() => dispatch({ type: 'touch' })} />
          <Controls state={present} onEvent={dispatch} />
        </section>
        <section className="col">
          <StateInspector state={present} now={now} />
          {u.lastRecovery && (
            <RecoveryDiff
              recovery={u.lastRecovery}
              onDismiss={() => setU((prev) => ({ ...prev, lastRecovery: null }))}
            />
          )}
          <StepEditor
            state={present}
            onReplace={(step) => dispatch({ type: 'replace-step', step })}
          />
          <EventLog log={present.log} />
        </section>
      </main>
    </div>
  );
}
