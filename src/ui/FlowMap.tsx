import type { FlowState } from '../core/types';
import { KIND_LABELS } from '../core/flow';

interface Props {
  state: FlowState;
  onJump: (stepId: string) => void;
}

/** 流程编排图：展示每个页面的屏幕归属、类型、前置条件与完成状态，点击可跳转 */
export function FlowMap({ state, onJump }: Props) {
  const short = (fact: string) => state.flow.factLabels?.[fact] ?? fact;
  return (
    <div className="panel">
      <h2>流程编排</h2>
      <ol className="flow-list">
        {state.flow.steps.map((step, i) => {
          const rt = state.steps[step.id];
          const isCurrent = step.id === state.currentStepId;
          const isPending = state.blocked?.pendingStepId === step.id;
          const cls = [
            'flow-step',
            isCurrent ? 'current' : '',
            rt?.completed ? 'done' : '',
            isPending ? 'pending' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={step.id} className={cls}>
              <button
                type="button"
                onClick={() => onJump(step.id)}
                title="点击跳转（受前置条件与必经步骤守卫约束）"
              >
                <span className="step-index">{i + 1}</span>
                <span className="step-main">
                  <span className="step-title">{step.title}</span>
                  <span className="step-tags">
                    <em>屏 {step.screen}</em>
                    <em>{KIND_LABELS[step.kind]}</em>
                    {step.dwellMs > 0 ? <em>停留 {step.dwellMs / 1000}s</em> : <em>人工推进</em>}
                    {step.mandatory && <em className="tag-mandatory">必看</em>}
                    {!step.interruptible && <em className="tag-lock">不可中断</em>}
                    {!step.skippable && <em className="tag-lock">不可跳过</em>}
                  </span>
                  {(step.requires.length > 0 || step.grants.length > 0) && (
                    <span className="step-facts">
                      {step.requires.length > 0 && (
                        <span>需 {step.requires.map(short).join('、')}</span>
                      )}
                      {step.grants.length > 0 && (
                        <span>记 {step.grants.map(short).join('、')}</span>
                      )}
                    </span>
                  )}
                </span>
                <span className="step-status" aria-hidden>
                  {isPending ? '⚠' : isCurrent ? '▶' : rt?.completed ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="hint">点击任意步骤可跳转；系统会校验前置条件，并守卫未看完的必看步骤。</p>
    </div>
  );
}
