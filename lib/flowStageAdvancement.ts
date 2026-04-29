import type { FlowStage } from '@/lib/types';

/**
 * ─── FLOW STAGE ADVANCEMENT ───
 *
 * Determines the next flow stage based on the current stage and client-side detections.
 * Includes the bodyBoundary override that belongs to this flow stage logic.
 *
 * Extracted from SessionContext.tsx — logic is identical.
 */

export interface FlowStageDetections {
  isRelaxing: boolean;
  isSomaticEntry: boolean;
  lastMessageHasStoryTrigger: boolean;
  lastMessageHasEmotion: boolean;
  lastMessageHasBodySensation: boolean;
  currentBodyBoundary: boolean;
}

export function advanceFlowStage(
  currentFlowStage: FlowStage,
  detections: FlowStageDetections,
): FlowStage {
  const {
    isRelaxing,
    isSomaticEntry,
    lastMessageHasStoryTrigger,
    lastMessageHasEmotion,
    lastMessageHasBodySensation,
    currentBodyBoundary,
  } = detections;

  if (isRelaxing) {
    currentFlowStage = 'integrating';
  // ── PRIORITEIT (OVERRIDE – SOMATISCH): Somatic entry keeps/moves to body_exploring ──
  } else if (isSomaticEntry && !lastMessageHasStoryTrigger) {
    currentFlowStage = 'body_exploring';
  // ── PRIORITEIT (OVERRIDE – VERHAAL): Story trigger resets flow to story_detected ──
  } else if (lastMessageHasStoryTrigger && !isSomaticEntry && (currentFlowStage === 'none' || currentFlowStage === 'body_exploring' || currentFlowStage === 'emotion_exploring' || currentFlowStage === 'integrating')) {
    currentFlowStage = 'story_detected';
  } else if (currentFlowStage === 'story_detected') {
    currentFlowStage = 'story_exploring';
  } else if (currentFlowStage === 'story_exploring' && lastMessageHasEmotion) {
    currentFlowStage = 'emotion_exploring';
  } else if ((currentFlowStage === 'story_exploring') && !lastMessageHasStoryTrigger && !lastMessageHasEmotion) {
    currentFlowStage = 'story_exploring';
  } else if (currentFlowStage === 'emotion_exploring' && lastMessageHasBodySensation && !currentBodyBoundary) {
    currentFlowStage = 'body_exploring';
  } else if (currentFlowStage === 'body_exploring' && isRelaxing) {
    currentFlowStage = 'integrating';
  }
  // If body boundary is set and we're in body_exploring (and not somatic entry), move back to emotion_exploring
  if (currentBodyBoundary && currentFlowStage === 'body_exploring' && !isSomaticEntry) {
    currentFlowStage = 'emotion_exploring';
  }

  return currentFlowStage;
}
