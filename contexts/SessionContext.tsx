import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getGuestId } from '@/lib/guestId';


import { 
  Phase, Session, SessionStep, EmotionOption, BodySensation, BodyArea, RegulationDomain,
  DetectedMode, ActiveAgent, FlowStage, CRISIS_KEYWORDS, DYSREGULATION_WORDS, CoachSession, ChatMessage, AIResponse,
  PersonalProfile,
  CompassState, CompassStateDetection,
  detectBodyBoundary, detectCrisis,
  detectAiApproach,

  buildFlowInstructions,
  detectKernReadiness, KernReadinessResult,
  detectAlignmentReadiness, AlignmentReadinessResult,
  CompassSignalCategory, StrengthType, RegulationEffectiveness,

  // Button override detection
  detectButtonOverrideRequest, detectButtonOverrideRelease,
} from '@/lib/types';

import { runClientDetections } from '@/lib/clientDetections';
import { runCompassDetections } from '@/lib/compassDetections';
import { preprocessMessageContext } from '@/lib/messagePreprocessing';








import { supabase } from '@/lib/supabase';
import { loadProfile, saveProfile, mergeSessionIntoProfile } from '@/lib/profileManager';
import { loadClientStatusMemory, ClientStatusMemory, saveMeaningfulMemory } from '@/lib/clientStatusMemory';
import {
  emptyMeaningfulMemory,
  summarizeSessionMeaningful,
  mergeSessionIntoMeaningfulMemory,
} from '@/lib/meaningfulMemory';
import { loadPriorSessionStats, PriorSessionStats } from '@/lib/priorSessionStats';



import { generateFallbackResponse } from '@/lib/localFallbackAI';
import { stripBulletsFromMessage, cleanRawJsonFromMessage } from '@/ai/messageCleaner';
import { sanitizeQuickRepliesClient } from '@/ai/quickReplySanitizer';
import { isValidAIResponse, containsLeakedError } from '@/ai/responseValidation';

import { saveMessageToDb as saveMessageToDbFn, saveCompassStateToDb as saveCompassStateToDbFn } from '@/lib/sessionDb';
import { invokeAIWithRetries } from '@/lib/aiInvoke';
import { buildInvokePayload } from '@/lib/buildInvokePayload';
import { advanceFlowStage } from '@/lib/flowStageAdvancement';
import { buildFallbackContext } from '@/lib/buildFallbackContext';
import { buildCompassSessionUpdate, buildAIResponseSessionUpdate } from '@/lib/sessionUpdaters';








// Guest ID is used when no user is logged in — generates a stable per-device UUID
// This replaces the old DEFAULT_USER_ID which was shared across all anonymous users



interface SessionContextType {
  currentView: Phase;
  setCurrentView: (view: Phase) => void;
  session: Session | null;
  startSession: () => void;
  endSession: () => void;
  addStep: (step: Partial<SessionStep>) => void;
  setPhase: (phase: Phase) => void;
  selectEmotion: (emotion: EmotionOption) => void;
  selectBodyArea: (sensation: BodySensation) => void;
  setUserResponse: (response: string) => void;
  checkForCrisis: (text: string) => boolean;
  checkDysregulation: (text: string) => boolean;
  detectMode: (text: string) => DetectedMode;
  setSessionMode: (mode: DetectedMode) => void;
  addEmotionWord: (word: string) => void;
  markStable: () => void;
  resetCrisis: () => void;
  activateCoach: () => void;
  deactivateCoach: () => void;
  toggleCoachVisible: () => void;
  sendMessage: (text: string) => Promise<AIResponse | null>;
  addAssistantMessage: (content: string, quickReplies?: string[], showBodyMap?: boolean) => void;
  selectBodyInChat: (area: BodyArea) => void;
  isAiLoading: boolean;
  coachSessions: CoachSession[];
  selectedEmotion: EmotionOption | null;
  selectedBody: BodySensation | null;
  userResponse: string;
  isStable: boolean;
  crisisDetected: boolean;
  sessionHistory: Session[];
  dbSessionId: string | null;
  // ─── Diagnostic / session isolation helpers ───
  activeUserId: string | null;
  isGuest: boolean;
  getDbSessionIdRef: () => string | null;

}



