import type { RecoveryDiff } from '../engine/engine';
import type { FlowDef } from '../engine/types';

interface Props {
  flow: FlowDef;
  preBoot: import('../engine/types').FlowState | null;
  diff: RecoveryDiff | null;
  onDismiss: () => void;
}

const screenName = (flow: FlowDef, id: string | null) =>
  id ? flow.screens.find((s) => s.id === id)?.title ?? id : '（未开始）';

export function RecoveryDiffPanel({ flow, preBoot, diff, onDismiss }: Props) {
  if (!diff || !preBoot) {
    return (
      <div className="panel">
        <h2>恢复前后差异</h2>
        <p className="empty-hint">
          执行「断电 → 上电恢复」或刷新页面后，这里会对比断电瞬间与冷启动恢复后的状态。
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>恢复前后差异</h2>
      <div className="diff-grid">
        <div className="diff-card">
          <h4>断电瞬间</h4>
          <div>{screenName(flow, diff.beforeScreenId)}</div>
          <div className="empty-hint">状态：{preBoot.status} · 时钟 {preBoot.clock}ms</div>
        </div>
        <div className="diff-arrow">→</div>
        <div className="diff-card">
          <h4>冷启动恢复后</h4>
          <div>{screenName(flow, diff.afterScreenId)}</div>
          <div className="empty-hint">
            状态：{diff.afterStatus} · 回退 {diff.rewoundPages} 页
          </div>
        </div>
      </div>
      <ul className="diff-reasons">
        {diff.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {diff.strippedFacts.length > 0 && (
        <ul className="fact-list" style={{ marginTop: 8 }}>
          {diff.strippedFacts.map((f) => (
            <li key={f}>
              <span className="stripped">✗ {f}</span>
              <span className="empty-hint">已强制失效，必须重新确认</span>
            </li>
          ))}
        </ul>
      )}
      <button className="btn" style={{ marginTop: 10 }} onClick={onDismiss}>
        知道了
      </button>
    </div>
  );
}
