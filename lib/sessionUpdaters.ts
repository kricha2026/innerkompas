import type {
  EntryPoint,
  CompassState,
  CompassStateDetection,
  StrengthType,
  RegulationEffectiveness,
  ActiveAgent,
  RegulationDomain,
} from '@/lib/types';

/**
 * ─── INNER COMPASS SESSION UPDATE BUILDER ───
 *
 * Builds the partial session update object for the Inner Compass data block.
 * This includes:
 *   - entryPoint
 *   - secondaryEntryPoints
 *   - entryHistory
 *   - compassSignals
 *   - detectedStrengths
 *   - regulationEffectiveness
 *   - insightAsRegulation
 *   - compassStateHistory
 *   - currentCompassState
 *   - currentSecondaryCompassState
 *   - reachedRelease
 *   - reachedIntegration
 *
 * Extracted from SessionContext.tsx — logic is identical.
 */

// ─── New values from the current sendMessage scope ───
export interface CompassSessionUpdateInputs {
  entryResultPrimary: EntryPoint | null;
  entryResultSecondary: EntryPoint[];
  currentEntryHistory: EntryPoint[];
  compassResultHasSignal: boolean;
  compassResultSignals: string[];
  currentStrengths: StrengthType[];
  currentEffectiveness: RegulationEffectiveness[];
  isInsightEntry: boolean;
  currentCompassStateHistory: CompassStateDetection[];
  compassStateResultPrimary: CompassState | null;
  compassStateResultSecondary: CompassState | null;
}

// ─── Previous session fields needed for fallback/merge logic ───
export interface PrevCompassSessionFields {
  compassSignals: string[];
  insightAsRegulation: boolean;
  currentCompassState: CompassState | null;
  currentSecondaryCompassState: CompassState | null;
  reachedRelease: boolean;
  reachedIntegration: boolean;
}

export function buildCompassSessionUpdate(
  inputs: CompassSessionUpdateInputs,
  prev: PrevCompassSessionFields,
) {
  return {
    entryPoint: inputs.entryResultPrimary,
    secondaryEntryPoints: inputs.entryResultSecondary,
    entryHistory: inputs.currentEntryHistory,
    compassSignals: inputs.compassResultHasSignal ? inputs.compassResultSignals : (prev.compassSignals || []),
    detectedStrengths: inputs.currentStrengths,
    regulationEffectiveness: inputs.currentEffectiveness,
    insightAsRegulation: inputs.isInsightEntry || prev.insightAsRegulation,
    // Compass state map
    compassStateHistory: inputs.currentCompassStateHistory,
    currentCompassState: inputs.compassStateResultPrimary || prev.currentCompassState,
    currentSecondaryCompassState: inputs.compassStateResultSecondary || prev.currentSecondaryCompassState,
    reachedRelease: prev.reachedRelease || inputs.compassStateResultPrimary === 'release_movement',
    reachedIntegration: prev.reachedIntegration || inputs.compassStateResultPrimary === 'integration',
  };
}


/**
 * ─── AI RESPONSE SESSION UPDATE BUILDER ───
 *
 * Builds the partial session update object for the AI response merge block.
 * This includes:
 *   - silenceMode
 *   - activeAgent
 *   - regulationDomain
 *   - compassSignals
 *   - identityThemes
 *   - insightAsRegulation
 *   - lastAiApproach
 *   - currentCompassState
 *   - currentSecondaryCompassState
 *   - compassStateHistory
 *   - reachedRelease
 *   - reachedIntegration
 *
 * Extracted from SessionContext.tsx — logic is identical.
 */

// ─── New values from the AI response and local computations ───
export interface AIResponseSessionUpdateInputs {
  silenceMode: boolean | undefined;
  activeAgent: ActiveAgent;
  regulationDomain: RegulationDomain | null | undefined;
  compassSignals: string[] | undefined;
  identityThemes: string[] | undefined;
  insightOffered: boolean | undefined;
  aiApproach: RegulationEffectiveness['approach'];
  aiCompassState: string | null;
  aiSecondaryCompassState: string | null;
  aiCompassStateDetection: CompassStateDetection | null;
}

// ─── Previous session fields needed for fallback/merge logic ───
export interface PrevAIResponseSessionFields {
  regulationDomain: RegulationDomain | null;
  compassSignals: string[];
  identityThemes: string[];
  insightAsRegulation: boolean;
  currentCompassState: CompassState | null;
  currentSecondaryCompassState: CompassState | null;
  compassStateHistory: CompassStateDetection[];
  reachedRelease: boolean;
  reachedIntegration: boolean;
}

export function buildAIResponseSessionUpdate(
  inputs: AIResponseSessionUpdateInputs,
  prev: PrevAIResponseSessionFields,
) {
  return {
    silenceMode: !!inputs.silenceMode,
    activeAgent: inputs.activeAgent || null,
    regulationDomain: inputs.regulationDomain || prev.regulationDomain,
    compassSignals: inputs.compassSignals?.length > 0
      ? [...new Set([...(prev.compassSignals || []), ...inputs.compassSignals])]
      : prev.compassSignals,
    identityThemes: inputs.identityThemes?.length > 0
      ? [...new Set([...(prev.identityThemes || []), ...inputs.identityThemes])]
      : prev.identityThemes,
    insightAsRegulation: inputs.insightOffered || prev.insightAsRegulation,
    lastAiApproach: inputs.aiApproach,
    // ── Compass state map: AI-detected state overrides client-side ──
    currentCompassState: inputs.aiCompassState ? (inputs.aiCompassState as CompassState) : prev.currentCompassState,
    currentSecondaryCompassState: inputs.aiSecondaryCompassState ? (inputs.aiSecondaryCompassState as CompassState) : prev.currentSecondaryCompassState,
    compassStateHistory: inputs.aiCompassStateDetection
      ? [...(prev.compassStateHistory || []), inputs.aiCompassStateDetection]
      : prev.compassStateHistory,
    reachedRelease: prev.reachedRelease || inputs.aiCompassState === 'release_movement',
    reachedIntegration: prev.reachedIntegration || inputs.aiCompassState === 'integration',
  };
}
