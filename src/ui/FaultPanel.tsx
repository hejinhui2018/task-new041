interface Props {
  onInject: () => void;
}

/** 故障注入：一键复现“讲解中途切厅 + 跳过安全提示 + 断电”的事故现场 */
export function FaultPanel({ onInject }: Props) {
  return (
    <div className="panel fault">
      <h2>故障现场</h2>
      <p>
        复现事故：讲解员在珊瑚讲解中途切换到互动屏，旧控制器跳过了必看的安全提示，随后整机断电。
      </p>
      <p className="hint">
        注入后请按「恢复供电」：系统应把流程守卫回必看步骤，而不是从被跳过的位置继续。
        恢复结果会显示在「恢复前后差异」中。
      </p>
      <button type="button" className="danger" onClick={onInject}>
        注入故障现场（跳厅 + 断电）
      </button>
    </div>
  );
}
