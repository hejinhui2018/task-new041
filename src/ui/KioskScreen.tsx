import type { FlowState } from '../core/types';
import { KIND_LABELS, SCREEN_LABELS, formatMs, getStep, statusLabel } from '../core/flow';

interface Props {
  state: FlowState;
  now: number;
  onTouch: () => void;
}

/** 模拟的互动屏终端：显示当前页面、停留进度与各状态遮罩 */
export function KioskScreen({ state, now, onTouch }: Props) {
  const step = getStep(state.flow, state.currentStepId);
  const poweredOff = state.status === 'powered-off';
  let progress = 0;
  let remainLabel = '';
  if (step && step.dwellMs > 0) {
    const remaining =
      state.status === 'running' && state.deadlineAt !== null
        ? Math.max(0, state.deadlineAt - now)
        : state.remainingMs;
    progress = 1 - Math.min(1, remaining / step.dwellMs);
    remainLabel = `剩余 ${formatMs(remaining)}`;
  }
  return (
    <div className="panel kiosk-panel">
      <div className="screen-bar">
        {(['A', 'B', 'C'] as const).map((s) => (
          <span
            key={s}
            className={`screen-chip ${step?.screen === s && !poweredOff ? 'active' : ''}`}
          >
            {SCREEN_LABELS[s]}
          </span>
        ))}
      </div>
      <div className={`kiosk-screen ${poweredOff ? 'off' : ''}`}>
        {poweredOff ? (
          <div className="kiosk-off">
            <strong>已断电</strong>
            <span>现场状态已冻结，等待恢复供电</span>
          </div>
        ) : step ? (
          <>
            <div className="kiosk-top">
              <span>{KIND_LABELS[step.kind]}</span>
              <span>{statusLabel(state.status)}</span>
            </div>
            <h3>{step.title}</h3>
            <p className="kiosk-body">{step.body}</p>
            {step.dwellMs > 0 && (
              <div className="progress-row">
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <span className="remain">{remainLabel}</span>
              </div>
            )}
            {state.status === 'paused' && <div className="overlay">已暂停 · 无障碍</div>}
            {state.status === 'blocked' && <div className="overlay blocked">流程被阻断</div>}
            {state.status === 'finished' && <div className="overlay">流程已结束</div>}
          </>
        ) : (
          <div className="kiosk-off">
            <strong>步骤缺失</strong>
          </div>
        )}
      </div>
      <button type="button" className="touch-btn" onClick={onTouch} disabled={poweredOff}>
        触摸屏幕
      </button>
    </div>
  );
}
