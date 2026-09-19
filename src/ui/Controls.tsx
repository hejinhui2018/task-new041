import type { FlowEvent, FlowState } from '../core/types';
import { getStep } from '../core/flow';

interface Props {
  state: FlowState;
  onEvent: (event: FlowEvent) => void;
}

/** 操作台：模拟触摸、下一步、超时、无障碍暂停与断电恢复 */
export function Controls({ state, onEvent }: Props) {
  const step = getStep(state.flow, state.currentStepId);
  const paused = state.status === 'paused';
  const poweredOff = state.status === 'powered-off';
  return (
    <div className="panel">
      <h2>操作台</h2>
      <div className="btn-grid">
        <button type="button" onClick={() => onEvent({ type: 'next' })}>
          下一步
        </button>
        <button
          type="button"
          onClick={() => onEvent({ type: 'timeout', epoch: state.currentEpoch })}
          disabled={!step || step.dwellMs <= 0}
          title="模拟当前页停留计时到点（与真实定时器回执完全等价）"
        >
          模拟停留超时
        </button>
        {paused ? (
          <button type="button" className="primary" onClick={() => onEvent({ type: 'resume' })}>
            继续播放
          </button>
        ) : (
          <button type="button" onClick={() => onEvent({ type: 'pause' })}>
            无障碍暂停
          </button>
        )}
        {poweredOff ? (
          <button type="button" className="primary" onClick={() => onEvent({ type: 'power-on' })}>
            恢复供电
          </button>
        ) : (
          <button type="button" className="danger" onClick={() => onEvent({ type: 'power-off' })}>
            断电
          </button>
        )}
      </div>
      <p className="hint">
        每个事件都经过状态机校验；被拦截的重复/非法触发会计入「幂等拦截」并写入日志。
      </p>
    </div>
  );
}
