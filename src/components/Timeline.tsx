import type { FlowDef, FlowState } from '../engine/types';

interface Props {
  flow: FlowDef;
  state: FlowState;
  onJump: (index: number) => void;
}

export function Timeline({ flow, state, onJump }: Props) {
  const blockedTarget = state.blocked?.targetScreenId ?? null;
  return (
    <div className="panel">
      <h2>流程时间线（点击可跳转 · 仍受前置条件守卫）</h2>
      <div className="timeline">
        {flow.screens.map((screen) => {
          const done = state.visitedScreenIds.includes(screen.id);
          const current = state.currentIndex === screen.index;
          const blocked = blockedTarget === screen.id;
          const classes = ['tl-node'];
          if (current) classes.push('current');
          if (done) classes.push('done');
          if (blocked) classes.push('blocked');
          if (screen.mode === 'manual') classes.push('manual');
          return (
            <button
              key={screen.id}
              className={classes.join(' ')}
              title={screen.title}
              onClick={() => onJump(screen.index)}
            >
              <span className="idx">
                {screen.index + 1}
                {screen.prompt ? (screen.prompt.required ? '⚠' : '•') : ''}
              </span>
              {screen.title.split(/ · |\s/).slice(-1)[0]}
              <span className="mark">
                {blocked ? '⛔' : current ? '▶' : done ? '✓' : screen.mode === 'manual' ? '🙋' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
