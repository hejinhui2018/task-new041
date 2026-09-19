/**
 * KioskFlow 核心类型定义
 *
 * 流程由「页面 (Screen)」组成：页面有停留时长、自动播放模式、
 * 前置条件（必须已完成的事实）与可中断提示（阻塞式安全提示，
 * 必须由观众触摸确认后才能继续）。
 */

export type ScreenMode = 'auto' | 'manual';

/** 可中断提示：页面进入后弹出，未确认前阻塞一切推进 */
export interface InterruptPrompt {
  /** 确认该提示后记录的事实 id；也作为守卫引用目标 */
  factId: string;
  title: string;
  body: string;
  /** 确认按钮文案，模拟触摸目标 */
  acknowledgeText: string;
  /** true = 强制安全提示：断电恢复后若未确认，必须重新确认，不可跳过 */
  required: boolean;
}

export interface Screen {
  id: string;
  index: number;
  title: string;
  /** 模拟屏上展示的正文 */
  content: string;
  mode: ScreenMode;
  /** 计划停留毫秒数（验收台会做时间压缩）；manual 页用作建议讲解时长 */
  durationMs: number;
  /** 进入该页面前必须已记录的事实；任一缺失则阻断并给出原因 */
  requires: string[];
  /** 进入页面时弹出的可中断提示；无则为 null */
  prompt: InterruptPrompt | null;
}

export interface FlowDef {
  id: string;
  name: string;
  /** 冷启动（刷新/断电恢复）后必须重新确认的强制安全提示事实 */
  safetyFacts: string[];
  screens: Screen[];
}

/* ------------------------------ 运行时状态 ------------------------------ */

export type RunStatus =
  | 'idle' // 尚未开始
  | 'running' // 播放中
  | 'paused' // 无障碍暂停
  | 'interrupted' // 被可中断提示（安全提示）阻塞
  | 'off' // 断电
  | 'completed'; // 全流程完成

export interface BlockedReason {
  /** 被阻断的动作，例如 ADVANCE / ENTER */
  action: string;
  /** 试图前往的页面 id */
  targetScreenId: string;
  /** 缺失的前置事实 id 列表 */
  missingFacts: string[];
  message: string;
  at: number;
}

export interface LogEntry {
  seq: number;
  at: number;
  event: string;
  detail?: string;
}

/**
 * 运行状态。pendingAck 是「同一块屏幕重复触发不能推进两次」的关键：
 * 一次触摸确认只消费一个 nonce，重复/陈旧触发不会再次生效。
 */
export interface FlowState {
  flowId: string;
  status: RunStatus;
  /** 当前屏幕下标；idle 时为 -1 */
  currentIndex: number;
  /** 已完成事实集合（提示确认、页面完成等） */
  facts: string[];
  /** 当前屏幕已停留的毫秒数（仅 running 时累加） */
  elapsedMs: number;
  /** 当前弹出提示是否已确认 */
  promptAcknowledged: boolean;
  /** 待消费的触摸 nonce；进入新页面/新提示时刷新 */
  pendingAck: number;
  /** 最近一次阻断原因（null = 未被阻断） */
  blocked: BlockedReason | null;
  /** 单调事件序号 */
  seq: number;
  /** 模拟时钟（ms） */
  clock: number;
  /** 断电时间戳；off 时记录，用于恢复报告 */
  poweredOffAt: number | null;
  /** 最近一次进入/恢复到当前屏幕的时刻 */
  enteredAt: number;
  /** 已完成页面 id 集合（去过且满足离开条件） */
  visitedScreenIds: string[];
  log: LogEntry[];
}

/* ------------------------------- Action -------------------------------- */

export type Action =
  | { type: 'START' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'ACK_PROMPT'; nonce: number }
  | { type: 'ADVANCE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'POWER_OFF' }
  /** 冷启动：按持久化快照恢复，safetyFacts 会被强制移除 */
  | { type: 'POWER_ON'; snapshot?: FlowState }
  | { type: 'RESET' }
  /** 验收台辅助：跳到指定下标（仍走前置条件守卫，可制造阻断） */
  | { type: 'JUMP_TO'; index: number };
