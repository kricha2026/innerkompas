/**
 * ─── PERSONAL PROFILE MANAGER ───
 * 
 * A living pattern model that gradually learns about the user across sessions.
 * Patterns are revisable — the system does not treat repeated patterns as fixed identity,
 * but as current understanding that may evolve over time.
 * 
 * This module handles:
 * - Loading profile from database at session start
 * - Merging session data into profile at session end
 * - Adaptive confidence scoring (patterns decay if not seen recently)
 * - Strength detection and accumulation
 * - Regulation effectiveness tracking across sessions
 * - Response style preference learning
 */

import type {
  PersonalProfile,
  EntryPoint,
  StrengthType,
  RegulationEffectiveness,
  RegulationDomain,
  Session,
  CompassState,
  PatternMechanism,
  DominantLayer,
} from '@/lib/types';
import { PATTERN_MECHANISM_LABELS, MECHANISM_HUMAN_TRANSLATIONS } from '@/lib/types';
import { supabase } from '@/lib/supabase';



// ─── Database row shape ───
interface ProfileRow {
  id: string;
  user_id: string;
  emotional_triggers: Array<{ pattern: string; confidence: number; lastSeen: string }>;
  sensitivity_patterns: Array<{ pattern: string; confidence: number; lastSeen: string }>;
  thinking_styles: string[];
  regulation_pathways: Array<{
    approach: string;
    helpedCount: number;
    totalCount: number;
    lastUsed: string;
  }>;
  preferred_entry_points: Array<{ entry: string; frequency: number }>;
  recurring_themes: Array<{ theme: string; count: number; lastSeen: string }>;
  strengths: Array<{ type: string; confidence: number; lastSeen: string }>;
  escalation_signals: Array<{ signal: string; confidence: number; lastSeen: string }>;
  preferred_response_style: {
    directness: number;
    softness: number;
    explanation: number;
    bodyFocus: number;
    meaningExploration: number;
  };
  what_helped: Array<{
    approach: string;
    helped: boolean;
    timestamp: string;
    context?: string;
  }>;
  compass_state_patterns: Array<{
    state: string;
    frequency: number;
    typicalTriggers: string[];
    helpedApproaches: string[];
    unhelpedApproaches: string[];
    typicalTransitions: string[];
    lastSeen: string;
  }>;
  session_count: number;
  revision_history: Array<{ field: string; oldValue: string; newValue: string; date: string }>;
  created_at: string;
  updated_at: string;
}


/**
 * ─── Safe JSONB array parser ───
 * 
 * PostgREST/Supabase can return JSONB array columns in unexpected formats:
 * - `[]` (correct — already an array)
 * - `{}` (empty object — happens when empty arrays are stored in JSONB columns)
 * - `"[]"` (JSON string — rare but possible)
 * - `null` / `undefined`
 * - A non-array object with numeric keys (rare edge case)
 * 
 * This helper normalizes all of these to a proper JavaScript array.
 */
function safeArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  // Handle empty object {} or non-array objects
  if (typeof value === 'object') {
    // Check if it's an object with numeric keys (array-like)
    const keys = Object.keys(value);
    if (keys.length === 0) return []; // empty object → empty array
    // If all keys are numeric, convert to array
    if (keys.every(k => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => value[k]);
    }
    return []; // non-array object → empty array
  }
  return [];
}


// ─── Default empty profile ───
function createDefaultProfile(userId: string): PersonalProfile {
  return {
    userId,
    emotionalTriggers: [],
    sensitivityPatterns: [],
    thinkingStyles: [],
    regulationPathways: [],
    preferredEntryPoints: [],
    recurringThemes: [],
    strengths: [],
    escalationSignals: [],
    preferredResponseStyle: {
      directness: 0.5,
      softness: 0.5,
      explanation: 0.5,
      bodyFocus: 0.5,
      meaningExploration: 0.5,
    },
    adaptiveStyleProfile: {
  prefersCognitionFirst: 0,
  prefersRegulationFirst: 0,
  respondsToResonantSentences: 0,
  respondsToBodyGuidance: 0,
  respondsToMechanismExplanation: 0,
  resistsCognitiveLanguage: 0,
  resistsSoftLanguage: 0,
  ahResonance: 0,
  lhResonance: 0,
  preferredDepth: 0,
},
    compassStatePatterns: [],
    mechanismPatterns: [],
    lastUpdated: new Date(),
    sessionCount: 0,
    revisionHistory: [],
  };
}



