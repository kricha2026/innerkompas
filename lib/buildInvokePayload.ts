import { PersonalProfile, SomaticClusterResult } from '@/lib/types';
import { buildProfileContext } from '@/lib/profileManager';
import {
  ClientStatusMemory,
  buildAnalysisMemoryContext,
  buildAnalysisMemoryInstruction,
  buildMemoryArchitectureInstruction,
} from '@/lib/clientStatusMemory';

/**
 * ─── BUILD INVOKE PAYLOAD ───
 *
 * Constructs the payload sent to the AI edge function, including:
 * - Message trimming (last 14, asymmetric per-role cap: user ≤1200,
 *   assistant ≤2400 — preserves the model's own rich prior reasoning for
 *   self-coherence; see REGRESSION FIX note below)
 * - Flow instruction trimming (max 20, max 4000 chars each)
 * - Profile context building with size cap
 * - Payload size check and emergency trimming (40KB hard limit)
 * - Silent analysis memory injection (reuses ik_client_status analysis from
 *   the coach Sessions page so the live chat can personalize responses)
 *
 * Extracted from SessionContext.tsx — core logic unchanged.
 */


export interface BuildInvokePayloadOptions {
  updatedMessages: Array<{ role: string; content: string }>;
  phase: string;
  detectedMode: string | null;
  userEmotionWords: string[];
  detectedEmotionWords: string[];
  bodyAreas: string[];
  isStable: boolean;
  userText: string;
  flowStage: string;
  noBodySensationCount: number;
  lastMessageHasEmotion: boolean;
  lastMessageNoBodySensation: boolean;
  lastMessageProcessFrustration: boolean;
  lastMessageHasStoryTrigger: boolean;
  lastMessageHasBodySensation: boolean;
  isRelaxing: boolean;
  isOverwhelmed: boolean;
  isSlowingDown: boolean;
  flowInstructions: string[];
  bodyBoundarySet: boolean;
  bodyBoundaryJustSet: boolean;
  isSomaticEntry: boolean;
  isCognitiveEntry: boolean;
  isTraumaActivation: boolean;
  isFixControl: boolean;
  innerFocusWorsening: boolean;
  personalProfile: PersonalProfile | null;
  somaticCluster: SomaticClusterResult;
  alreadyDescribedBodySignals: string[];
  /**
   * Optional: silent cross-session AI analysis memory (same source as the coach
   * Sessions page). When provided and non-empty, it is injected into
   * sessionContext.analysisMemory and a guidance instruction is prepended to
   * flowInstructions so the model uses it silently.
   */
  clientStatusMemory?: ClientStatusMemory | null;
}


