import { useState } from 'react';
import { screenDoneFact } from '../engine/engine';
import type { FlowDef, Screen, ScreenMode } from '../engine/types';

interface Props {
  flow: FlowDef;
  currentIndex: number;
  disabled: boolean;
  onReplace: (index: number, screen: Screen) => void;
}

/**
 * 「替换一页」：编辑某页的标题/正文/模式/时长/提示与前置条件。
 * 替换保持下标不变，可立即在时间线上跳转演练，整体支持撤销重做。
 */
export function ScreenEditor({ flow, currentIndex, disabled, onReplace }: Props) {
  const [index, setIndex] = useState(Math.max(0, currentIndex));
  const src = flow.screens[Math.min(index, flow.screens.length - 1)];
  const [title, setTitle] = useState(src.title);
  const [content, setContent] = useState(src.content);
  const [mode, setMode] = useState<ScreenMode>(src.mode);
  const [durationMs, setDurationMs] = useState(src.durationMs);
  const [hasPrompt, setHasPrompt] = useState(src.prompt !== null);
  const [required, setRequired] = useState(src.prompt?.required ?? false);
  const [promptTitle, setPromptTitle] = useState(src.prompt?.title ?? '提示');
  const [promptBody, setPromptBody] = useState(src.prompt?.body ?? '');
  const [requires, setRequires] = useState<string[]>(src.requires);

  // 可选前置事实 = 其他页面的完成事实与其他页提示事实
  const options: Array<{ id: string; label: string }> = [];
  for (const s of flow.screens) {
    if (s.index !== index) {
      if (s.prompt) options.push({ id: s.prompt.factId, label: `确认「${s.prompt.title}」` });
      options.push({ id: screenDoneFact(s.id), label: `看完「${s.title}」` });
    }
  }

  const selectPage = (i: number) => {
    const sc = flow.screens[i];
    setIndex(i);
    setTitle(sc.title);
    setContent(sc.content);
    setMode(sc.mode);
    setDurationMs(sc.durationMs);
    setHasPrompt(sc.prompt !== null);
    setRequired(sc.prompt?.required ?? false);
    setPromptTitle(sc.prompt?.title ?? '提示');
    setPromptBody(sc.prompt?.body ?? '');
    setRequires(sc.requires);
  };

  const apply = () => {
    const screen: Screen = {
      ...src,
      title: title.trim() || src.title,
      content,
      mode,
      durationMs: Math.max(500, durationMs),
      requires,
      prompt: hasPrompt
        ? {
            factId: src.prompt?.factId ?? `ack:custom:${src.id}`,
            title: promptTitle.trim() || '提示',
            body: promptBody,
            acknowledgeText: src.prompt?.acknowledgeText ?? '我已知晓',
            required,
          }
        : null,
    };
    onReplace(index, screen);
  };

  const toggleRequire = (id: string) =>
    setRequires((rs) => (rs.includes(id) ? rs.filter((r) => r !== id) : [...rs, id]));

  return (
    <div className="panel">
      <h2>替换一页（验收编辑）</h2>
      <div className="editor-grid">
        <label>
          目标页面
          <select value={index} onChange={(e) => selectPage(Number(e.target.value))}>
            {flow.screens.map((s) => (
              <option key={s.id} value={s.index}>
                #{s.index + 1} {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          播放模式
          <select value={mode} onChange={(e) => setMode(e.target.value as ScreenMode)}>
            <option value="auto">自动播放（到时翻页）</option>
            <option value="manual">人工讲解（需下一步）</option>
          </select>
        </label>
        <label className="full">
          标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="full">
          正文
          <textarea value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
        <label>
          停留时长 ms
          <input
            type="number"
            step={500}
            min={500}
            value={durationMs}
            onChange={(e) => setDurationMs(Number(e.target.value))}
          />
        </label>
        <label>
          可中断提示
          <select
            value={hasPrompt ? 'yes' : 'no'}
            onChange={(e) => setHasPrompt(e.target.value === 'yes')}
          >
            <option value="no">无提示</option>
            <option value="yes">有提示</option>
          </select>
        </label>
        {hasPrompt && (
          <>
            <label>
              提示标题
              <input value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} />
            </label>
            <label style={{ justifyContent: 'flex-end' }}>
              强制安全提示（冷启动重验）
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
            </label>
            <label className="full">
              提示正文
              <textarea value={promptBody} onChange={(e) => setPromptBody(e.target.value)} />
            </label>
          </>
        )}
        <div className="full">
          <div className="empty-hint" style={{ marginBottom: 4 }}>前置条件（进入本页必须已有的事实）</div>
          <div className="requires-box">
            {options.map((o) => (
              <label key={o.id}>
                <input
                  type="checkbox"
                  checked={requires.includes(o.id)}
                  onChange={() => toggleRequire(o.id)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <button className="btn primary" style={{ marginTop: 12 }} disabled={disabled} onClick={apply}>
        应用替换（可撤销）
      </button>
    </div>
  );
}
