import { screenDoneFact } from '../engine/engine';
import type { FlowDef, FlowState } from '../engine/types';

interface Props {
  flow: FlowDef;
  state: FlowState;
}

/** 当前流程里所有可能出现的事实，用于展示完成/缺失全貌 */
function allFacts(flow: FlowDef): Array<{ id: string; label: string; safety: boolean }> {
  const facts: Array<{ id: string; label: string; safety: boolean }> = [];
  for (const s of flow.screens) {
    if (s.prompt) {
      facts.push({
        id: s.prompt.factId,
        label: `确认提示 · ${s.prompt.title}`,
        safety: s.prompt.required,
      });
    }
    facts.push({
      id: screenDoneFact(s.id),
      label: `看完页面 · ${s.title}`,
      safety: false,
    });
  }
  return facts;
}

export function FactsPanel({ flow, state }: Props) {
  const have = new Set(state.facts);
  const all = allFacts(flow);
  return (
    <div className="panel">
      <h2>已完成事实（{state.facts.length}）</h2>
      <ul className="fact-list">
        {all.map((f) => {
          const ok = have.has(f.id);
          return (
            <li key={f.id} style={{ opacity: ok ? 1 : 0.55 }}>
              <span className="tick">{ok ? '✓' : '○'}</span>
              <span>
                {f.label}
                {f.safety && <em style={{ color: 'var(--warn)', fontStyle: 'normal' }}> · 强制安全</em>}
              </span>
            </li>
          );
        })}
      </ul>

      {state.blocked && (
        <div className="blocked-banner">
          <b>⛔ 流程阻断 [{state.blocked.action}]</b>
          <div>{state.blocked.message}</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            缺失事实：{state.blocked.missingFacts.join('，')}
          </div>
        </div>
      )}
    </div>
  );
}
