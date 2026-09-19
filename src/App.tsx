import { useCallback, useEffect, useRef, useState } from 'react';
import { SimScreen } from './components/SimScreen';
import { Controls } from './components/Controls';
import { Timeline } from './components/Timeline';
import { FactsPanel } from './components/FactsPanel';
import { RecoveryDiffPanel } from './components/RecoveryDiffPanel';
import { ScreenEditor } from './components/ScreenEditor';
import { EventLog } from './components/EventLog';
import {
  acknowledge,
  advance,
  dismissDiff,
  jumpTo,
  KIOSKS,
  pause,
  persistKiosk,
  powerOff,
  powerOn,
  redo,
  replaceScreen,
  reset,
  restoreKiosk,
  resume,
  start,
  tick,
  undo,
  setSpeed,
  type Kiosk,
} from './state/kiosk';

type KioskMap = Record<string, Kiosk>;

function initialKiosks(): KioskMap {
  const map: KioskMap = {};
  for (const k of KIOSKS) {
    map[k.id] = restoreKiosk(k.id, k.name);
  }
  return map;
}

export function App() {
  const [kiosks, setKiosks] = useState<KioskMap>(initialKiosks);
  const [activeId, setActiveId] = useState(KIOSKS[0].id);
  const active = kiosks[activeId];
  const { flow, state } = active.history.present;

  const update = useCallback((id: string, fn: (k: Kiosk) => Kiosk) => {
    setKiosks((prev) => {
      const next = fn(prev[id]);
      return next === prev[id] ? prev : { ...prev, [id]: next };
    });
  }, []);

  /* 模拟时钟：200ms 一拍，按各屏倍速推进，三块屏独立计时 */
  const speedsRef = useRef<Record<string, number>>({});
  speedsRef.current = Object.fromEntries(
    KIOSKS.map((k) => [k.id, kiosks[k.id].speed]),
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      setKiosks((prev) => {
        let changed = false;
        const nextMap: KioskMap = { ...prev };
        for (const meta of KIOSKS) {
          const next = tick(prev[meta.id], 200 * speedsRef.current[meta.id]);
          if (next !== prev[meta.id]) {
            changed = true;
            nextMap[meta.id] = next;
          }
        }
        return changed ? nextMap : prev;
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  /* 本地持久化：状态变化即写 localStorage，刷新/重开走冷启动门禁 */
  useEffect(() => {
    for (const k of KIOSKS) persistKiosk(kiosks[k.id]);
  }, [kiosks]);

  const act = useCallback(
    (fn: (k: Kiosk) => Kiosk) => update(activeId, fn),
    [activeId, update],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>KioskFlow 展示终端流程验收台</h1>
        <p>
          三块互动屏 · 浏览器本地运行 · 内置「海岸生态展」流程（自动播放 / 人工讲解交错）。
          可模拟触摸、下一步、超时、无障碍暂停与断电恢复，所有跳过必经步骤的操作都会被守卫阻断。
        </p>
      </header>

      <nav className="kiosk-tabs">
        {KIOSKS.map((k) => {
          const st = kiosks[k.id].history.present.state.status;
          return (
            <button
              key={k.id}
              className={`kiosk-tab ${k.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(k.id)}
            >
              <span className={`dot ${st}`} />
              {k.name}
            </button>
          );
        })}
      </nav>

      <div className="workspace">
        <div>
          <SimScreen
            flow={flow}
            state={state}
            onTouch={(nonce) => act((k) => acknowledge(k, nonce))}
          />
          <div className="status-strip">
            <span>当前屏幕：<b>{state.currentIndex >= 0 ? flow.screens[state.currentIndex].title : '—'}</b></span>
            <span>模拟时钟：<b>{state.clock}ms</b></span>
            <span>本页停留：<b>{state.elapsedMs}ms</b></span>
            <span>事件序号：<b>{state.seq}</b></span>
            <span>触摸 nonce：<b>{state.pendingAck || '—'}</b></span>
          </div>

          <Controls
            state={state}
            speed={active.speed}
            canUndo={active.history.past.length > 0}
            canRedo={active.history.future.length > 0}
            onStart={() => act(start)}
            onAdvance={() => act(advance)}
            onPause={() => act(pause)}
            onResume={() => act(resume)}
            onPowerOff={() => act(powerOff)}
            onPowerOn={() => act(powerOn)}
            onReset={() => act(reset)}
            onUndo={() => act(undo)}
            onRedo={() => act(redo)}
            onSpeed={(s) => act((k) => setSpeed(k, s))}
          />

          <div className="panel">
            <h2>故障点演练</h2>
            <div className="btn-row">
              <button
                className="btn warn"
                disabled={state.status === 'off' || state.status === 'idle' || state.facts.includes('ack:touchpool-rules')}
                onClick={() => act((k) => jumpTo(k, 5))}
                title="不确认触摸池规则，直接跳到喂食演示页"
              >
                ⚠ 强进喂食演示（跳过规则确认 → 应被阻断）
              </button>
              <button
                className="btn danger"
                disabled={state.status === 'off' || state.status === 'idle' || state.status === 'completed'}
                onClick={() => act((k) => powerOff(k))}
              >
                ⏻ 讲解中途断电（随后点「上电恢复」查看回退）
              </button>
            </div>
          </div>

          <Timeline
            flow={flow}
            state={state}
            onJump={(i) => act((k) => jumpTo(k, i))}
          />
        </div>

        <div>
          <RecoveryDiffPanel
            flow={flow}
            preBoot={active.preBoot}
            diff={active.diff}
            onDismiss={() => act(dismissDiff)}
          />
          <FactsPanel flow={flow} state={state} />
          <ScreenEditor
            key={
              activeId +
              ':' +
              flow.screens.map((s) => s.title + s.mode + s.durationMs + (s.prompt?.required ? 1 : 0)).join('|')
            }
            flow={flow}
            currentIndex={Math.max(0, state.currentIndex)}
            disabled={state.status === 'off'}
            onReplace={(i, screen) => act((k) => replaceScreen(k, i, screen))}
          />
          <EventLog log={state.log} />
        </div>
      </div>
    </div>
  );
}