// ─── Convert DB row to PersonalProfile ───
// Uses safeArray() for all JSONB array columns to handle {} / null / string edge cases
function rowToProfile(row: ProfileRow): PersonalProfile {
  return {
    userId: row.user_id,
    emotionalTriggers: safeArray<{ pattern: string; confidence: number; lastSeen: string }>(row.emotional_triggers).map(t => ({
      ...t,
      lastSeen: new Date(t.lastSeen),
    })),
    sensitivityPatterns: safeArray<{ pattern: string; confidence: number; lastSeen: string }>(row.sensitivity_patterns).map(p => ({
      ...p,
      lastSeen: new Date(p.lastSeen),
    })),
    thinkingStyles: safeArray<string>(row.thinking_styles),
    regulationPathways: safeArray<{ approach: string; helpedCount: number; totalCount: number; lastUsed: string }>(row.regulation_pathways).map(p => ({
      approach: p.approach as RegulationEffectiveness['approach'],
      helpedCount: p.helpedCount,
      totalCount: p.totalCount,
      lastUsed: new Date(p.lastUsed),
    })),
    preferredEntryPoints: safeArray<{ entry: string; frequency: number }>(row.preferred_entry_points).map(e => ({
      entry: e.entry as EntryPoint,
      frequency: e.frequency,
    })),
    recurringThemes: safeArray<{ theme: string; count: number; lastSeen: string }>(row.recurring_themes).map(t => ({
      ...t,
      lastSeen: new Date(t.lastSeen),
    })),
    strengths: safeArray<{ type: string; confidence: number; lastSeen: string }>(row.strengths).map(s => ({
      type: s.type as StrengthType,
      confidence: s.confidence,
      lastSeen: new Date(s.lastSeen),
    })),
    escalationSignals: safeArray<{ signal: string; confidence: number; lastSeen: string }>(row.escalation_signals).map(s => ({
      ...s,
      lastSeen: new Date(s.lastSeen),
    })),
    preferredResponseStyle: (row.preferred_response_style && typeof row.preferred_response_style === 'object' && 'directness' in row.preferred_response_style)
      ? row.preferred_response_style
      : {
        directness: 0.5,
        softness: 0.5,
        explanation: 0.5,
        bodyFocus: 0.5,
        meaningExploration: 0.5,
      },
    adaptiveStyleProfile:
  (row.preferred_response_style &&
   typeof row.preferred_response_style === 'object' &&
   'adaptiveStyleProfile' in row.preferred_response_style &&
   (row.preferred_response_style as any).adaptiveStyleProfile)
    ? {
        prefersCognitionFirst: (row.preferred_response_style as any).adaptiveStyleProfile.prefersCognitionFirst ?? 0,
        prefersRegulationFirst: (row.preferred_response_style as any).adaptiveStyleProfile.prefersRegulationFirst ?? 0,
        respondsToResonantSentences: (row.preferred_response_style as any).adaptiveStyleProfile.respondsToResonantSentences ?? 0,
        respondsToBodyGuidance: (row.preferred_response_style as any).adaptiveStyleProfile.respondsToBodyGuidance ?? 0,
        respondsToMechanismExplanation: (row.preferred_response_style as any).adaptiveStyleProfile.respondsToMechanismExplanation ?? 0,
        resistsCognitiveLanguage: (row.preferred_response_style as any).adaptiveStyleProfile.resistsCognitiveLanguage ?? 0,
        resistsSoftLanguage: (row.preferred_response_style as any).adaptiveStyleProfile.resistsSoftLanguage ?? 0,
        ahResonance: (row.preferred_response_style as any).adaptiveStyleProfile.ahResonance ?? 0,
        lhResonance: (row.preferred_response_style as any).adaptiveStyleProfile.lhResonance ?? 0,
        preferredDepth: (row.preferred_response_style as any).adaptiveStyleProfile.preferredDepth ?? 0,
      }
    : {
        prefersCognitionFirst: 0,
        prefersRegulationFirst: 0,
        respondsToResonantSentences: 0,
        respondsToBodyGuidance: 0,
        respondsToMechanismExplanation: 0,
        resistsCognitiveLanguage: 0,
        resistsSoftLanguage: 0,
        ahResonance: 0,
        lhResonance: 0,
        preferredDepth: 0,
      },
    lastUpdated: new Date(row.updated_at),
    sessionCount: row.session_count || 0,
    revisionHistory: safeArray<{ field: string; oldValue: string; newValue: string; date: string }>(row.revision_history).map(r => ({
      ...r,
      date: new Date(r.date),
    })),
    compassStatePatterns: safeArray<{ state: string; frequency: number; typicalTriggers: string[]; helpedApproaches: string[]; unhelpedApproaches: string[]; typicalTransitions: string[]; lastSeen: string }>(row.compass_state_patterns).map(p => ({
      state: p.state as CompassState,
      frequency: p.frequency,
      typicalTriggers: safeArray<string>(p.typicalTriggers),
      helpedApproaches: safeArray<string>(p.helpedApproaches),
      unhelpedApproaches: safeArray<string>(p.unhelpedApproaches),
      typicalTransitions: safeArray<string>(p.typicalTransitions) as CompassState[],
      lastSeen: new Date(p.lastSeen),
    })),
    // ── Mechanism patterns (cross-session) ──
    mechanismPatterns: safeArray<any>((row as any).mechanism_patterns).map((m: any) => ({
      mechanism: m.mechanism as PatternMechanism,
      count: m.count || 0,
      contexts: safeArray<string>(m.contexts),
      dominantLayers: safeArray<string>(m.dominantLayers),
      mechanismAwareRegulationCount: m.mechanismAwareRegulationCount || 0,
      genericResponseRegulationCount: m.genericResponseRegulationCount || 0,
      totalMechanismAwareReflections: m.totalMechanismAwareReflections || 0,
      totalGenericResponses: m.totalGenericResponses || 0,
      lastSeen: new Date(m.lastSeen || Date.now()),
      firstSeen: new Date(m.firstSeen || Date.now()),
    })),
  };
}




