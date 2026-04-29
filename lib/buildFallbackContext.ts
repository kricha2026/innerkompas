/**
 * ─── BUILD FALLBACK CONTEXT ───
 *
 * Constructs the parameter object passed to generateFallbackResponse().
 * Extracted from SessionContext.tsx where the same object was built inline
 * at 3 separate call sites. This function produces the identical object
 * that was previously constructed at each site.
 *
 * v3.7.3: Now also carries `clientStatusMemory` so the local fallback can
 * answer continuity questions from memory (name, refined style, top moments,
 * persoonsduiding, progressSummary) instead of routing them into a
 * regulation / holding template. This is the client-side mirror of what
 * the edge function already does via `detectsContinuityQuestion` + the
 * SAMENVATTING block.
 */

import type { FlowStage, CompassState } from '@/lib/types';
import type { ClientStatusMemory } from '@/lib/clientStatusMemory';

/**
 * Raw inputs from the sendMessage scope.
 * Field names match the local variables in sendMessage where possible.
 * Derived values (messageCount, userText, compassState) are passed pre-computed.
 */
export interface BuildFallbackContextOptions {
  currentFlowStage: FlowStage;
  isOverwhelmed: boolean;
  isRelaxing: boolean;
  isSomaticEntry: boolean;
  isCognitiveEntry: boolean;
  isTraumaActivation: boolean;
  lastMessageHasEmotion: boolean;
  lastMessageHasBodySensation: boolean;
  lastMessageHasStoryTrigger: boolean;
  lastMessageProcessFrustration: boolean;
  innerFocusWorsening: boolean;
  currentBodyBoundary: boolean;
  updatedMessagesLength: number;
  userText: string;
  recentUserTurns?: string[];
  compassStatePrimary: CompassState | null;
  // ── Reflective Sparring Partner Mode context ──
  isHighSelfAwareness: boolean;
  isInsightPriorityRequest: boolean;
  dominantLayer: 'thinking' | 'feeling' | 'body' | 'existential' | null;
  recentAiQuestionCount: number;
  isQuietResponse: boolean;
  consecutiveQuietResponses: number;
  // ── v3.7.3: memory-aware continuity handling in the local fallback ──
  clientStatusMemory?: ClientStatusMemory | null;
}

/**
 * Builds the fallback context object for generateFallbackResponse().
 * Maps sendMessage local variable names to FallbackContext field names.
 * The returned object is structurally identical to the inline objects
 * that were previously constructed at each of the 3 call sites.
 */
export function buildFallbackContext(options: BuildFallbackContextOptions) {
  return {
    flowStage: options.currentFlowStage,
    isOverwhelmed: options.isOverwhelmed,
    isRelaxing: options.isRelaxing,
    isSomaticEntry: options.isSomaticEntry,
    isCognitiveEntry: options.isCognitiveEntry,
    isTraumaActivation: options.isTraumaActivation,
    lastMessageHasEmotion: options.lastMessageHasEmotion,
    lastMessageHasBodySensation: options.lastMessageHasBodySensation,
    lastMessageHasStoryTrigger: options.lastMessageHasStoryTrigger,
    lastMessageProcessFrustration: options.lastMessageProcessFrustration,
    innerFocusWorsening: options.innerFocusWorsening,
    bodyBoundarySet: options.currentBodyBoundary,
    messageCount: options.updatedMessagesLength,
    userText: options.userText,
    recentUserTurns: options.recentUserTurns ?? [],
    compassState: options.compassStatePrimary,
    // ── Reflective Sparring Partner Mode context ──
    isHighSelfAwareness: options.isHighSelfAwareness,
    isInsightPriorityRequest: options.isInsightPriorityRequest,
    dominantLayer: options.dominantLayer,
    recentAiQuestionCount: options.recentAiQuestionCount,
    isQuietResponse: options.isQuietResponse,
    consecutiveQuietResponses: options.consecutiveQuietResponses,
    // ── v3.7.3: memory-aware continuity handling ──
    clientStatusMemory: options.clientStatusMemory ?? null,
  };
}
