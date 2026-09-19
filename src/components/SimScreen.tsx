import type { FlowDef, FlowState } from '../engine/types';

interface Props {
  flow: FlowDef;
  state: FlowState;
  onTouch: (nonce: number) => void;
}

const STATUS_TEXT: Record<FlowState['status'], string> = {
  idle: '待启动',
  running: '播放中',
  paused: '无障碍暂停',
  interrupted: '等待安全确认',
  off: '断电',
  completed: '已完成',
};

export function SimScreen({ flow, state, onTouch }: Props) {
  if (state.status === 'off') {
    return (
      <div className="sim-screen off">
        <div style={{ fontSize: 46 }}>⏻</div>
        <div>设备已断电 · 上电后将执行冷启动安全检查</div>
      </div>
    );
  }

  if (state.status === 'idle' || state.currentIndex < 0) {
    return (
      <div className="sim-screen idle">
        <div style={{ fontSize: 40 }}>🌊</div>
        <h2 style={{ margin: '10px 0 6px' }}>{flow.name}</h2>
        <p className="empty-hint">流程待启动，点击右侧「开始流程」</p>
      </div>
    );
  }

  const screen = flow.screens[state.currentIndex];
  const pct = Math.min(100, (state.elapsedMs / screen.durationMs) * 100);
  const showPrompt = state.status === 'interrupted' && screen.prompt;

  return (
    <div className="sim-screen">
      <div className="screen-top">
        <span>
          {state.currentIndex + 1} / {flow.screens.length} · {STATUS_TEXT[state.status]}
        </span>
        <span className={`badge ${screen.mode}`}>
          {screen.mode === 'auto' ? '自动播放' : '人工讲解'}
        </span>
      </div>

      <div className="screen-title">{screen.title}</div>
      <div className="screen-content">{screen.content}</div>

      {state.status === 'paused' && (
        <div className="manual-hint" style={{ color: 'var(--warn)' }}>
          ⏸ 已暂停（计时冻结），恢复后继续
        </div>
      )}
      {screen.mode === 'manual' && state.status === 'running' && (
        <div className="manual-hint">人工讲解中 · 计时不会自动翻页，请用「下一步」</div>
      )}

      <div className="progress">
        <div style={{ width: `${screen.mode === 'manual' ? 0 : pct}%` }} />
      </div>

      {showPrompt && (
        <div className={`prompt-overlay ${screen.prompt!.required ? 'required' : ''}`}>
          <div className="prompt-icon">{screen.prompt!.required ? '⚠️' : '🙌'}</div>
          <h3>{screen.prompt!.title}</h3>
          <p>{screen.prompt!.body}</p>
          <button className="touch-btn" onClick={() => onTouch(state.pendingAck)}>
            👆 {screen.prompt!.acknowledgeText}
          </button>
          {screen.prompt!.required && (
            <p className="empty-hint" style={{ marginTop: 12 }}>
              强制安全提示 · 断电恢复后必须重新确认
            </p>
          )}
        </div>
      )}

      {state.status === 'interrupted' && !screen.prompt && state.blocked && (
        <div className="prompt-overlay required">
          <div className="prompt-icon">⛔</div>
          <h3>恢复拦截：必经步骤缺失</h3>
          <p>{state.blocked.message}</p>
          <p className="empty-hint">
            计时与下一步均已锁定。请工作人员使用「撤销」回到先前页面补齐步骤，或「重置」流程。
          </p>
        </div>
      )}
    </div>
  );
}