const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  // ─── Get authenticated user from AuthContext ───
  // If logged in, use the auth user's ID. Otherwise, use a stable per-device guest ID.
  const { user: authUser } = useAuth();
  const isGuest = !authUser?.id;
  const activeUserId = authUser?.id ?? null;

  // ─── REFS for always-current values (fixes stale closure bugs) ───
  // React state updates are async — callbacks that capture state via closure
  // may read stale values. Refs are updated synchronously and always current.
  const dbSessionIdRef = useRef<string | null>(null);
  const activeUserIdRef = useRef<string | null>(activeUserId);
  activeUserIdRef.current = activeUserId; // sync on every render


  const [currentView, setCurrentView] = useState<Phase>('home');
  const [session, setSession] = useState<Session | null>(null);

  const [selectedEmotion, setSelectedEmotion] = useState<EmotionOption | null>(null);
  const [selectedBody, setSelectedBody] = useState<BodySensation | null>(null);
  const [userResponse, setUserResponseState] = useState('');
  const [isStable, setIsStable] = useState(false);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<Session[]>([]);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [stepOrder, setStepOrder] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [noBodySensationCount, setNoBodySensationCount] = useState(0);
  const [flowStage, setFlowStage] = useState<FlowStage>('none');
  const [bodyBoundarySet, setBodyBoundarySet] = useState(false);
  const messageOrderRef = useRef(0);

  // ─── PERSONAL PROFILE — persistent cross-session learning ───
  const [personalProfile, setPersonalProfile] = useState<PersonalProfile | null>(null);
  const personalProfileRef = useRef<PersonalProfile | null>(null);

  // ─── CLIENT STATUS MEMORY — reused from coach Sessions page (ik_client_status) ───
  // Silent cross-session AI analysis (persoonsduiding, accumulated insights,
  // progress summary, short status) injected into the live chat for personalization.
  // Loaded once per session start. Never surfaced verbatim to the user.
  const clientStatusMemoryRef = useRef<ClientStatusMemory | null>(null);



  // ─── DB: Save a single message to ik_session_messages ───
  // Delegates to extracted function in src/lib/sessionDb.ts (logic unchanged)
  const saveMessageToDb = useCallback(async (
    sessionId: string | null,
    role: 'user' | 'assistant',
    content: string,
    quickReplies?: string[],
    showBodyMap?: boolean,
    bodyAreaSelected?: string,
  ) => {
    return saveMessageToDbFn(sessionId, role, content, quickReplies, showBodyMap, bodyAreaSelected, messageOrderRef);
  }, []);

  // ─── DB: Save a compass state detection to ik_compass_state_history ───
  // Delegates to extracted function in src/lib/sessionDb.ts (logic unchanged)
  const saveCompassStateToDb = useCallback(async (
    sessionId: string | null,
    primaryState: string,
    secondaryState: string | null,
    confidence: number,
    source: 'client' | 'ai',
    detectedAt?: Date,
  ) => {
    return saveCompassStateToDbFn(sessionId, primaryState, secondaryState, confidence, source, detectedAt);
  }, []);





  const [coachSessions] = useState<CoachSession[]>([
    {
      sessionId: 'demo-1',
      userName: 'Gebruiker',
      date: new Date(2026, 1, 27),
      phases: ['regulation', 'holding'],
      summary: 'Onrust in de borst, thema verbinding. Gebruiker kwam tot rust via ademhaling.',
      emotionWords: ['onrust', 'eenzaamheid', 'verlangen'],
      crisisOccurred: false,
    },
    {
      sessionId: 'demo-2',
      userName: 'Gebruiker',
      date: new Date(2026, 1, 25),
      phases: ['regulation', 'holding', 'kern'],
      summary: 'Verdriet in de buik, thema veiligheid. Kernvraag leidde tot inzicht over patronen.',
      emotionWords: ['verdriet', 'angst', 'hoop'],
      crisisOccurred: false,
    },
    {
      sessionId: 'demo-3',
      userName: 'Gebruiker',
      date: new Date(2026, 1, 20),
      phases: ['regulation'],
      summary: 'Korte sessie. Spanning in schouders. Grounding oefening gedaan.',
      emotionWords: ['spanning', 'druk'],
      crisisOccurred: false,
    },
  ]);

  const startSession = useCallback(async () => {
    // ─── AUTH GUARD: Must be the VERY FIRST check ───
    // Do NOT access activeUserId, substring, loadProfile, or any DB queries
    // before confirming the user is authenticated.
    if (!authUser?.id) {
      console.warn('[SESSION] No authenticated user — aborting session creation. User must log in first.');
      return;
    }
    // After this point, authUser.id is guaranteed to be a non-null string.
    const userId: string = authUser.id;

    const newSession: Session = {
      id: `session-${Date.now()}`,
      startedAt: new Date(),
      currentPhase: 'regulation',
      steps: [],
      messages: [],
      isStable: false,
      crisisDetected: false,
      coachActive: false,
      coachVisible: false,
      detectedMode: null,
      userEmotionWords: [],
      bodyAreas: [],
      silenceMode: false,
      activeAgent: null,
      flowStage: 'none',
      bodyBoundarySet: false,
      regulationDomain: null,
      // Inner Compass architecture — multi-entry routing
      entryPoint: null,
      secondaryEntryPoints: [],
      entryHistory: [],
      compassSignals: [],
      identityThemes: [],
      insightAsRegulation: false,
      // Strength detection
      detectedStrengths: [],
      // Regulation effectiveness tracking
      regulationEffectiveness: [],
      lastAiApproach: null,
      // Inner Compass State Map (12 states)
      compassStateHistory: [],
      currentCompassState: null,
      currentSecondaryCompassState: null,
      reachedRelease: false,
      reachedIntegration: false,
      // Button override
      buttonOverrideActive: false,
      // Mechanism tracking
      detectedMechanisms: [],
    };

    setSession(newSession);

    setSelectedEmotion(null);
    setSelectedBody(null);
    setUserResponseState('');
    setIsStable(false);
    setCrisisDetected(false);
    setStepOrder(0);
    setNoBodySensationCount(0);
    setFlowStage('none');
    setBodyBoundarySet(false);
    messageOrderRef.current = 0;
    setCurrentView('regulation');

    // ─── Load personal profile from database ───
    // v3.7.5 FIX: The stored `ik_personal_profiles.session_count` column only
    // increments when endSession() completes cleanly. In practice almost every
    // user just closes the tab, so session_count stays at 0 even for heavy
    // returning users — which caused the live chat to answer continuity
    // questions as if it were a brand-new session. We now read the REAL
    // prior-session count from `ik_sessions` and correct the in-memory profile
    // so the model and the local fallback both see the user as "returning".
    // The DB row itself is not overwritten here — that's still owned by the
    // profile maintenance loop.
    try {
      const profile = await loadProfile(userId);
      let priorStats: PriorSessionStats = { totalSessions: 0, hasPriorHistory: false, lastSessionStartedAt: null };
      try {
        priorStats = await loadPriorSessionStats(userId);
      } catch (_) {}
      const correctedSessionCount = Math.max(profile.sessionCount || 0, priorStats.totalSessions || 0);
      const correctedProfile = correctedSessionCount > (profile.sessionCount || 0)
        ? { ...profile, sessionCount: correctedSessionCount }
        : profile;
      setPersonalProfile(correctedProfile);
      personalProfileRef.current = correctedProfile;
      console.log(
        `%c[SESSION] Profiel geladen bij sessiestart%c — gebruiker: ${userId.substring(0, 8)}…, profile.sessionCount=${profile.sessionCount}, ik_sessions.count=${priorStats.totalSessions}, returning=${priorStats.hasPriorHistory}, gebruikt=${correctedProfile.sessionCount}`,
        'color: #805ad5; font-weight: bold;',
        'color: #718096;'
      );
    } catch (e) {
      console.error('[SESSION] Fout bij laden profiel:', e);
    }


    // ─── Load coach-side AI analysis memory (ik_client_status) for silent reuse in live chat ───
    // Same source the coach Sessions page reads. Used ONLY as silent context for the model;
    // never surfaced verbatim to the user. Reliability is computed inside loadClientStatusMemory.
    try {
      const statusMemory = await loadClientStatusMemory(userId);
      clientStatusMemoryRef.current = statusMemory;
      console.log('[CLIENT STATUS MEMORY LOAD]', {
  hasStatusMemory: !!statusMemory,
  hasAnalysis: statusMemory?.hasAnalysis ?? null,
  shortStatus: statusMemory?.shortStatus ?? null,
  hasPersoonsduiding: !!statusMemory?.persoonsduiding,
  accumulatedInsightsCount: Array.isArray(statusMemory?.accumulatedInsights)
    ? statusMemory.accumulatedInsights.length
    : 0,
  hasMeaningfulMemory: !!statusMemory?.meaningfulMemory,
  lastAnalysisAt: statusMemory?.lastAnalysisAt ?? null,
});
    } catch (e) {
      console.warn('[SESSION] Fout bij laden analyse-geheugen — live chat gaat door zonder cross-sessie context:', e);
      clientStatusMemoryRef.current = null;
    }


    // ─── Get display name for session record ───
    let userDisplayName: string | null = null;
    try {
      const { data: profileData } = await supabase
        .from('ik_user_profiles')
        .select('display_name')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileData?.display_name) {
        userDisplayName = profileData.display_name;
      }
    } catch (e) {
      // Non-critical
    }

    // ─── Create DB session record ───
    try {
      console.log(
        `%c[SESSION] Sessie aanmaken voor user_id: ${userId.substring(0, 8)}…%c (ingelogd als ${authUser.email || 'onbekend'})`,
        'color: #2b6cb0; font-weight: bold;',
        'color: #718096;'
      );

      const { data, error: insertError } = await supabase.from('ik_sessions').insert({
        user_id: userId,
        started_at: new Date().toISOString(),
        phases: ['regulation'],
        emotion_words: [],
        body_areas: [],
        is_stable: false,
        crisis_detected: false,
        live_mode: false,
        user_display_name: userDisplayName,
      }).select('id').single();

      if (insertError) {
        console.error('[SESSION] DB insert session error:', insertError);
      }
      if (data) {
        // ── CRITICAL: Set ref SYNCHRONOUSLY so it's immediately available ──
        // State (setDbSessionId) is async and won't be available until next render.
        // The ref is available immediately for saveMessageToDb calls.
        dbSessionIdRef.current = data.id;
        setDbSessionId(data.id);
        console.log(
          `%c[SESSION] DB sessie aangemaakt:%c ${data.id} voor user ${userId.substring(0, 8)}…`,
          'color: #38a169; font-weight: bold;',
          'color: #718096;'
        );
      } else {
        console.error('[SESSION] DB insert returned no data — messages will NOT be saved!');
      }
    } catch (e) {
      console.error('DB insert session error', e);
    }
  }, [authUser]);






  const endSession = useCallback(async () => {
    if (session) {
      const endedSession = { ...session, endedAt: new Date() };
      setSessionHistory(prev => [...prev, endedSession]);

      // ─── Merge session data into personal profile and save ───
      const currentProfile = personalProfileRef.current;
      if (currentProfile) {
        try {
          const updatedProfile = mergeSessionIntoProfile(currentProfile, session);
          await saveProfile(updatedProfile);
          setPersonalProfile(updatedProfile);
          personalProfileRef.current = updatedProfile;
          console.log(
            `%c[SESSION] Profiel bijgewerkt bij sessie-einde%c — sessie #${updatedProfile.sessionCount}, ` +
            `${updatedProfile.strengths.length} krachten, ` +
            `${updatedProfile.regulationPathways.length} regulatiepaden, ` +
            `${updatedProfile.emotionalTriggers.length} triggers`,
            'color: #38a169; font-weight: bold;',
            'color: #718096;'
          );
        } catch (e) {
          console.error('[SESSION] Fout bij opslaan profiel na sessie:', e);
        }
      }


      // ─── v3.8: Merge meaningful memory (name / refined style / big moments) and save ───
      // One focused upgrade combining "Save Big Moments" + "Remember My Name" +
      // "Fine Tune Style". Reuses the existing analysisMemory retrieval channel.
      // Noise-resistant by design: dedup by normalized-text similarity,
      // confidence counting, style drift capped per session, decay on
      // unreinforced dimensions, weight×recency ranking with a hard MAX_MOMENTS cap.
      const currentUserIdForMM = activeUserIdRef.current;
      if (currentUserIdForMM) {
        try {
          const summary = summarizeSessionMeaningful(session);
          const existingMM = clientStatusMemoryRef.current?.meaningfulMemory ?? emptyMeaningfulMemory();
          const hasAnySignal =
            !!summary.preferredName ||
            !!summary.assistantRoleName ||
            summary.momentCandidates.length > 0 ||
            Object.values(summary.styleDelta).some((v) => Math.abs(v) >= 0.05);
          if (hasAnySignal) {
            const mergedMM = mergeSessionIntoMeaningfulMemory(existingMM, summary);
            await saveMeaningfulMemory(currentUserIdForMM, mergedMM);
            // Update in-memory ref so next sendMessage in the same app lifecycle
            // (if the user starts another session without a reload) sees latest.
            if (clientStatusMemoryRef.current) {
              clientStatusMemoryRef.current = {
                ...clientStatusMemoryRef.current,
                meaningfulMemory: mergedMM,
                hasAnalysis: true,
              };
            } else {
              clientStatusMemoryRef.current = {
                hasAnalysis: true,
                lastAnalysisAt: null,
                shortStatus: null,
                progressSummary: null,
                accumulatedInsights: [],
                persoonsduiding: null,
                isReliableContinuity: false,
                meaningfulMemory: mergedMM,
              };
            }
            console.log(
              `%c[MEANINGFUL MEMORY] Sessie-einde merge%c — new/confirmed moments: ${summary.momentCandidates.length}, name: ${summary.preferredName || '—'}, assistantRole: ${summary.assistantRoleName || '—'}`,
              'color: #805ad5; font-weight: bold;',
              'color: #718096;'
            );
          }
        } catch (e) {
          console.warn('[MEANINGFUL MEMORY] Fout bij merge/save bij sessie-einde:', e);
        }
      }


      // ─── Update DB session record ───
      if (dbSessionId) {
        try {
          const phases = [...new Set(session.steps.map(s => s.phase).filter(p => p !== 'home' && p !== 'ending'))];
          await supabase.from('ik_sessions').update({
            ended_at: new Date().toISOString(),
            phases: phases.length > 0 ? phases : ['regulation'],
            emotion_words: session.userEmotionWords,
            body_areas: [...new Set(session.bodyAreas)],
            is_stable: session.isStable,
            crisis_detected: session.crisisDetected,
          }).eq('id', dbSessionId);
        } catch (e) {
          console.error('DB update session error', e);
        }
      }

      // ─── Trigger AI coach analysis + session summary (fire-and-forget) ───
      // Use activeUserIdRef.current for the most current value (avoids stale closure)
      const currentUserId = activeUserIdRef.current;
      if (dbSessionId && currentUserId) {
        try {
          console.log(
            `%c[COACH ANALYSIS] Triggering AI analysis + session summary for user ${currentUserId.substring(0, 8)}…, session ${dbSessionId.substring(0, 8)}…`,
            'color: #805ad5; font-weight: bold;'
          );
          supabase.functions.invoke('inner-kompas-coach-analysis', {
            body: { user_id: currentUserId, session_id: dbSessionId, requesting_user_id: currentUserId }

          }).then(({ data, error }) => {
            if (error) {
              console.warn('[COACH ANALYSIS] Edge function error:', error);
            } else if (data?.error) {
              console.warn('[COACH ANALYSIS] Analysis error:', data.error);
            } else {
              console.log(
                `%c[COACH ANALYSIS] Analysis complete:%c status="${(data?.short_status || '').substring(0, 60)}…", ${(data?.accumulated_insights || []).length} inzichten`,
                'color: #38a169; font-weight: bold;',
                'color: #718096;'
              );
              if (data?.session_summary) {
                console.log(
                  `%c[SESSION SUMMARY] AI-generated:%c "${(data.session_summary || '').substring(0, 80)}…"`,
                  'color: #38a169; font-weight: bold;',
                  'color: #718096;'
                );
              }
            }
          }).catch(e => {
            console.warn('[COACH ANALYSIS] Failed to trigger analysis:', e);
          });
        } catch (e) {
          console.warn('[COACH ANALYSIS] Failed to invoke analysis:', e);
        }
      }
    }
    setCurrentView('ending');
  }, [session, dbSessionId]);





  const addStep = useCallback(async (step: Partial<SessionStep>) => {
    if (!session) return;
    const newStep: SessionStep = {
      id: `step-${Date.now()}`,
      phase: session.currentPhase,
      prompt: step.prompt || '',
      userResponse: step.userResponse,
      selectedEmotion: step.selectedEmotion,
      selectedBody: step.selectedBody,
      timestamp: new Date(),
    };
    setSession(prev => prev ? { ...prev, steps: [...prev.steps, newStep] } : null);
    const newOrder = stepOrder + 1;
    setStepOrder(newOrder);

    if (dbSessionId) {
      try {
        await supabase.from('ik_session_steps').insert({
          session_id: dbSessionId,
          phase: session.currentPhase,
          prompt: step.prompt || '',
          user_response: step.userResponse || null,
          selected_emotion: step.selectedEmotion?.label || null,
          selected_body_area: step.selectedBody?.area || null,
          body_intensity: step.selectedBody?.intensity || null,
          step_order: newOrder,
        });
      } catch (e) {
        console.error('DB insert step error', e);
      }
    }
  }, [session, dbSessionId, stepOrder]);

  const setPhase = useCallback(async (phase: Phase) => {
    setSession(prev => prev ? { ...prev, currentPhase: phase } : null);
    setCurrentView(phase);
    if (dbSessionId && phase !== 'ending' && phase !== 'home') {
      try {
        const { data } = await supabase.from('ik_sessions').select('phases').eq('id', dbSessionId).single();
        if (data) {
          const phases = [...new Set([...(data.phases || []), phase])];
          await supabase.from('ik_sessions').update({ phases }).eq('id', dbSessionId);
        }
      } catch (e) {
        console.error('DB update phases error', e);
      }
    }
  }, [dbSessionId]);

  const selectEmotion = useCallback(async (emotion: EmotionOption) => {
    setSelectedEmotion(emotion);
    if (session) {
      const newWords = [...new Set([...session.userEmotionWords, emotion.label.toLowerCase()])];
      setSession(prev => prev ? { ...prev, userEmotionWords: newWords } : null);
      if (dbSessionId) {
        try {
          await supabase.from('ik_sessions').update({ emotion_words: newWords }).eq('id', dbSessionId);
        } catch (e) {
          console.error('DB update emotions error', e);
        }
      }
    }
  }, [session, dbSessionId]);

  const selectBodyArea = useCallback(async (sensation: BodySensation) => {
    setSelectedBody(sensation);
    if (dbSessionId) {
      try {
        const { data } = await supabase.from('ik_sessions').select('body_areas').eq('id', dbSessionId).single();
        if (data) {
          const areas = [...new Set([...(data.body_areas || []), sensation.area])];
          await supabase.from('ik_sessions').update({ body_areas: areas }).eq('id', dbSessionId);
        }
      } catch (e) {
        console.error('DB update body areas error', e);
      }
    }
  }, [dbSessionId]);

  const setUserResponse = useCallback((response: string) => {
    setUserResponseState(response);
  }, []);

  // ─── CRISIS DETECTION (PRECISE) ───
  // Uses the new detectCrisis() function which only triggers on genuinely suicidal/self-harm phrases.
  // The old CRISIS_KEYWORDS list caused false positives on common Dutch phrases like "niet meer", "pijn", etc.
  const checkForCrisis = useCallback((text: string): boolean => {
    console.log(`%c[SESSION] checkForCrisis aangeroepen%c — "${text.substring(0, 80)}${text.length > 80 ? '…' : ''}"`, 'color: #4a5568; font-weight: bold;', 'color: #718096;');
    const detected = detectCrisis(text);
    if (detected) {
      console.log(`%c[SESSION] CRISIS BEVESTIGD — CrisisHandler wordt geactiveerd`, 'color: #e53e3e; font-weight: bold;');
      setCrisisDetected(true);
      setSession(prev => prev ? { ...prev, crisisDetected: true } : null);
    } else {
      console.log(`%c[SESSION] Geen crisis — gesprek gaat door`, 'color: #38a169;');
    }
    return detected;
  }, []);



  const detectMode = useCallback((text: string): DetectedMode => {
    const lower = text.toLowerCase();
    const bodyWords = ['voel', 'lichaam', 'spanning', 'warm', 'koud', 'tintel', 'druk', 'zwaar', 'licht', 'pijn', 'buik', 'borst', 'hoofd', 'keel'];
    const reflectionWords = ['denk', 'besef', 'snap', 'begrijp', 'herken', 'patroon', 'altijd', 'nooit', 'waarom'];
    const bodyScore = bodyWords.filter(w => lower.includes(w)).length;
    const reflectionScore = reflectionWords.filter(w => lower.includes(w)).length;
    if (bodyScore > reflectionScore) return 'body';
    if (reflectionScore > bodyScore) return 'reflection';
    return 'story';
  }, []);

  const checkDysregulation = useCallback((text: string): boolean => {
    const lower = text.toLowerCase();
    return DYSREGULATION_WORDS.some(word => lower.includes(word));
  }, []);

  const setSessionMode = useCallback((mode: DetectedMode) => {
    setSession(prev => prev ? { ...prev, detectedMode: mode } : null);
  }, []);

  const addEmotionWord = useCallback(async (word: string) => {
    if (!session) return;
    const trimmed = word.trim().toLowerCase();
    if (!trimmed) return;
    const newWords = [...new Set([...session.userEmotionWords, trimmed])];
    setSession(prev => prev ? { ...prev, userEmotionWords: newWords } : null);
    if (dbSessionId) {
      try {
        await supabase.from('ik_sessions').update({ emotion_words: newWords }).eq('id', dbSessionId);
      } catch (e) {
        console.error('DB update emotions error', e);
      }
    }
  }, [session, dbSessionId]);

  const markStable = useCallback(() => {
    setIsStable(true);
    setSession(prev => prev ? { ...prev, isStable: true } : null);
  }, []);

  const resetCrisis = useCallback(() => {
    setCrisisDetected(false);
    setSession(prev => prev ? { ...prev, crisisDetected: false } : null);
  }, []);

  const activateCoach = useCallback(() => {
    setSession(prev => prev ? { ...prev, coachActive: true, coachVisible: true } : null);
  }, []);

  const deactivateCoach = useCallback(() => {
    setSession(prev => prev ? { ...prev, coachActive: false } : null);
  }, []);

  const toggleCoachVisible = useCallback(async () => {
    const newValue = !(session?.coachVisible ?? false);
    setSession(prev => prev ? { ...prev, coachVisible: newValue } : null);
    // Persist live_mode to DB
    if (dbSessionId) {
      try {
        await supabase.from('ik_sessions').update({ live_mode: newValue }).eq('id', dbSessionId);
      } catch (e) {
        console.error('DB update live_mode error', e);
      }
    }
  }, [session?.coachVisible, dbSessionId]);



  // ─── CONVERSATION ───

  const addAssistantMessage = useCallback((content: string, quickReplies?: string[], showBodyMap?: boolean) => {
  if (crisisDetected) return;

  const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      role: 'assistant',
      content,
      timestamp: new Date(),
      quickReplies,
      showBodyMap,
    };
    setSession(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : null);
    // Save to DB — use ref for always-current session ID (state may be stale in closures)
    saveMessageToDb(dbSessionIdRef.current, 'assistant', content, quickReplies, showBodyMap);
  }, [saveMessageToDb, crisisDetected]);



  const selectBodyInChat = useCallback((area: BodyArea) => {
    setSession(prev => {
      if (!prev) return null;
      const msgs = [...prev.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].showBodyMap) {
          msgs[i] = { ...msgs[i], bodyAreaSelected: area };
          break;
        }
      }
      const newAreas = [...new Set([...prev.bodyAreas, area])];
      return { ...prev, messages: msgs, bodyAreas: newAreas };
    });
    selectBodyArea({ area, description: '', intensity: 3 });
  }, [selectBodyArea]);

  const sendMessage = useCallback(async (text: string): Promise<AIResponse | null> => {
    if (!session || !text.trim()) return null;

    // ── Client-side detections (extracted to src/lib/clientDetections.ts) ──
    const detections = runClientDetections(text, session.messages);
    const {
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
    } = detections;




    // ── BUTTON OVERRIDE DETECTION ──
    // Persists across messages — only released when user explicitly asks for buttons back
    const isButtonOverrideRequest = detectButtonOverrideRequest(text);
    const isButtonOverrideRelease = detectButtonOverrideRelease(text);
    if (isButtonOverrideRequest) {
      setSession(prev => prev ? { ...prev, buttonOverrideActive: true } : null);
      console.log('%c[BUTTON OVERRIDE] Knoppen uitgeschakeld op verzoek van gebruiker', 'color: #dd6b20; font-weight: bold;');
    } else if (isButtonOverrideRelease) {
      setSession(prev => prev ? { ...prev, buttonOverrideActive: false } : null);
      console.log('%c[BUTTON OVERRIDE] Knoppen weer ingeschakeld op verzoek van gebruiker', 'color: #38a169; font-weight: bold;');
    }



    // ── LICHAAM-GRENS detection ──
    const isBodyBoundary = detectBodyBoundary(text);
    let currentBodyBoundary = bodyBoundarySet;
    if (isBodyBoundary || innerFocusWorsening) {
      currentBodyBoundary = true;
      setBodyBoundarySet(true);
      setSession(prev => prev ? { ...prev, bodyBoundarySet: true } : null);
    }

    // ── Inner Compass detection and tracking (extracted to src/lib/compassDetections.ts) ──
    const compassDetections = runCompassDetections({
      text,
      isOverwhelmed,
      isRelaxing,
      isSomaticEntry,
      isCognitiveEntry,
      isTraumaActivation,
      isFixControl,
      lastMessageHasEmotion,
      emotionWords: emotionDetection.words,
      innerFocusWorsening,
      lastMessageProcessFrustration,
      entryHistory: session.entryHistory || [],
      detectedStrengths: session.detectedStrengths || [],
      regulationEffectiveness: session.regulationEffectiveness || [],
      lastAiApproach: session.lastAiApproach,
      messagesLength: session.messages.length,
      compassStateHistory: session.compassStateHistory || [],
      currentCompassState: session.currentCompassState,
    });
    const {
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
    } = compassDetections;

    // ── Persist client-side compass state detection to DB ──
    if (compassStateResult.primary) {
      saveCompassStateToDb(
        dbSessionIdRef.current,
        compassStateResult.primary,
        compassStateResult.secondary,
        compassStateResult.confidence,
        'client',
        compassStateResult.timestamp,
      );
    }



    // Update session with new Inner Compass data (including compass state)
    // ── Delegates to extracted function in src/lib/sessionUpdaters.ts (logic unchanged) ──
    setSession(prev => prev ? {
      ...prev,
      ...buildCompassSessionUpdate(
        {
          entryResultPrimary: entryResult.primary,
          entryResultSecondary: entryResult.secondary,
          currentEntryHistory,
          compassResultHasSignal: compassResult.hasSignal,
          compassResultSignals: compassResult.signals,
          currentStrengths,
          currentEffectiveness,
          isInsightEntry,
          currentCompassStateHistory,
          compassStateResultPrimary: compassStateResult.primary,
          compassStateResultSecondary: compassStateResult.secondary,
        },
        {
          compassSignals: prev.compassSignals,
          insightAsRegulation: prev.insightAsRegulation,
          currentCompassState: prev.currentCompassState,
          currentSecondaryCompassState: prev.currentSecondaryCompassState,
          reachedRelease: prev.reachedRelease,
          reachedIntegration: prev.reachedIntegration,
        },
      ),
    } : null);


    if (emotionDetection.hasEmotion && emotionDetection.words.length > 0) {
      for (const w of emotionDetection.words) { addEmotionWord(w); }
    }

    // ── Flow stage advancement — delegates to extracted function in src/lib/flowStageAdvancement.ts (logic unchanged) ──
    const currentFlowStage = advanceFlowStage(flowStage, {
      isRelaxing,
      isSomaticEntry,
      lastMessageHasStoryTrigger,
      lastMessageHasEmotion,
      lastMessageHasBodySensation,
      currentBodyBoundary,
    });


    setFlowStage(currentFlowStage);
    setSession(prev => prev ? { ...prev, flowStage: currentFlowStage } : null);

    // ── Kern readiness detection (Fase 2→3 transition) ──
    const kernReadiness = detectKernReadiness(text, {
      isOverwhelmed,
      isRelaxing,
      isInsightEntry,
      isMeaningIdentityEntry,
      isTraumaActivation,
      innerFocusWorsening,
      messageCount: session.messages.length + 1,
      compassState: compassStateResult.primary || session.currentCompassState,
      reachedRelease: session.reachedRelease || compassStateResult.primary === 'release_movement',
      reachedIntegration: session.reachedIntegration || compassStateResult.primary === 'integration',
    });

    // Log kern readiness for debugging
    if (kernReadiness.readinessScore > 0.15) {
      console.log(
        `%c[KERN READINESS] score: ${kernReadiness.readinessScore.toFixed(2)}, ready: ${kernReadiness.isReady}%c — signals: ${kernReadiness.signals.slice(0, 3).join(', ')}${kernReadiness.blockingSignals.length > 0 ? ' | blocking: ' + kernReadiness.blockingSignals.slice(0, 2).join(', ') : ''}`,
        kernReadiness.isReady ? 'color: #38a169; font-weight: bold;' : 'color: #d69e2e;',
        'color: #718096;'
      );
    }

    // ── Alignment readiness detection (Fase 3→4 transition) ──
    const alignmentReadiness = detectAlignmentReadiness(text, {
      isRelaxing,
      isInsightEntry,
      isMeaningIdentityEntry,
      isOverwhelmed,
      compassState: compassStateResult.primary || session.currentCompassState,
      reachedIntegration: session.reachedIntegration || compassStateResult.primary === 'integration',
      reachedRelease: session.reachedRelease || compassStateResult.primary === 'release_movement',
      messageCount: session.messages.length + 1,
      currentPhase: session.currentPhase,
    });

    // Log alignment readiness for debugging
    if (alignmentReadiness.readinessScore > 0.15) {
      console.log(
        `%c[ALIGNMENT READINESS] score: ${alignmentReadiness.readinessScore.toFixed(2)}, ready: ${alignmentReadiness.isReady}%c — signals: ${alignmentReadiness.signals.slice(0, 3).join(', ')}${alignmentReadiness.blockingSignals.length > 0 ? ' | blocking: ' + alignmentReadiness.blockingSignals.slice(0, 2).join(', ') : ''}`,
        alignmentReadiness.isReady ? 'color: #38a169; font-weight: bold;' : 'color: #d69e2e;',
        'color: #718096;'
      );
    }

    // ── Build flow instructions for AI (with all detections including Inner Compass + State Map + Kern Readiness + Alignment Readiness + Neurodivergent) ──
    const flowInstructions = buildFlowInstructions({
      flowStage: currentFlowStage,
      isOverwhelmed,
      isRelaxing,
      isSlowingDown,
      lastMessageHasEmotion,
      lastMessageHasBodySensation,
      lastMessageHasStoryTrigger,
      lastMessageProcessFrustration,
      noBodySensationCount,
      messageCount: session.messages.length + 1,
      bodyBoundarySet: currentBodyBoundary,
      // New detections
      isSomaticEntry,
      isCognitiveEntry,
      isTraumaActivation,
      isFixControl,
      innerFocusWorsening,
      // Inner Compass additions
      isInsightEntry,
      isMeaningIdentityEntry,
      compassSignals: compassResult.hasSignal ? compassResult.signals : undefined,
      detectedEntryPoint: entryResult.primary,
      secondaryEntryPoints: entryResult.secondary,
      detectedStrengths: userStrengths.length > 0 ? userStrengths : undefined,
      entryHistory: currentEntryHistory,
      regulationEffectiveness: currentEffectiveness.length > 0 ? currentEffectiveness : undefined,
      // Inner Compass State Map (12 states)
      clientDetectedCompassState: compassStateResult.primary,
      clientDetectedSecondaryCompassState: compassStateResult.secondary,
      compassStateHistory: currentCompassStateHistory.length > 0 ? currentCompassStateHistory : undefined,
      previousCompassState,
      // ─── KERN READINESS (Fase 2→3 transitie) ───
      currentPhase: session.currentPhase,
      kernReadiness,
      // ─── ALIGNMENT READINESS (Fase 3→4 transitie) ───
      alignmentReadiness,
      // ─── CONVERSATION QUALITY RULES ───
      isQuietResponse,
      consecutiveQuietResponses,
      isAnalysisRequest,
      isReflectiveDepth,
      isSessionContinuation,
      // ─── REFLECTIVE SPARRING PARTNER MODE ───
      isHighSelfAwareness,
      dominantLayer,
      isInsightPriorityRequest,
      recentAiQuestionCount,
      // ─── PATTERN RECOGNITION AND REFLECTIVE COACHING ───
      isPatternDescription: patternAnalysis.isPatternDescription,
      patternMechanism: patternAnalysis.estimatedMechanism,
      patternOnsetSignals: patternAnalysis.onsetSignals,
      // ─── BROAD MECHANISM DETECTION (runs on every message) ───
      broadMechanism: broadMechanism,
      // ─── NEURODIVERGENT / PROCESSING PATTERN DETECTION ───
      neurodivergentSignals: neurodivergentResult.signals.length > 0 ? neurodivergentResult.signals : undefined,
      neurodivergentAdaptations: neurodivergentResult.suggestedAdaptations.length > 0 ? neurodivergentResult.suggestedAdaptations : undefined,
      detectedLanguageStyles: detectedLanguageStyles.length > 0 ? detectedLanguageStyles : undefined,
      rejectedLanguageStyles: rejectedLanguageStyles.length > 0 ? rejectedLanguageStyles : undefined,
      directRequest: directRequest,
      needsLeadership: needsLeadership || undefined,
    });



    // Add user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    
    const updatedMessages = [...session.messages, userMsg];
    setSession(prev => prev ? { ...prev, messages: updatedMessages } : null);
    addStep({ prompt: 'Gebruiker', userResponse: text.trim() });
    // Save user message to DB
    saveMessageToDb(dbSessionIdRef.current, 'user', text.trim());

    // ── Message preprocessing (extracted to src/lib/messagePreprocessing.ts) ──
    const {
      lastMessageNoBodySensation,
      currentNoBodyCount,
      somaticCluster,
      alreadyDescribedBodySignals,
    } = preprocessMessageContext({
      messages: session.messages,
      updatedMessages,
      text,
      lastMessageProcessFrustration,
      noBodySensationCount,
    });

    if (lastMessageNoBodySensation) {
      setNoBodySensationCount(currentNoBodyCount);
    }


    // ── Local helper: captures current scope variables for fallback context (deduplicates 3 identical calls) ──
    // v3.7.3: also carries clientStatusMemory so the fallback can answer
    // continuity questions from memory instead of routing them into a
    // regulation / holding template.
    const buildCurrentFallbackContext = () => buildFallbackContext({
      currentFlowStage,
      isOverwhelmed,
      isRelaxing,
      isSomaticEntry,
      isCognitiveEntry,
      isTraumaActivation,
      lastMessageHasEmotion,
      lastMessageHasBodySensation,
      lastMessageHasStoryTrigger,
      lastMessageProcessFrustration,
      innerFocusWorsening,
      currentBodyBoundary,
      updatedMessagesLength: updatedMessages.length,
      userText: text.trim(),
      recentUserTurns: updatedMessages
  .filter((m) => m.role === 'user')
  .slice(-4)
  .map((m) => String(m.content || '')),
      compassStatePrimary: compassStateResult.primary,
      isHighSelfAwareness,
      isInsightPriorityRequest,
      dominantLayer,
      recentAiQuestionCount,
      isQuietResponse,
      consecutiveQuietResponses,
      clientStatusMemory: clientStatusMemoryRef.current,
    });



    const isCrisis = checkForCrisis(text);
    setIsAiLoading(true);

    // ── Build invoke body — delegates to extracted function in src/lib/buildInvokePayload.ts (logic unchanged) ──
    const invokeBody = buildInvokePayload({
      updatedMessages,
      phase: session.currentPhase,
      detectedMode: session.detectedMode,
      userEmotionWords: session.userEmotionWords,
      detectedEmotionWords: emotionDetection.words,
      bodyAreas: session.bodyAreas,
      isStable: session.isStable,
      userText: text.trim(),
      flowStage: currentFlowStage,
      noBodySensationCount: currentNoBodyCount,
      lastMessageHasEmotion,
      lastMessageNoBodySensation,
      lastMessageProcessFrustration,
      lastMessageHasStoryTrigger,
      lastMessageHasBodySensation,
      isRelaxing,
      isOverwhelmed,
      isSlowingDown,
      flowInstructions,
      bodyBoundarySet: currentBodyBoundary,
      bodyBoundaryJustSet: isBodyBoundary,
      isSomaticEntry,
      isCognitiveEntry,
      isTraumaActivation,
      isFixControl,
      innerFocusWorsening,
      personalProfile: personalProfileRef.current,
      somaticCluster,
      alreadyDescribedBodySignals,
      // ── Silent cross-session AI analysis memory (same source as coach Sessions page) ──
      analysisMemory: clientStatusMemoryRef.current,
    });





    // ── Robust AI invocation with timeout, retries, and direct-fetch fallback ──
    // Delegates to extracted function in src/lib/aiInvoke.ts (logic unchanged)
    try {
      const { data, lastError } = await invokeAIWithRetries(invokeBody, supabase, isValidAIResponse);
      console.log('[AI MEMORY INPUT]', {
  userText: text,
  userId: activeUserIdRef.current,
  hasProfile: !!invokeBody.sessionContext?.personalProfile,
  hasAnalysisMemory: !!invokeBody.sessionContext?.analysisMemory,
  sessionCount: invokeBody.sessionContext?.personalProfile?.sessionCount ?? null,
  recurringThemesCount: invokeBody.sessionContext?.personalProfile?.recurringThemes?.length ?? 0,
  analysisShortStatus: invokeBody.sessionContext?.analysisMemory?.shortStatus ?? null,
  hasPersoonsduiding: !!invokeBody.sessionContext?.analysisMemory?.persoonsduiding,
});
      
      console.log('[AI DEBUG SEND]', {
  userText: text,
  hasData: !!data,
  lastError,
  shortCircuit: data?._shortCircuit,
  fallbackKind: data?._fallbackKind,
  message: data?.message,
});

      if (!data) {
       console.log(
  '%c[AI] LOCAL FALLBACK USED (no data from edge):%c',
  'color: #dd6b20; font-weight: bold;',
  'color: #718096;',
  {
    lastError,
  }
);

        // ── LOCAL FALLBACK: Generate context-aware response when edge function is unreachable ──
        const fallbackResponse = generateFallbackResponse(buildCurrentFallbackContext());


        console.log(`%c[AI] Fallback response generated:%c "${fallbackResponse.message.substring(0, 80)}..."`, 'color: #d69e2e; font-weight: bold;', 'color: #718096;');
        addAssistantMessage(
          fallbackResponse.message,
          fallbackResponse.quickReplies?.length > 0 ? fallbackResponse.quickReplies : undefined,
          fallbackResponse.showBodyMap,
        );
        return fallbackResponse;
      }

      // ── FINAL VALIDATION GUARD ──
      // Even after passing the retry loop, validate once more before processing.
      // This catches edge cases where data was set but somehow bypassed validation.
      if (
  !isValidAIResponse(data) &&
  !data?._shortCircuit &&
  !data?._fallbackKind
) {
        console.error(`%c[AI] Response passed retry loop but failed final validation — using local fallback%c`, 'color: #e53e3e; font-weight: bold;', 'color: #718096;', data);
        const fallbackResponse = generateFallbackResponse(buildCurrentFallbackContext());


        addAssistantMessage(
          fallbackResponse.message,
          fallbackResponse.quickReplies?.length > 0 ? fallbackResponse.quickReplies : undefined,
          fallbackResponse.showBodyMap,
        );
        return fallbackResponse;
      }

      const aiResponse = data as AIResponse;


      // ── CLIENT-SIDE GUARD: Strip bullet-point lists from message → move to quickReplies ──
      const { cleanMessage, extractedReplies } = stripBulletsFromMessage(
        aiResponse.message,
        aiResponse.quickReplies
      );
      aiResponse.message = cleanMessage;
      if (extractedReplies.length > 0) {
        aiResponse.quickReplies = extractedReplies;
      }

      // ── CLIENT-SIDE SANITIZATION: Clean raw JSON from message + sanitize quick replies ──
      aiResponse.message = cleanRawJsonFromMessage(aiResponse.message);
      aiResponse.quickReplies = sanitizeQuickRepliesClient(aiResponse.quickReplies);

      // ── FINAL SAFETY NET: Check if the cleaned message STILL contains leaked error strings ──
      // This catches edge cases where the edge function wraps errors in therapeutic-looking text
      // that passes validation but still contains technical error strings after cleaning.
      if (
  containsLeakedError(aiResponse.message) &&
  !aiResponse?._shortCircuit &&
  !aiResponse?._fallbackKind
) {
        console.error(
          `%c[AI] Cleaned message still contains error pattern — using local fallback%c: "${aiResponse.message.substring(0, 120)}"`,
          'color: #e53e3e; font-weight: bold;',
          'color: #718096;'
        );
        const fallbackResponse = generateFallbackResponse(buildCurrentFallbackContext());
        addAssistantMessage(
          fallbackResponse.message,
          fallbackResponse.quickReplies?.length > 0 ? fallbackResponse.quickReplies : undefined,
          fallbackResponse.showBodyMap,
        );
        return fallbackResponse;
      }



      if (aiResponse.detectedMode && !session.detectedMode) {
        setSessionMode(aiResponse.detectedMode);
      }
      if (aiResponse.emotionWords?.length > 0) {
        for (const word of aiResponse.emotionWords) { addEmotionWord(word); }
      }
      if (aiResponse.markStable) { markStable(); }
      if (aiResponse.crisis || isCrisis) {
        setCrisisDetected(true);
        setSession(prev => prev ? { ...prev, crisisDetected: true } : null);
      }

      // ── Force showBodyMap=false when body boundary is set OR somatic cluster is active ──
      // Somatic cluster = 2+ body signals already described → don't pull back into body inquiry
      const finalShowBodyMap = (currentBodyBoundary || somaticCluster.isCluster) ? false : !!aiResponse.showBodyMap;


      // ── Merge AI response fields into session state ──
      const aiApproach = detectAiApproach(aiResponse.message, aiResponse.activeAgent, aiResponse.regulationDomain);

      // ── Process AI-detected compass state (overrides client-side detection if present) ──
      const aiCompassState = aiResponse.compassState || null;
      const aiSecondaryCompassState = aiResponse.secondaryCompassState || null;

      // Log compass state detection from AI
      if (aiCompassState) {
        console.log(
          `%c[COMPASS STATE] AI-detected:%c primary=${aiCompassState}, secondary=${aiSecondaryCompassState || 'none'}`,
          'color: #805ad5; font-weight: bold;',
          'color: #718096;'
        );
      }

      // If AI detected a compass state, add it to history and update session
      // AI detection takes priority over client-side detection
      const aiCompassStateDetection: CompassStateDetection | null = aiCompassState ? {
        primary: aiCompassState as CompassState,
        secondary: (aiSecondaryCompassState as CompassState) || null,
        confidence: 0.8, // AI detection has higher base confidence
        timestamp: new Date(),
      } : null;

      // ── Persist AI-detected compass state to DB ──
      if (aiCompassStateDetection && aiCompassStateDetection.primary) {
        saveCompassStateToDb(
          dbSessionIdRef.current,
          aiCompassStateDetection.primary,
          aiCompassStateDetection.secondary,
          aiCompassStateDetection.confidence,
          'ai',
          aiCompassStateDetection.timestamp,
        );
      }


      // ── Delegates to extracted function in src/lib/sessionUpdaters.ts (logic unchanged) ──
      setSession(prev => prev ? {
        ...prev,
        ...buildAIResponseSessionUpdate(
          {
            silenceMode: aiResponse.silenceMode,
            activeAgent: aiResponse.activeAgent,
            regulationDomain: aiResponse.regulationDomain,
            compassSignals: aiResponse.compassSignals,
            identityThemes: aiResponse.identityThemes,
            insightOffered: aiResponse.insightOffered,
            aiApproach,
            aiCompassState,
            aiSecondaryCompassState,
            aiCompassStateDetection,
          },
          {
            regulationDomain: prev.regulationDomain,
            compassSignals: prev.compassSignals,
            identityThemes: prev.identityThemes,
            insightAsRegulation: prev.insightAsRegulation,
            currentCompassState: prev.currentCompassState,
            currentSecondaryCompassState: prev.currentSecondaryCompassState,
            compassStateHistory: prev.compassStateHistory,
            reachedRelease: prev.reachedRelease,
            reachedIntegration: prev.reachedIntegration,
          },
        ),
      } : null);



      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: aiResponse.message,
        timestamp: new Date(),
        quickReplies: aiResponse.quickReplies?.length > 0 ? aiResponse.quickReplies.slice(0, 3) : undefined,
        showBodyMap: finalShowBodyMap,
      };

      setSession(prev => prev ? { ...prev, messages: [...prev.messages, assistantMsg] } : null);
      addStep({ prompt: aiResponse.message });
      saveMessageToDb(
        dbSessionIdRef.current,
        'assistant',
        aiResponse.message,
        assistantMsg.quickReplies,
        finalShowBodyMap,
      );

      if (aiResponse.phaseTransition) {
        if (aiResponse.phaseTransition === 'ending') {
          setTimeout(() => { endSession(); }, 2000);
        } else {
          setPhase(aiResponse.phaseTransition as Phase);
        }
      }

      return aiResponse;
    } catch (e: any) {
      console.error(
  '%c[AI] LOCAL FALLBACK USED (sendMessage catch):%c',
  'color: #dd6b20; font-weight: bold;',
  'color: #718096;',
  e?.message || e
);
      // ── LOCAL FALLBACK: Generate context-aware response on unexpected errors ──
      const fallbackResponse = generateFallbackResponse(buildCurrentFallbackContext());


      addAssistantMessage(
        fallbackResponse.message,
        fallbackResponse.quickReplies?.length > 0 ? fallbackResponse.quickReplies : undefined,
        fallbackResponse.showBodyMap,
      );
      return fallbackResponse;

    } finally {
      setIsAiLoading(false);
    }

  }, [session, noBodySensationCount, flowStage, bodyBoundarySet, addStep, checkForCrisis, setSessionMode, addEmotionWord, markStable, addAssistantMessage, setPhase, endSession, saveMessageToDb, saveCompassStateToDb]);






  // ─── Diagnostic helper: read ref value on demand ───
  const getDbSessionIdRef = useCallback(() => dbSessionIdRef.current, []);

  return (
    <SessionContext.Provider value={{
      currentView, setCurrentView, session, startSession, endSession,
      addStep, setPhase, selectEmotion, selectBodyArea, setUserResponse,
      checkForCrisis, checkDysregulation, detectMode, setSessionMode, addEmotionWord,
      markStable, resetCrisis,
      activateCoach, deactivateCoach, toggleCoachVisible, coachSessions,
      sendMessage, addAssistantMessage, selectBodyInChat, isAiLoading,
      selectedEmotion, selectedBody, userResponse,
      isStable, crisisDetected, sessionHistory, dbSessionId,
      activeUserId, isGuest, getDbSessionIdRef,
    }}>
      {children}
    </SessionContext.Provider>
  );

}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
