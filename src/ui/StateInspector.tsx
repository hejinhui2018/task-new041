import type { FlowState } from '../core/types';
import { formatMs, getStep, statusLabel } from '../core/flow';

interface Props {
  state: FlowState;
  now: number;
}

/** 状态检查器：当前屏幕、已完成事实、被阻断的原因等验收指标 */
export function StateInspector({ state, now }: Props) {
  const step = getStep(state.flow, state.currentStepId);
  const remaining =
    state.status === 'running' && state.deadlineAt !== null
      ? Math.max(0, state.deadlineAt - now)
      : state.remainingMs;
  const facts = Object.keys(state.facts);
  const short = (fact: string) => state.flow.factLabels?.[fact] ?? fact;
  return (
    <div className="panel">
      <h2>运行状态</h2>
      <dl className="facts-grid">
        <div>
          <dt>当前屏幕</dt>
          <dd>{step ? `屏 ${step.screen}` : '—'}</dd>
        </div>
        <div>
          <dt>当前步骤</dt>
          <dd>{step?.title ?? '—'}</dd>
        </div>
        <div>
          <dt>运行状态</dt>
          <dd>
            <span className={`status-pill s-${state.status}`}>{statusLabel(state.status)}</span>
          </dd>
        </div>
        <div>
          <dt>停留剩余</dt>
          <dd>{step && step.dwellMs > 0 ? formatMs(remaining) : '人工推进'}</dd>
        </div>
        <div>
          <dt>进入轮次</dt>
          <dd>#{state.currentEpoch}</dd>
        </div>
        <div>
          <dt>幂等拦截</dt>
          <dd>{state.ignoredEvents} 次</dd>
        </div>
      </dl>
      <h3 className="subhead">已完成事实</h3>
      <div className="chips">
        {facts.length === 0 ? (
          <span className="muted">（暂无）</span>
        ) : (
          facts.map((f) => (
            <span key={f} className="chip">
              {short(f)}
            </span>
          ))
        )}
      </div>
      {state.blocked && (
        <div className="blocked-box">
          <strong>被阻断：{state.blocked.reason}</strong>
          <span>
            目标步骤「{state.blocked.pendingStepId}」。修复条件后按「下一步」重试，
            或在左侧流程图跳转到其他步骤。
          </span>
        </div>
      )}
    </div>
  );
}
