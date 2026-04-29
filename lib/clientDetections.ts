import {
  ChatMessage,
  DominantLayer,
  PatternMechanism,
  PatternDescriptionResult,
  detectEmotionInText,
  detectProcessFrustration,
  detectStoryTrigger,
  detectBodySensation,
  detectRelaxation,
  detectOverwhelm,
  detectSlowDownRequest,
  detectSomaticEntry,
  detectCognitiveEntry,
  detectTraumaActivation,
  detectFixControl,
  detectInnerFocusWorsening,
  detectQuietResponse,
  countConsecutiveQuietResponses,
  detectAnalysisRequest,
  detectReflectiveDepth,
  detectSessionContinuation,
  detectHighSelfAwareness,
  detectDominantLayer,
  detectInsightPriorityRequest,
  countRecentAiQuestions,
  analyzePatternDescription,
  estimatePatternMechanism,
} from '@/lib/types';

import {
  detectNeurodivergentSignals,
  detectLanguagePreference,
  detectLanguageRejection,
  detectDirectRequest,
  detectLeadershipNeed,
  NeurodivergentSignal,
  NeurodivergentDetectionResult,
  LanguageStyle,
  DirectRequestType,
} from '@/lib/neurodivergentDetection';

export interface ClientDetectionResult {
  emotionDetection: { hasEmotion: boolean; words: string[] };
  lastMessageProcessFrustration: boolean;
  lastMessageHasEmotion: boolean;
  lastMessageHasStoryTrigger: boolean;
  lastMessageHasBodySensation: boolean;
  isRelaxing: boolean;
  isOverwhelmed: boolean;
  isSlowingDown: boolean;
  isSomaticEntry: boolean;
  isCognitiveEntry: boolean;
  isTraumaActivation: boolean;
  isFixControl: boolean;
  innerFocusWorsening: boolean;
  isQuietResponse: boolean;
  consecutiveQuietResponses: number;
  isAnalysisRequest: boolean;
  isReflectiveDepth: boolean;
  isSessionContinuation: boolean;
  isHighSelfAwareness: boolean;
  dominantLayer: DominantLayer | null;
  isInsightPriorityRequest: boolean;
  recentAiQuestionCount: number;
  patternAnalysis: PatternDescriptionResult;
  broadMechanism: PatternMechanism | null;
  // ─── Neurodivergent / Processing Pattern Detection ───
  neurodivergentResult: NeurodivergentDetectionResult;
  detectedLanguageStyles: LanguageStyle[];
  rejectedLanguageStyles: LanguageStyle[];
  directRequest: DirectRequestType | null;
  needsLeadership: boolean;
}

