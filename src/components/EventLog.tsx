import type { LogEntry } from '../engine/types';

export function EventLog({ log }: { log: LogEntry[] }) {
  const entries = [...log].reverse().slice(0, 60);
  return (
    <div className="panel">
      <h2>事件日志（最近 {entries.length} 条）</h2>
      <div className="log-box">
        {entries.length === 0 && <p className="empty-hint">尚无事件</p>}
        {entries.map((e) => (
          <div key={e.seq} className={`log-entry ${e.event}`}>
            <span className="t">{String(e.at).padStart(6, '0')}ms</span>
            <b>{e.event}</b>
            {e.detail ? <span> — {e.detail}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
