import type { FlowState } from '../core/types';
import { formatMs, getStep, statusLabel } from '../core/flow';

interface RecoveryPair {
  before: FlowState;
  after: FlowState;
}

interface Props {
  recovery: RecoveryPair;
  onDismiss: () => void;
}

/** 恢复前后差异：断电时冻结的现场 vs 恢复供电后的实际状态 */
export function RecoveryDiff({ recovery, onDismiss }: Props) {
  const { before, after } = recovery;
  const bStep = getStep(before.flow, before.currentStepId);
  const aStep = getStep(after.flow, after.currentStepId);
  const newFacts = Object.keys(after.facts).filter((f) => !before.facts[f]);
  const short = (fact: string) => after.flow.factLabels?.[fact] ?? fact;
  const rows: Array<{ label: string; beforeValue: string; afterValue: string }> = [
    {
      label: '当前步骤',
      beforeValue: bStep?.title ?? before.currentStepId,
      afterValue: aStep?.title ?? after.currentStepId,
    },
    {
      label: '所属屏幕',
      beforeValue: bStep ? `屏 ${bStep.screen}` : '—',
      afterValue: aStep ? `屏 ${aStep.screen}` : '—',
    },
    {
      label: '运行状态',
      beforeValue: statusLabel(before.status),
      afterValue: statusLabel(after.status),
    },
    {
      label: '停留剩余',
      beforeValue: formatMs(before.remainingMs),
      afterValue: formatMs(after.remainingMs),
    },
    {
      label: '已完成事实',
      beforeValue: `${Object.keys(before.facts).length} 项`,
      afterValue: `${Object.keys(after.facts).length} 项`,
    },
  ];
  return (
    <div className="panel recovery">
      <h2>恢复前后差异</h2>
      <table className="diff-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>恢复前（断电）</th>
            <th>恢复后（供电）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.beforeValue !== row.afterValue ? 'changed' : ''}>
              <td>{row.label}</td>
              <td>{row.beforeValue}</td>
              <td>{row.afterValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {newFacts.length > 0 && <p className="muted">新增事实：{newFacts.map(short).join('、')}</p>}
      {before.currentStepId !== after.currentStepId && (
        <p className="muted">
          恢复守卫介入：流程没有从未经校验的位置继续，而是回到「{aStep?.title}」。
        </p>
      )}
      <button type="button" onClick={onDismiss}>
        知道了
      </button>
    </div>
  );
}
