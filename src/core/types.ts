/**
 * KioskFlow 核心领域类型。
 *
 * 设计原则：状态机全部收敛在纯函数里（不依赖 DOM / 时钟 / 存储），
 * 时间通过 `now` 参数注入，因此状态转换、计时暂停、幂等触发、
 * 断电恢复与流程阻断都可以被确定性地测试。
 */

/** 三块互动屏 */
export type ScreenId = 'A' | 'B' | 'C';

/** 步骤类型：自动播放 / 人工讲解 / 互动 */
export type StepKind = 'autoplay' | 'narration' | 'interactive';

/** 流程定义中的一个页面（步骤） */
export interface FlowStep {
  id: string;
  title: string;
  /** 所属互动屏 */
  screen: ScreenId;
  kind: StepKind;
  /** 停留时长（毫秒）。0 表示不自动推进，等待人工/触摸 */
  dwellMs: number;
  /** 前置条件：必须全部满足（事实已记录）才允许进入 */
  requires: string[];
  /** 完成本步骤后记录的事实 */
  grants: string[];
  /** 必看步骤：任何路径（跳转/恢复）都不得绕过未完成的必看步骤 */
  mandatory: boolean;
  /** 可中断提示：是否允许无障碍暂停 */
  interruptible: boolean;
  /** 是否允许“下一步”手动跳过 */
  skippable: boolean;
  /** 屏上正文 */
  body: string;
}

export interface FlowDefinition {
  id: string;
  title: string;
  steps: FlowStep[];
  /** 事实的可读名称（用于阻断原因等展示） */
  factLabels?: Record<string, string>;
}

export type RunStatus =
  | 'running' // 运行中（计时或等待输入）
  | 'paused' // 无障碍暂停
  | 'blocked' // 被阻断（前置条件不满足）
  | 'powered-off' // 断电
  | 'finished'; // 流程结束

/** 每个步骤的运行时信息 */
export interface StepRuntime {
  /** 进入次数 */
  visits: number;
  /** 完成次数（重复进入可重复完成，但事实记录是幂等的） */
  completions: number;
  /** 是否曾完成 */
  completed: boolean;
}

export type LogKind =
  | 'enter'
  | 'complete'
  | 'block'
  | 'ignore'
  | 'pause'
  | 'resume'
  | 'power'
  | 'edit'
  | 'reset'
  | 'finish';

export interface LogEntry {
  at: number;
  kind: LogKind;
  message: string;
}

/** 被阻断时记录的信息 */
export interface BlockedInfo {
  /** 原本要进入的步骤 */
  pendingStepId: string;
  /** 被阻断的原因 */
  reason: string;
}

export interface FlowState {
  version: 1;
  /** 流程定义随状态一起持久化，保证“替换一页”可撤销、可恢复 */
  flow: FlowDefinition;
  status: RunStatus;
  currentStepId: string;
  /**
   * 进入步骤的代数令牌：每次进入步骤 +1。
   * 定时器回执必须携带当时的 epoch，过期回执一律丢弃（幂等触发）。
   */
  currentEpoch: number;
  /** 已完成事实（集合语义，重复记录是 no-op） */
  facts: Record<string, true>;
  steps: Record<string, StepRuntime>;
  /** 当前步骤剩余停留时长（暂停/断电/刷新时的权威值） */
  remainingMs: number;
  /** 运行中的截止时间戳；暂停/断电/持久化时为 null */
  deadlineAt: number | null;
  /** 最近一次人工推进时间，用于触摸去抖（幂等） */
  lastAdvanceAt: number;
  blocked: BlockedInfo | null;
  /** 被拦截的重复/非法事件计数（验收指标） */
  ignoredEvents: number;
  /** 断电前的状态，供电恢复后原样还原 */
  powerOffFrom: 'running' | 'paused' | 'blocked' | null;
  log: LogEntry[];
}

/** 外部世界可以发给状态机的全部事件 */
export type FlowEvent =
  | { type: 'touch' } // 触摸屏幕
  | { type: 'next' } // 下一步
  | { type: 'timeout'; epoch: number } // 停留超时（携带调度时的 epoch）
  | { type: 'pause' } // 无障碍暂停
  | { type: 'resume' } // 暂停后继续
  | { type: 'power-off' } // 断电
  | { type: 'power-on' } // 恢复供电
  | { type: 'jump'; stepId: string } // 跳转到指定步骤（经受守卫校验）
  | { type: 'replace-step'; step: FlowStep } // 替换一页
  | { type: 'inject-fault' } // 注入故障现场（复现事故）
  | { type: 'reset' }; // 重置流程（保留页面编辑）