export function runClientDetections(text: string, sessionMessages: ChatMessage[]): ClientDetectionResult {
  // ── Client-side detections ──
  const emotionDetection = detectEmotionInText(text);
  const lastMessageProcessFrustration = detectProcessFrustration(text);
  const lastMessageHasEmotion = emotionDetection.hasEmotion;
  const lastMessageHasStoryTrigger = detectStoryTrigger(text);
  const lastMessageHasBodySensation = detectBodySensation(text);
  const isRelaxing = detectRelaxation(text);
  const isOverwhelmed = detectOverwhelm(text);
  const isSlowingDown = detectSlowDownRequest(text);

  // ── New detections (AANVULLENDE REGELS) ──
  const isSomaticEntry = detectSomaticEntry(text);
  const isCognitiveEntry = detectCognitiveEntry(text);
  const isTraumaActivation = detectTraumaActivation(text);
  const isFixControl = detectFixControl(text);
  const innerFocusWorsening = detectInnerFocusWorsening(text);

  // ── Conversation quality detections ──
  const isQuietResponse = detectQuietResponse(text);
  const consecutiveQuietResponses = isQuietResponse ? countConsecutiveQuietResponses([...sessionMessages, { id: 'temp', role: 'user' as const, content: text.trim(), timestamp: new Date() }]) : 0;
  const isAnalysisRequest = detectAnalysisRequest(text);
  const isReflectiveDepth = detectReflectiveDepth(text);
  const isSessionContinuation = detectSessionContinuation(text);

  // ── Reflective Sparring Partner Mode detections ──
  const isHighSelfAwareness = detectHighSelfAwareness(text);
  const dominantLayer = detectDominantLayer(text);
  const isInsightPriorityRequest = detectInsightPriorityRequest(text);
  const recentAiQuestionCount = countRecentAiQuestions(sessionMessages);

  // ── Pattern Recognition and Reflective Coaching detection ──
  const patternAnalysis = analyzePatternDescription(text);
  if (patternAnalysis.isPatternDescription) {
    console.log(
      `%c[PATTERN RECOGNITION] Patroonbeschrijving gedetecteerd:%c mechanisme=${patternAnalysis.estimatedMechanism || 'onbekend'}, onset=${patternAnalysis.onsetSignals.join(', ') || 'geen'}, confidence=${patternAnalysis.confidence.toFixed(2)}`,
      'color: #e53e3e; font-weight: bold;',
      'color: #718096;'
    );
  }

  // ── Broad Mechanism Detection (runs on EVERY message, independently of pattern description) ──
  // This catches mechanisms in messages that contain emotional reactions without explicit pattern language
  // e.g. "ik duw het gevoel weg en ga door alsof er niks aan de hand is" → emotional_suppression
  const broadMechanism = estimatePatternMechanism(text);
  if (broadMechanism && !patternAnalysis.estimatedMechanism) {
    console.log(
      `%c[BROAD MECHANISM] Mechanisme gedetecteerd zonder patroonbeschrijving:%c ${broadMechanism}`,
      'color: #9f7aea; font-weight: bold;',
      'color: #718096;'
    );
  }

  // ── Mechanism + Dominant Layer Reflection Rule logging ──
  const effectiveMechanism = patternAnalysis.estimatedMechanism || broadMechanism;
  const hasMechanismForReflection = !!effectiveMechanism;
  const hasDominantLayerForReflection = !!dominantLayer;
  if ((hasMechanismForReflection || (patternAnalysis.isPatternDescription && hasDominantLayerForReflection)) && !isOverwhelmed) {
    const layerLabels: Record<string, string> = { thinking: 'denken', feeling: 'voelen', body: 'lichaam', existential: 'betekenis' };
    console.log(
      `%c[MECHANISM+LAYER REFLECTION] Actief:%c mechanisme=${effectiveMechanism || 'geen'}, laag=${dominantLayer ? layerLabels[dominantLayer] || dominantLayer : 'geen'}, bron=${patternAnalysis.estimatedMechanism ? 'patroon' : 'breed'}`,
      'color: #d53f8c; font-weight: bold;',
      'color: #718096;'
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ─── NEURODIVERGENT / PROCESSING PATTERN DETECTION ───
  // ═══════════════════════════════════════════════════════════════════
  const neurodivergentResult = detectNeurodivergentSignals(text);
  const detectedLanguageStyles = detectLanguagePreference(text);
  const rejectedLanguageStyles = detectLanguageRejection(text);
  const directRequest = detectDirectRequest(text);
  const needsLeadership = detectLeadershipNeed(text, {
    isOverwhelmed,
    consecutiveQuietResponses,
    isTraumaActivation,
  });

  // Log neurodivergent detections
  if (neurodivergentResult.signals.length > 0) {
    console.log(
      `%c[NEURODIVERGENT] Signalen gedetecteerd:%c ${neurodivergentResult.signals.join(', ')} (confidence: ${neurodivergentResult.confidence.toFixed(2)})`,
      'color: #ed8936; font-weight: bold;',
      'color: #718096;'
    );
  }
  if (detectedLanguageStyles.length > 0) {
    console.log(
      `%c[LANGUAGE STYLE] Voorkeurstaal:%c ${detectedLanguageStyles.join(', ')}`,
      'color: #4299e1; font-weight: bold;',
      'color: #718096;'
    );
  }
  if (rejectedLanguageStyles.length > 0) {
    console.log(
      `%c[LANGUAGE REJECTION] Afgewezen taal:%c ${rejectedLanguageStyles.join(', ')}`,
      'color: #fc8181; font-weight: bold;',
      'color: #718096;'
    );
  }
  if (directRequest) {
    console.log(
      `%c[DIRECT REQUEST] Type:%c ${directRequest}`,
      'color: #48bb78; font-weight: bold;',
      'color: #718096;'
    );
  }
  if (needsLeadership) {
    console.log(
      `%c[LEADERSHIP NEED] Ondersteunend leiderschap nodig`,
      'color: #ed64a6; font-weight: bold;'
    );
  }

  // Log sparring partner detections for debugging
  const sparringDetections = [
    isHighSelfAwareness && 'hoog-zelfbewustzijn',
    dominantLayer && `dominante-laag(${dominantLayer})`,
    isInsightPriorityRequest && 'inzicht-prioriteit',
    recentAiQuestionCount >= 2 && `vraag-keten(${recentAiQuestionCount}x)`,
  ].filter(Boolean);
  if (sparringDetections.length > 0) {
    console.log(
      `%c[SPARRING PARTNER] Gedetecteerd:%c ${sparringDetections.join(', ')}`,
      'color: #d69e2e; font-weight: bold;',
      'color: #718096;'
    );
  }

  // Log conversation quality detections for debugging
  const qualityDetections = [
    isQuietResponse && `stilte(${consecutiveQuietResponses}x)`,
    isAnalysisRequest && 'analyse-verzoek',
    isReflectiveDepth && 'reflectieve-diepte',
    isSessionContinuation && 'sessie-voortzetting',
  ].filter(Boolean);
  if (qualityDetections.length > 0) {
    console.log(
      `%c[CONVERSATION QUALITY] Gedetecteerd:%c ${qualityDetections.join(', ')}`,
      'color: #805ad5; font-weight: bold;',
      'color: #718096;'
    );
  }

  return {
    emotionDetection,
    lastMessageProcessFrustration,
    lastMessageHasEmotion,
    lastMessageHasStoryTrigger,
    lastMessageHasBodySensation,
    isRelaxing,
    isOverwhelmed,
    isSlowingDown,
    isSomaticEntry,
    isCognitiveEntry,
    isTraumaActivation,
    isFixControl,
    innerFocusWorsening,
    isQuietResponse,
    consecutiveQuietResponses,
    isAnalysisRequest,
    isReflectiveDepth,
    isSessionContinuation,
    isHighSelfAwareness,
    dominantLayer,
    isInsightPriorityRequest,
    recentAiQuestionCount,
    patternAnalysis,
    broadMechanism,
    // ─── Neurodivergent / Processing Pattern Detection ───
    neurodivergentResult,
    detectedLanguageStyles,
    rejectedLanguageStyles,
    directRequest,
    needsLeadership,
  };
}