// ─── Convert PersonalProfile to DB row format ───
function profileToRow(profile: PersonalProfile): Partial<ProfileRow> {
  return {
    emotional_triggers: profile.emotionalTriggers.map(t => ({
      ...t,
      lastSeen: t.lastSeen.toISOString(),
    })),
    sensitivity_patterns: profile.sensitivityPatterns.map(p => ({
      ...p,
      lastSeen: p.lastSeen.toISOString(),
    })),
    thinking_styles: profile.thinkingStyles,
    regulation_pathways: profile.regulationPathways.map(p => ({
      approach: p.approach,
      helpedCount: p.helpedCount,
      totalCount: p.totalCount,
      lastUsed: p.lastUsed.toISOString(),
    })),
    preferred_entry_points: profile.preferredEntryPoints.map(e => ({
      entry: e.entry,
      frequency: e.frequency,
    })),
    recurring_themes: profile.recurringThemes.map(t => ({
      ...t,
      lastSeen: t.lastSeen.toISOString(),
    })),
    strengths: profile.strengths.map(s => ({
      type: s.type,
      confidence: s.confidence,
      lastSeen: s.lastSeen.toISOString(),
    })),
    escalation_signals: profile.escalationSignals.map(s => ({
      ...s,
      lastSeen: s.lastSeen.toISOString(),
    })),
    preferred_response_style: {
  directness: profile.preferredResponseStyle.directness,
  softness: profile.preferredResponseStyle.softness,
  explanation: profile.preferredResponseStyle.explanation,
  bodyFocus: profile.preferredResponseStyle.bodyFocus,
  meaningExploration: profile.preferredResponseStyle.meaningExploration,
  adaptiveStyleProfile: {
    prefersCognitionFirst: profile.adaptiveStyleProfile.prefersCognitionFirst,
    prefersRegulationFirst: profile.adaptiveStyleProfile.prefersRegulationFirst,
    respondsToResonantSentences: profile.adaptiveStyleProfile.respondsToResonantSentences,
    respondsToBodyGuidance: profile.adaptiveStyleProfile.respondsToBodyGuidance,
    respondsToMechanismExplanation: profile.adaptiveStyleProfile.respondsToMechanismExplanation,
    resistsCognitiveLanguage: profile.adaptiveStyleProfile.resistsCognitiveLanguage,
    resistsSoftLanguage: profile.adaptiveStyleProfile.resistsSoftLanguage,
    ahResonance: profile.adaptiveStyleProfile.ahResonance,
    lhResonance: profile.adaptiveStyleProfile.lhResonance,
    preferredDepth: profile.adaptiveStyleProfile.preferredDepth,
  },
},
    what_helped: [], // will be set separately during merge
    compass_state_patterns: (profile.compassStatePatterns || []).map(p => ({
      state: p.state,
      frequency: p.frequency,
      typicalTriggers: p.typicalTriggers,
      helpedApproaches: p.helpedApproaches,
      unhelpedApproaches: p.unhelpedApproaches,
      typicalTransitions: p.typicalTransitions,
      lastSeen: p.lastSeen.toISOString(),
    })),
    session_count: profile.sessionCount,
    revision_history: profile.revisionHistory.map(r => ({
      ...r,
      date: r.date.toISOString(),
    })),
    updated_at: new Date().toISOString(),
  };
}



