import type { FlowDefinition, FlowState, FlowStep, RunStatus, StepKind } from './types';

/** 人工推进去抖窗口：窗口内的重复 next/touch 视为同一次触发（幂等） */
export const ADVANCE_DEBOUNCE_MS = 350;

export function getStep(flow: FlowDefinition, stepId: string): FlowStep | undefined {
  return flow.steps.find((s) => s.id === stepId);
}

export function stepIndex(flow: FlowDefinition, stepId: string): number {
  return flow.steps.findIndex((s) => s.id === stepId);
}

/** 步骤尚未满足的前置条件 */
export function missingRequires(state: FlowState, step: FlowStep): string[] {
  return step.requires.filter((fact) => !state.facts[fact]);
}

/**
 * 必经步骤守卫：在流程顺序上位于 beforeIndex 之前、
 * 标记为必看且尚未完成的第一个步骤。
 */
export function firstIncompleteMandatoryBefore(
  state: FlowState,
  beforeIndex: number,
): FlowStep | null {
  const limit = Math.min(beforeIndex, state.flow.steps.length);
  for (let i = 0; i < limit; i += 1) {
    const step = state.flow.steps[i];
    if (step.mandatory && !state.steps[step.id]?.completed) return step;
  }
  return null;
}

export function factLabel(flow: FlowDefinition, factId: string): string {
  const label = flow.factLabels?.[factId];
  return label ? `${label}（${factId}）` : factId;
}

export const KIND_LABELS: Record<StepKind, string> = {
  autoplay: '自动播放',
  narration: '人工讲解',
  interactive: '互动',
};

export const STATUS_LABELS: Record<RunStatus, string> = {
  running: '运行中',
  paused: '已暂停（无障碍）',
  blocked: '被阻断',
  'powered-off': '已断电',
  finished: '已结束',
};

export function statusLabel(status: RunStatus): string {
  return STATUS_LABELS[status];
}

export const SCREEN_LABELS: Record<string, string> = {
  A: '屏 A · 迎宾',
  B: '屏 B · 生态长廊',
  C: '屏 C · 互动探索',
};

/** mm:ss 格式化 */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
