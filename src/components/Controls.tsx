import type { FlowState } from '../engine/types';

interface Props {
  state: FlowState;
  speed: number;
  onStart: () => void;
  onAdvance: () => void;
  onPause: () => void;
  onResume: () => void;
  onPowerOff: () => void;
  onPowerOn: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSpeed: (s: number) => void;
}

const SPEEDS = [1, 4, 16];

export function Controls(p: Props) {
  const s = p.state.status;
  return (
    <div className="panel">
      <h2>控制甲板</h2>
      <div className="btn-row">
        <button className="btn primary" disabled={s !== 'idle'} onClick={p.onStart}>
          ▶ 开始流程
        </button>
        <button
          className="btn"
          disabled={s !== 'running' || p.state.currentIndex < 0}
          onClick={p.onAdvance}
        >
          ⏭ 下一步
        </button>
        <button
          className="btn warn"
          disabled={s !== 'running' && s !== 'interrupted'}
          onClick={p.onPause}
        >
          ⏸ 无障碍暂停
        </button>
        <button className="btn" disabled={s !== 'paused'} onClick={p.onResume}>
          ⏯ 继续
        </button>
        <button className="btn danger" disabled={s === 'off' || s === 'idle' || s === 'completed'} onClick={p.onPowerOff}>
          ⏻ 断电
        </button>
        <button className="btn primary" disabled={s !== 'off'} onClick={p.onPowerOn}>
          ⚡ 上电恢复
        </button>
        <button className="btn" onClick={p.onReset}>
          ↺ 重置
        </button>

        <span className="btn-group-label">时间压缩</span>
        <span className="speed-group">
          {SPEEDS.map((v) => (
            <button
              key={v}
              className={`btn ${p.speed === v ? 'active' : ''}`}
              onClick={() => p.onSpeed(v)}
            >
              {v}×
            </button>
          ))}
        </span>

        <span className="btn-group-label">撤销 / 重做（跨页、触摸、断电、替换页面均可撤销）</span>
        <button className="btn" disabled={!p.canUndo} onClick={p.onUndo}>
          ⤺ 撤销
        </button>
        <button className="btn" disabled={!p.canRedo} onClick={p.onRedo}>
          ⤻ 重做
        </button>
      </div>
    </div>
  );
}