export function buildInvokePayload(options: BuildInvokePayloadOptions) {
  const {
    updatedMessages,
    phase,
    detectedMode,
    userEmotionWords,
    detectedEmotionWords,
    bodyAreas,
    isStable,
    userText,
    flowStage,
    noBodySensationCount,
    lastMessageHasEmotion,
    lastMessageNoBodySensation,
    lastMessageProcessFrustration,
    lastMessageHasStoryTrigger,
    lastMessageHasBodySensation,
    isRelaxing,
    isOverwhelmed,
    isSlowingDown,
    flowInstructions,
    bodyBoundarySet,
    bodyBoundaryJustSet,
    isSomaticEntry,
    isCognitiveEntry,
    isTraumaActivation,
    isFixControl,
    innerFocusWorsening,
    personalProfile,
    somaticCluster,
    alreadyDescribedBodySignals,
    clientStatusMemory,
  } = options;

  // ── Build invoke body — payload size management ──
  //
  // REGRESSION FIX (Apr 14):
  // Previous settings were MAX_MESSAGES=10 and MAX_MSG_LENGTH=400 applied
  // uniformly to both user AND assistant messages. The 400-char cap on
  // assistant messages silently truncated the model's OWN prior rich
  // responses before feeding them back as conversation history, which
  // destroyed self-coherence, meta-awareness and relational continuity
  // (the model could not "hear itself" think across turns). Users
  // experienced this as a sharp drop in presence, personality and depth.
  //
  // New policy:
  //   • Keep a longer window (14 messages) for relational continuity.
  //   • Preserve assistant messages almost fully (2400 chars) so the model
  //     retains its own nuanced prior reasoning, self-model and tone.
  //   • Give user messages a generous cap (1200 chars) so complex stories
  //     aren't chopped mid-sentence.
  //   • The 40KB emergency payload cap below still catches pathological
  //     cases — no risk of runaway payloads.
  const MAX_MESSAGES = 14;
  const MAX_USER_MSG_LENGTH = 1200;
  const MAX_ASSISTANT_MSG_LENGTH = 2400;
  const trimmedMessages = updatedMessages
    .slice(-MAX_MESSAGES)
    .map(m => {
      const cap = m.role === 'assistant' ? MAX_ASSISTANT_MSG_LENGTH : MAX_USER_MSG_LENGTH;
      return {
        role: m.role,
        content: m.content.length > cap
          ? m.content.substring(0, cap) + '...'
          : m.content,
      };
    });

  // Limit flow instructions to prevent oversized payloads
  // Increased from 10/2500 to 20/4000 to accommodate:
  // - Phase 3 (kern) coaching instructions (~3500 chars)
  // - Phase 4 (alignment) instructions (~2700 chars)
  // - Conversation quality rules (Soft Landing, Analysis Request, Reflective Depth,
  //   Session Continuation, Quick Reply Reduction, Repetitive Question Reduction)
  // - Inner Compass State Map detection instructions (~2200 chars)
  // The 40KB emergency payload trimming (below) catches edge cases where too many
  // conditional hints fire simultaneously.
  const MAX_FLOW_INSTRUCTIONS = 20;
  const MAX_INSTRUCTION_LENGTH = 4000;
  const trimmedFlowInstructions = flowInstructions
    .slice(0, MAX_FLOW_INSTRUCTIONS)
    .map(inst => inst.length > MAX_INSTRUCTION_LENGTH
      ? inst.substring(0, MAX_INSTRUCTION_LENGTH) + '...'
      : inst
    );

  // Build profile context with size cap
  let profileContext: Record<string, any> | null = null;
  if (personalProfile) {
    try {
      profileContext = buildProfileContext(personalProfile);
      // Cap profile context size
      const profileStr = JSON.stringify(profileContext);
      if (profileStr.length > 2000) {
        // Strip least important fields to reduce size
        delete profileContext.ineffectiveApproaches;
        delete profileContext.sensitivityPatterns;
        delete profileContext.responseStylePreferences;
      }
    } catch (e) {
      console.warn('[AI] Error building profile context:', e);
      profileContext = null;
    }
  }

  // ── Build analysis memory context (reuses ik_client_status from coach view) ──
  // This is SILENT context for the model — same intelligence shown on the coach
  // Sessions page, now also available to the live user chat.
  let analysisMemoryContext: Record<string, any> | null = null;
  let analysisMemoryInstruction: string | null = null;
  try {
    analysisMemoryContext = buildAnalysisMemoryContext(clientStatusMemory ?? null);
    analysisMemoryInstruction = buildAnalysisMemoryInstruction(clientStatusMemory ?? null);
  } catch (e) {
    console.warn('[AI] Error building analysis memory context:', e);
    analysisMemoryContext = null;
    analysisMemoryInstruction = null;
  }

  // ── ALWAYS-PRESENT MEMORY ARCHITECTURE INSTRUCTION ──
  // Describes to the model what continuity channels are ACTUALLY available
  // this turn (lopende sessie / personalProfile / analysisMemory). Prevents
  // the model from defaulting to generic "ik heb geen geheugen" disclaimers
  // that contradict the real Inner Kompas architecture. See memory behavior
  // audit notes in clientStatusMemory.ts.
  const memoryArchitectureInstruction = buildMemoryArchitectureInstruction({
    hasPersonalProfile: !!profileContext,
    hasAnalysisMemory: !!analysisMemoryContext,
    priorMessageCount: Math.max(0, updatedMessages.length - 1),
  });

  // Compose final flow instructions with explicit ordering:
  //   1. Memory architecture (self-model, always present)
  //   2. Analysis memory usage guidance (only when analysisMemory present)
  //   3. Per-turn flow hints
  // Cap at MAX_FLOW_INSTRUCTIONS so we never exceed payload-instruction budget.
  const composedInstructions: string[] = [memoryArchitectureInstruction];
  if (analysisMemoryInstruction) composedInstructions.push(analysisMemoryInstruction);
  composedInstructions.push(...trimmedFlowInstructions);
  const finalFlowInstructions = composedInstructions.slice(0, MAX_FLOW_INSTRUCTIONS);




  const invokeBody = {
    messages: trimmedMessages,
    phase: phase,
    sessionContext: {
      detectedMode: detectedMode,
      emotionWords: [...new Set([...userEmotionWords, ...detectedEmotionWords])].slice(0, 10),
      bodyAreas: bodyAreas.slice(0, 5),
      isStable: isStable,
      messageCount: updatedMessages.length,
      lastMessageHasEmotion,
      lastMessageNoBodySensation,
      noBodySensationCount: noBodySensationCount,
      lastMessageProcessFrustration,
      lastMessageText: userText.substring(0, 400),
      flowStage: flowStage,
      lastMessageHasStoryTrigger,
      lastMessageHasBodySensation,
      isRelaxing,
      isOverwhelmed,
      isSlowingDown,
      flowInstructions: finalFlowInstructions,
      bodyBoundarySet: bodyBoundarySet,
      bodyBoundaryJustSet: bodyBoundaryJustSet,
      isSomaticEntry,
      isCognitiveEntry,
      isTraumaActivation,
      isFixControl,
      innerFocusWorsening,
      personalProfile: profileContext,
      // ── SILENT ANALYSIS MEMORY (reused from coach Sessions page) ──
      // Same AI analysis source as CoachPersonDetail: ik_client_status.
      // Used silently by the model to personalize live responses. Never
      // surfaced verbatim to the user (see analysisMemoryInstruction above).
      analysisMemory: analysisMemoryContext || undefined,
      // ── SOMATIC CLUSTER — methodological principle ──
      somaticCluster: somaticCluster.isCluster ? {
        isCluster: true,
        signalCount: somaticCluster.signalCount,
        signals: somaticCluster.signals.slice(0, 5),
      } : undefined,
      alreadyDescribedBodySignals: alreadyDescribedBodySignals.length > 0
        ? alreadyDescribedBodySignals.slice(0, 5)
        : undefined,
    },
  };

  // ── Payload size check and emergency trimming ──
  let payloadStr = JSON.stringify(invokeBody);
  const MAX_PAYLOAD_SIZE = 40000; // 40KB hard limit
  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    console.warn(`[AI] Payload too large (${(payloadStr.length / 1024).toFixed(1)}KB) — emergency trimming`);
    // Emergency: strip flow instructions to just 3 most important
    invokeBody.sessionContext.flowInstructions = finalFlowInstructions.slice(0, 3);
    // Strip profile
    invokeBody.sessionContext.personalProfile = null;
    // Keep analysisMemory — it's small and high-value; only drop if still too big
    // Reduce messages to 6
    invokeBody.messages = trimmedMessages.slice(-6);
    payloadStr = JSON.stringify(invokeBody);
    if (payloadStr.length > MAX_PAYLOAD_SIZE) {
      // Still too large — drop analysis memory as last resort
      invokeBody.sessionContext.analysisMemory = undefined;
      payloadStr = JSON.stringify(invokeBody);
    }
    console.log(`[AI] After emergency trim: ${(payloadStr.length / 1024).toFixed(1)}KB`);
  }

  // ── Log payload size for debugging ──
  console.log(
    `%c[AI] Payload: ${(payloadStr.length / 1024).toFixed(1)}KB, ${invokeBody.messages.length} msgs, ${invokeBody.sessionContext.flowInstructions.length} instructions${invokeBody.sessionContext.analysisMemory ? ', analysisMemory=yes' : ''}`,
    'color: #718096;'
  );

  return invokeBody;
}