// ═══════════════════════════════════════════════════════════════════
// ─── PUBLIC API ───
// ═══════════════════════════════════════════════════════════════════

/**
 * Load the user's personal profile from the database.
 * If no profile exists, creates a new default one.
 */
export async function loadProfile(userId: string): Promise<PersonalProfile> {
  try {
    const { data, error } = await supabase
      .from('ik_personal_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // No profile exists yet — create one
      console.log(
        '%c[PROFIEL] Geen profiel gevonden — nieuw profiel aangemaakt',
        'color: #805ad5; font-weight: bold;'
      );
      const defaultProfile = createDefaultProfile(userId);
      
      // Insert into DB
      await supabase.from('ik_personal_profiles').insert({
        user_id: userId,
        ...profileToRow(defaultProfile),
      });

      return defaultProfile;
    }

    const profile = rowToProfile(data as ProfileRow);
    console.log(
      `%c[PROFIEL] Profiel geladen%c — ${profile.sessionCount} eerdere sessies, ${profile.strengths.length} krachten, ${profile.regulationPathways.length} regulatiepaden`,
      'color: #805ad5; font-weight: bold;',
      'color: #718096;'
    );
    return profile;
  } catch (e) {
    console.error('[PROFIEL] Fout bij laden profiel:', e);
    return createDefaultProfile(userId);
  }
}


/**
 * Save the updated profile to the database.
 * Uses upsert to handle both create and update.
 */
