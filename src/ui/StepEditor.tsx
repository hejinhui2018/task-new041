import { useEffect, useState } from 'react';
import type { FlowState, FlowStep, ScreenId, StepKind } from '../core/types';

interface Props {
  state: FlowState;
  onReplace: (step: FlowStep) => void;
}

function parseList(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 页面编辑器：选择一页，修改后整体替换（可撤销、可持久化） */
export function StepEditor({ state, onReplace }: Props) {
  const firstId = state.flow.steps[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(firstId);
  const selected = state.flow.steps.find((s) => s.id === selectedId) ?? state.flow.steps[0];
  const [draft, setDraft] = useState<FlowStep | null>(selected ?? null);
  const [requiresText, setRequiresText] = useState('');
  const [grantsText, setGrantsText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const step = state.flow.steps.find((s) => s.id === selectedId) ?? state.flow.steps[0];
    setDraft(step ? { ...step } : null);
    setRequiresText(step ? step.requires.join(', ') : '');
    setGrantsText(step ? step.grants.join(', ') : '');
    setError('');
  }, [selectedId, state.flow]);

  if (!draft || !selected) return null;

  const patch = (p: Partial<FlowStep>) => setDraft({ ...draft, ...p });

  const submit = () => {
    if (!draft.title.trim()) {
      setError('标题不能为空');
      return;
    }
    if (!Number.isFinite(draft.dwellMs) || draft.dwellMs < 0) {
      setError('停留时长必须是不小于 0 的数字');
      return;
    }
    onReplace({
      ...draft,
      title: draft.title.trim(),
      requires: parseList(requiresText),
      grants: parseList(grantsText),
    });
    setError('');
  };

  return (
    <div className="panel">
      <h2>替换一页</h2>
      <label className="field">
        <span>选择页面</span>
        <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>
          {state.flow.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}（{s.id}）
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>标题</span>
        <input
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>所属屏幕</span>
          <select
            value={draft.screen}
            onChange={(e) => patch({ screen: e.target.value as ScreenId })}
          >
            <option value="A">屏 A</option>
            <option value="B">屏 B</option>
            <option value="C">屏 C</option>
          </select>
        </label>
        <label className="field">
          <span>类型</span>
          <select
            value={draft.kind}
            onChange={(e) => patch({ kind: e.target.value as StepKind })}
          >
            <option value="autoplay">自动播放</option>
            <option value="narration">人工讲解</option>
            <option value="interactive">互动</option>
          </select>
        </label>
        <label className="field">
          <span>停留（秒）</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.dwellMs / 1000}
            onChange={(e) => patch({ dwellMs: Math.round(Number(e.target.value) * 1000) })}
          />
        </label>
      </div>
      <label className="field">
        <span>前置条件（事实 id，逗号分隔）</span>
        <input value={requiresText} onChange={(e) => setRequiresText(e.target.value)} />
      </label>
      <label className="field">
        <span>完成后记录的事实（逗号分隔）</span>
        <input value={grantsText} onChange={(e) => setGrantsText(e.target.value)} />
      </label>
      <div className="field-row checks">
        <label>
          <input
            type="checkbox"
            checked={draft.mandatory}
            onChange={(e) => patch({ mandatory: e.target.checked })}
          />
          必看
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.interruptible}
            onChange={(e) => patch({ interruptible: e.target.checked })}
          />
          可中断
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.skippable}
            onChange={(e) => patch({ skippable: e.target.checked })}
          />
          可跳过
        </label>
      </div>
      <label className="field">
        <span>屏上正文</span>
        <textarea rows={3} value={draft.body} onChange={(e) => patch({ body: e.target.value })} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="button" className="primary" onClick={submit}>
        替换此页
      </button>
      <p className="hint">替换当前页会收敛剩余停留时长；替换可撤销，并随快照持久化。</p>
    </div>
  );
}
