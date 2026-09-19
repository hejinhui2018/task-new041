import type { LogEntry } from '../core/types';

const KIND_TAGS: Record<LogEntry['kind'], string> = {
  enter: '进入',
  complete: '完成',
  block: '阻断',
  ignore: '拦截',
  pause: '暂停',
  resume: '继续',
  power: '电源',
  edit: '编辑',
  reset: '重置',
  finish: '结束',
};

/** 事件日志：最新一条在最上面 */
export function EventLog({ log }: { log: LogEntry[] }) {
  const items = [...log].reverse();
  return (
    <div className="panel">
      <h2>事件日志</h2>
      <ol className="event-log">
        {items.map((e, i) => (
          <li key={`${e.at}-${log.length - i}`} className={`log-${e.kind}`}>
            <time>{new Date(e.at).toLocaleTimeString('zh-CN', { hour12: false })}</time>
            <em>{KIND_TAGS[e.kind]}</em>
            <span>{e.message}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
