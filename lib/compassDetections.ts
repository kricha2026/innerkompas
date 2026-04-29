import {
  CompassSignalCategory,
  CompassState,
  CompassStateDetection,
  EntryDetectionResult,
  EntryPoint,
  RegulationEffectiveness,
  StrengthType,
  detectInsightEntry,
  detectMeaningIdentityEntry,
  detectCompassSignal,
  detectEntryPointMulti,
  detectStrengths,
  detectCompassState,
} from '@/lib/types';

// ─── Options passed into runCompassDetections ───
export interface CompassDetectionOptions {
  text: string;
  // From client detections
  isOverwhelmed: boolean;
  isRelaxing: boolean;
  isSomaticEntry: boolean;
  isCognitiveEntry: boolean;
  isTraumaActivation: boolean;
  isFixControl: boolean;
  lastMessageHasEmotion: boolean;
  emotionWords: string[];
  innerFocusWorsening: boolean;
  lastMessageProcessFrustration: boolean;
  // From session state
  entryHistory: EntryPoint[];
  detectedStrengths: StrengthType[];
  regulationEffectiveness: RegulationEffectiveness[];
  lastAiApproach: RegulationEffectiveness['approach'] | null;
  messagesLength: number;
  compassStateHistory: CompassStateDetection[];
  currentCompassState: CompassState | null;
}

// ─── Return type from runCompassDetections ───
export interface CompassDetectionResult {
  isInsightEntry: boolean;
  isMeaningIdentityEntry: boolean;
  compassResult: { hasSignal: boolean; signals: CompassSignalCategory[] };
  entryResult: EntryDetectionResult;
  userStrengths: StrengthType[];
  compassStateResult: CompassStateDetection;
  currentEntryHistory: EntryPoint[];
  currentStrengths: StrengthType[];
  currentEffectiveness: RegulationEffectiveness[];
  currentCompassStateHistory: CompassStateDetection[];
  previousCompassState: CompassState | null;
}

/**
 * Runs all Inner Compass detection and tracking logic.
 * Extracted verbatim from the sendMessage function in SessionContext.tsx.
 * All detection logic, variable names, conditions, and thresholds are identical.
 */
export function runCompassDetections(options: CompassDetectionOptions): CompassDetectionResult {
  const {
    text,
    isOverwhelmed,
    isRelaxing,
    isSomaticEntry,
    isCognitiveEntry,
    isTraumaActivation,
    isFixControl,
    lastMessageHasEmotion,
    emotionWords,
    innerFocusWorsening,
    lastMessageProcessFrustration,
    entryHistory,
    detectedStrengths,
    regulationEffectiveness,
    lastAiApproach,
    messagesLength,
    compassStateHistory,
    currentCompassState,
  } = options;

  // ── Inner Compass architecture — multi-entry detection ──
  const isInsightEntry = detectInsightEntry(text);
  const isMeaningIdentityEntry = detectMeaningIdentityEntry(text);
  const compassResult = detectCompassSignal(text);
  const entryResult = detectEntryPointMulti(text);
  const userStrengths = detectStrengths(text);

  // ── Inner Compass State Map — client-side detection ──
  const compassStateResult = detectCompassState(text, {
    isOverwhelmed,
    isRelaxing,
    isSomaticEntry,
    isCognitiveEntry,
    isInsightEntry,
    isMeaningIdentityEntry,
    isTraumaActivation,
    isFixControl,
    hasEmotion: lastMessageHasEmotion,
    emotionWords: emotionWords,
    compassSignals: compassResult.hasSignal ? compassResult.signals : undefined,
    innerFocusWorsening,
  });

  // Track entry history (for dynamic routing — learning how user moves through session)
  const currentEntryHistory = [...(entryHistory || [])];
  if (entryResult.primary) {
    currentEntryHistory.push(entryResult.primary);
  }

  // Track detected strengths (accumulate across session)
  const currentStrengths = [...new Set([...(detectedStrengths || []), ...userStrengths])];

  // Track regulation effectiveness: did the last AI approach help?
  // We detect "helped" by checking if user shows signs of regulation (relaxation, insight, clarity)
  const currentEffectiveness = [...(regulationEffectiveness || [])];
  if (lastAiApproach && messagesLength > 0) {
    const helped = isRelaxing || isInsightEntry || detectMeaningIdentityEntry(text);
    const notHelped = isOverwhelmed || innerFocusWorsening || lastMessageProcessFrustration;
    if (helped || notHelped) {
      currentEffectiveness.push({
        approach: lastAiApproach,
        helped: helped && !notHelped,
        timestamp: new Date(),
        context: text.substring(0, 100),
      });
    }
  }

  // ── Compass state history tracking ──
  const currentCompassStateHistory = [...(compassStateHistory || [])];
  if (compassStateResult.primary) {
    currentCompassStateHistory.push(compassStateResult);
  }
  const previousCompassState = currentCompassState || null;

  return {
    isInsightEntry,
    isMeaningIdentityEntry,
    compassResult,
    entryResult,
    userStrengths,
    compassStateResult,
    currentEntryHistory,
    currentStrengths,
    currentEffectiveness,
    currentCompassStateHistory,
    previousCompassState,
  };
}