export async function saveProfile(profile: PersonalProfile): Promise<void> {
  try {
    const rowData = profileToRow(profile);
    
    await supabase
      .from('ik_personal_profiles')
      .update({
        ...rowData,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.userId);

    console.log(
      `%c[PROFIEL] Profiel opgeslagen%c — sessie #${profile.sessionCount}`,
      'color: #38a169; font-weight: bold;',
      'color: #718096;'
    );
  } catch (e) {
    console.error('[PROFIEL] Fout bij opslaan profiel:', e);
  }
}


/**
 * Merge session data into the personal profile.
 * This is the core learning function — called at session end.
 * 
 * IMPORTANT: This is ADAPTIVE, not fixed.
 * - Patterns can be revised over time
 * - Confidence decays if patterns aren't seen recently
 * - The system does not treat repeated patterns as identity
 */
export function mergeSessionIntoProfile(
  profile: PersonalProfile,
  session: Session
): PersonalProfile {
  const now = new Date();
  const updated = { ...profile };
  const revisions: PersonalProfile['revisionHistory'] = [];
  if (!updated.adaptiveStyleProfile) {
  updated.adaptiveStyleProfile = {
    prefersCognitionFirst: 0,
    prefersRegulationFirst: 0,
    respondsToResonantSentences: 0,
    respondsToBodyGuidance: 0,
    respondsToMechanismExplanation: 0,
    resistsCognitiveLanguage: 0,
    resistsSoftLanguage: 0,
    ahResonance: 0,
    lhResonance: 0,
    preferredDepth: 0,
  };
}

  // ═══════════════════════════════════════════════════════════════
  // 1. EMOTIONAL TRIGGERS — from session emotion words
  // ═══════════════════════════════════════════════════════════════
  if (session.userEmotionWords.length > 0) {
    const existingTriggers = [...updated.emotionalTriggers];
    
    for (const word of session.userEmotionWords) {
      const existing = existingTriggers.find(t => t.pattern === word);
      if (existing) {
        // Seen again — increase confidence (max 1.0), update timestamp
        const oldConfidence = existing.confidence;
        existing.confidence = Math.min(1.0, existing.confidence + 0.1);
        existing.lastSeen = now;
        if (Math.abs(existing.confidence - oldConfidence) > 0.05) {
          revisions.push({
            field: 'emotionalTriggers',
            oldValue: `${word}: ${oldConfidence.toFixed(2)}`,
            newValue: `${word}: ${existing.confidence.toFixed(2)}`,
            date: now,
          });
        }
      } else {
        // New trigger — add with initial confidence
        existingTriggers.push({
          pattern: word,
          confidence: 0.3, // start low — needs repetition to become confident
          lastSeen: now,
        });
      }
    }
    
    updated.emotionalTriggers = existingTriggers;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. STRENGTHS — from detected strengths in session
  // ═══════════════════════════════════════════════════════════════
  if (session.detectedStrengths.length > 0) {
    const existingStrengths = [...updated.strengths];
    
    for (const strength of session.detectedStrengths) {
      const existing = existingStrengths.find(s => s.type === strength);
      if (existing) {
        // Seen again — increase confidence
        existing.confidence = Math.min(1.0, existing.confidence + 0.15);
        existing.lastSeen = now;
      } else {
        // New strength detected
        existingStrengths.push({
          type: strength,
          confidence: 0.4, // strengths start with slightly higher confidence
          lastSeen: now,
        });
      }
    }
    
    updated.strengths = existingStrengths;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. REGULATION PATHWAYS — from effectiveness tracking
  // ═══════════════════════════════════════════════════════════════
  if (session.regulationEffectiveness.length > 0) {
    const existingPathways = [...updated.regulationPathways];
    
    for (const eff of session.regulationEffectiveness) {
      const existing = existingPathways.find(p => p.approach === eff.approach);
      if (existing) {
        existing.totalCount += 1;
        if (eff.helped) existing.helpedCount += 1;
        existing.lastUsed = now;
      } else {
        existingPathways.push({
          approach: eff.approach,
          helpedCount: eff.helped ? 1 : 0,
          totalCount: 1,
          lastUsed: now,
        });
      }
    }
    
    updated.regulationPathways = existingPathways;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. PREFERRED ENTRY POINTS — from entry history
  // ═══════════════════════════════════════════════════════════════
  if (session.entryHistory.length > 0) {
    const existingEntries = [...updated.preferredEntryPoints];
    
    for (const entry of session.entryHistory) {
      const existing = existingEntries.find(e => e.entry === entry);
      if (existing) {
        existing.frequency += 1;
      } else {
        existingEntries.push({ entry, frequency: 1 });
      }
    }
    
    // Sort by frequency (most used first)
    existingEntries.sort((a, b) => b.frequency - a.frequency);
    updated.preferredEntryPoints = existingEntries;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. RECURRING THEMES — from identity themes detected in session
  // ═══════════════════════════════════════════════════════════════
  if (session.identityThemes.length > 0) {
    const existingThemes = [...updated.recurringThemes];
    
    for (const theme of session.identityThemes) {
      const existing = existingThemes.find(t => t.theme === theme);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = now;
      } else {
        existingThemes.push({ theme, count: 1, lastSeen: now });
      }
    }
    
    updated.recurringThemes = existingThemes;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. PREFERRED RESPONSE STYLE — adaptive learning from what helped
  // ═══════════════════════════════════════════════════════════════
  if (session.regulationEffectiveness.length > 0) {
    const style = { ...updated.preferredResponseStyle };
    const learningRate = 0.05; // small increments — adaptive, not jumpy
    
    for (const eff of session.regulationEffectiveness) {
      const delta = eff.helped ? learningRate : -learningRate;
      
      switch (eff.approach) {
        case 'direct_truth':
          style.directness = clamp(style.directness + delta, 0, 1);
          break;
        case 'softness':
          style.softness = clamp(style.softness + delta, 0, 1);
          break;
        case 'insight_explanation':
          style.explanation = clamp(style.explanation + delta, 0, 1);
          break;
        case 'body_focus':
          style.bodyFocus = clamp(style.bodyFocus + delta, 0, 1);
          break;
        case 'meaning_exploration':
          style.meaningExploration = clamp(style.meaningExploration + delta, 0, 1);
          break;
        case 'emotion_naming':
          // Emotion naming contributes to softness
          style.softness = clamp(style.softness + delta * 0.5, 0, 1);
          break;
        case 'cognitive_ordering':
          // Cognitive ordering contributes to explanation
          style.explanation = clamp(style.explanation + delta * 0.5, 0, 1);
          break;
      }
    }
    
    updated.preferredResponseStyle = style;
  }
  if (session.regulationEffectiveness.length > 0) {
  const adaptive = { ...updated.adaptiveStyleProfile };

  for (const eff of session.regulationEffectiveness) {
    switch (eff.approach) {
      case 'cognitive_ordering':
        if (eff.helped) adaptive.prefersCognitionFirst = Math.min(2, adaptive.prefersCognitionFirst + 1);
        break;
      case 'body_focus':
        if (eff.helped) adaptive.respondsToBodyGuidance = Math.min(2, adaptive.respondsToBodyGuidance + 1);
        break;
      case 'insight_explanation':
        if (eff.helped) adaptive.respondsToMechanismExplanation = Math.min(2, adaptive.respondsToMechanismExplanation + 1);
        break;
      case 'softness':
        if (eff.helped) {
          adaptive.ahResonance = Math.min(2, adaptive.ahResonance + 1);
        } else {
          adaptive.resistsSoftLanguage = Math.min(2, adaptive.resistsSoftLanguage + 1);
        }
        break;
      case 'direct_truth':
        if (eff.helped) adaptive.preferredDepth = Math.min(2, adaptive.preferredDepth + 1);
        break;
      case 'emotion_naming':
        if (eff.helped) adaptive.prefersRegulationFirst = Math.min(2, adaptive.prefersRegulationFirst + 1);
        break;
      case 'meaning_exploration':
        if (eff.helped) adaptive.lhResonance = Math.min(2, adaptive.lhResonance + 1);
        break;
    }
  }

  updated.adaptiveStyleProfile = adaptive;
}

  // ═══════════════════════════════════════════════════════════════
  // 7. ESCALATION SIGNALS — from dysregulation/overwhelm patterns
  // ═══════════════════════════════════════════════════════════════
  // If crisis was detected or dysregulation occurred, track the context
  if (session.crisisDetected) {
    const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const signal = lastUserMsg.content.substring(0, 100);
      const existing = updated.escalationSignals.find(s => s.signal === signal);
      if (!existing) {
        updated.escalationSignals.push({
          signal,
          confidence: 0.5,
          lastSeen: now,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. SENSITIVITY PATTERNS — from compass signals
  // ═══════════════════════════════════════════════════════════════
  if (session.compassSignals.length > 0) {
    const existingPatterns = [...updated.sensitivityPatterns];
    
    for (const signal of session.compassSignals) {
      const existing = existingPatterns.find(p => p.pattern === signal);
      if (existing) {
        existing.confidence = Math.min(1.0, existing.confidence + 0.1);
        existing.lastSeen = now;
      } else {
        existingPatterns.push({
          pattern: signal,
          confidence: 0.3,
          lastSeen: now,
        });
      }
    }
    
    updated.sensitivityPatterns = existingPatterns;
  }

  // ═══════════════════════════════════════════════════════════════
  // 8.5. COMPASS STATE PATTERNS — from session compass state history
  // ═══════════════════════════════════════════════════════════════
  // Tracks which states this user tends to enter, and state transitions
  if (session.compassStateHistory && session.compassStateHistory.length > 0) {
    const existingPatterns = [...(updated.compassStatePatterns || [])];

    for (let i = 0; i < session.compassStateHistory.length; i++) {
      const detection = session.compassStateHistory[i];
      if (!detection.primary) continue;

      const state = detection.primary;
      const existing = existingPatterns.find(p => p.state === state);

      // Determine transition: what state came after this one?
      const nextDetection = i < session.compassStateHistory.length - 1
        ? session.compassStateHistory[i + 1]
        : null;
      const transitionTo = nextDetection?.primary && nextDetection.primary !== state
        ? nextDetection.primary
        : null;

      if (existing) {
        existing.frequency += 1;
        existing.lastSeen = now;
        if (transitionTo && !existing.typicalTransitions.includes(transitionTo)) {
          existing.typicalTransitions.push(transitionTo);
        }
      } else {
        existingPatterns.push({
          state,
          frequency: 1,
          typicalTriggers: [],
          helpedApproaches: [],
          unhelpedApproaches: [],
          typicalTransitions: transitionTo ? [transitionTo] : [],
          lastSeen: now,
        });
      }
    }

    // Merge regulation effectiveness into compass state patterns
    // (what helped/didn't help when in a specific state)
    if (session.regulationEffectiveness.length > 0 && session.compassStateHistory.length > 0) {
      for (const eff of session.regulationEffectiveness) {
        // Find the compass state that was active around the time of this effectiveness record
        const closestState = session.compassStateHistory
          .filter(d => d.primary && d.timestamp <= eff.timestamp)
          .pop();
        if (closestState?.primary) {
          const statePattern = existingPatterns.find(p => p.state === closestState.primary);
          if (statePattern) {
            const approachStr = eff.approach;
            if (eff.helped && !statePattern.helpedApproaches.includes(approachStr)) {
              statePattern.helpedApproaches.push(approachStr);
            }
            if (!eff.helped && !statePattern.unhelpedApproaches.includes(approachStr)) {
              statePattern.unhelpedApproaches.push(approachStr);
            }
          }
        }
      }
    }

    updated.compassStatePatterns = existingPatterns;
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. CONFIDENCE DECAY — patterns not seen recently lose confidence
  // ═══════════════════════════════════════════════════════════════
  // This ensures the profile remains ADAPTIVE, not fixed
  const decayThresholdDays = 30; // start decaying after 30 days unseen
  const decayRate = 0.05; // per session
  
  updated.emotionalTriggers = decayPatterns(updated.emotionalTriggers, now, decayThresholdDays, decayRate);
  updated.sensitivityPatterns = decayPatterns(updated.sensitivityPatterns, now, decayThresholdDays, decayRate);
  updated.strengths = decayStrengths(updated.strengths, now, decayThresholdDays, decayRate);
  updated.escalationSignals = decayPatterns(updated.escalationSignals, now, decayThresholdDays, decayRate);

  // ═══════════════════════════════════════════════════════════════
  // 10. META — update session count and revision history
  // ═══════════════════════════════════════════════════════════════
  updated.sessionCount += 1;
  updated.lastUpdated = now;
  updated.revisionHistory = [
    ...updated.revisionHistory,
    ...revisions,
  ].slice(-50); // keep last 50 revisions

  console.log(
    `%c[PROFIEL] Sessie gemerged%c — ` +
    `triggers: ${updated.emotionalTriggers.length}, ` +
    `krachten: ${updated.strengths.length}, ` +
    `regulatiepaden: ${updated.regulationPathways.length}, ` +
    `thema's: ${updated.recurringThemes.length}, ` +
    `kompas-staten: ${(updated.compassStatePatterns || []).length}, ` +
    `sessie #${updated.sessionCount}`,
    'color: #805ad5; font-weight: bold;',
    'color: #718096;'
  );

  return updated;
}



/**
 * Build a summary of the profile for inclusion in AI context.
 * This gives the AI awareness of cross-session patterns without
 * overwhelming the prompt with raw data.
 */
export function buildProfileContext(profile: PersonalProfile): Record<string, any> {
  // Top emotional triggers (by confidence)
  const topTriggers = profile.emotionalTriggers
    .filter(t => t.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(t => t.pattern);

  // Top strengths (by confidence)
  const topStrengths = profile.strengths
    .filter(s => s.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(s => s.type);

  // Most effective regulation approaches
  const effectiveApproaches = profile.regulationPathways
    .filter(p => p.totalCount >= 2) // need at least 2 data points
    .map(p => ({
      approach: p.approach,
      successRate: p.helpedCount / p.totalCount,
      totalCount: p.totalCount,
    }))
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3);

  // Least effective approaches
  const ineffectiveApproaches = profile.regulationPathways
    .filter(p => p.totalCount >= 2)
    .map(p => ({
      approach: p.approach,
      successRate: p.helpedCount / p.totalCount,
      totalCount: p.totalCount,
    }))
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 2)
    .filter(a => a.successRate < 0.4);

  // Preferred entry points (top 2)
  const topEntryPoints = profile.preferredEntryPoints
    .slice(0, 2)
    .map(e => e.entry);

  // Recurring themes (top 3)
  const topThemes = profile.recurringThemes
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(t => t.theme);

  // Response style preferences
  const responseStyle = profile.preferredResponseStyle;

  // Sensitivity patterns
  const topSensitivities = profile.sensitivityPatterns
    .filter(p => p.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map(p => p.pattern);

  return {
    sessionCount: profile.sessionCount,
    hasHistory: profile.sessionCount > 0,
    topEmotionalTriggers: topTriggers,
    topStrengths,
    effectiveApproaches: effectiveApproaches.map(a => ({
      approach: a.approach,
      successRate: Math.round(a.successRate * 100) + '%',
    })),
    ineffectiveApproaches: ineffectiveApproaches.map(a => ({
      approach: a.approach,
      successRate: Math.round(a.successRate * 100) + '%',
    })),
    preferredEntryPoints: topEntryPoints,
    recurringThemes: topThemes,
    responseStylePreferences: {
      prefersDirectness: responseStyle.directness > 0.6,
      prefersSoftness: responseStyle.softness > 0.6,
      prefersExplanation: responseStyle.explanation > 0.6,
      prefersBodyFocus: responseStyle.bodyFocus > 0.6,
      prefersMeaningExploration: responseStyle.meaningExploration > 0.6,
      scores: responseStyle,
    },
    adaptiveStyleProfile: {
  prefersCognitionFirst: profile.adaptiveStyleProfile.prefersCognitionFirst,
  prefersRegulationFirst: profile.adaptiveStyleProfile.prefersRegulationFirst,
  respondsToResonantSentences: profile.adaptiveStyleProfile.respondsToResonantSentences,
  respondsToBodyGuidance: profile.adaptiveStyleProfile.respondsToBodyGuidance,
  respondsToMechanismExplanation: profile.adaptiveStyleProfile.respondsToMechanismExplanation,
  resistsCognitiveLanguage: profile.adaptiveStyleProfile.resistsCognitiveLanguage,
  resistsSoftLanguage: profile.adaptiveStyleProfile.resistsSoftLanguage,
  ahResonance: profile.adaptiveStyleProfile.ahResonance,
  lhResonance: profile.adaptiveStyleProfile.lhResonance,
  preferredDepth: profile.adaptiveStyleProfile.preferredDepth,
},
    sensitivityPatterns: topSensitivities,
  };
}


// ═══════════════════════════════════════════════════════════════════
// ─── HELPER FUNCTIONS ───
// ═══════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Decay confidence of patterns not seen recently.
 * This keeps the profile adaptive — old patterns fade unless reinforced.
 */
function decayPatterns(
  patterns: Array<{ pattern: string; confidence: number; lastSeen: Date }>,
  now: Date,
  thresholdDays: number,
  decayRate: number,
): Array<{ pattern: string; confidence: number; lastSeen: Date }> {
  return patterns
    .map(p => {
      const daysSinceLastSeen = (now.getTime() - p.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSeen > thresholdDays) {
        return {
          ...p,
          confidence: Math.max(0.05, p.confidence - decayRate),
        };
      }
      return p;
    })
    .filter(p => p.confidence > 0.05); // remove patterns that have decayed to near-zero
}

/**
 * Decay confidence of strengths not seen recently.
 * Strengths decay slower than triggers — they're more stable traits.
 */
function decayStrengths(
  strengths: Array<{ type: StrengthType; confidence: number; lastSeen: Date }>,
  now: Date,
  thresholdDays: number,
  decayRate: number,
): Array<{ type: StrengthType; confidence: number; lastSeen: Date }> {
  return strengths
    .map(s => {
      const daysSinceLastSeen = (now.getTime() - s.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSeen > thresholdDays) {
        return {
          ...s,
          confidence: Math.max(0.1, s.confidence - decayRate * 0.5), // slower decay for strengths
        };
      }
      return s;
    })
    .filter(s => s.confidence > 0.1);
}
