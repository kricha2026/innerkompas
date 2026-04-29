import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { BODY_AREA_LABELS } from '@/lib/types';
import { cleanRawJsonFromMessage } from '@/ai/messageCleaner';

import {
  detectNeurodivergentSignals,
  detectLanguagePreference,
  detectLanguageRejection,
  detectDirectRequest,
  detectLeadershipNeed,
  NeurodivergentSignal,
  LanguageStyle,
  DirectRequestType,
} from '@/lib/neurodivergentDetection';

// ─── Exported types used by CoachDashboard, CoachReviewPanel, CrossSessionPatterns, etc. ───
export interface DbSessionCoach {
  id: string;
  started_at: string;
  ended_at: string | null;
  phases: string[];
  emotion_words: string[];
  body_areas: string[];
  is_stable: boolean;
  crisis_detected: boolean;
  summary: string | null;
  user_display_name: string | null;
  user_id: string;
  coach_notes: string | null;
  live_mode: boolean;
  compass_states?: string[];
  detected_mechanisms?: string[];
  detected_strengths?: string[];
  compass_signals?: string[];
  identity_themes?: string[];
}

export interface DbMessageCoach {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quick_replies: string[] | string | null;
  show_body_map: boolean;
  body_area_selected: string | null;
  message_order: number;
  created_at: string;
  active_agent?: string | null;
  compass_state?: string | null;
  secondary_compass_state?: string | null;
  detected_mechanism?: string | null;
  dominant_layer?: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
  alignment: 'Richting',
};

// ─── Direct REST API fallback for loading messages ───
const SUPABASE_URL = 'https://bzmlljjjwrpxwiwnlwpb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y';

async function fetchMessagesDirectREST(sessionId: string): Promise<DbMessageCoach[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/ik_session_messages?session_id=eq.${sessionId}&order=message_order.asc&select=*`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

interface CoachSessionDetailProps {
  session: DbSessionCoach;
  messages: DbMessageCoach[];
  loading: boolean;
}

const CoachSessionDetail: React.FC<CoachSessionDetailProps> = ({ session, messages: propMessages, loading: propLoading }) => {
  const [tab, setTab] = useState<'gesprek' | 'inzichten' | 'analyse'>('gesprek');


  // ─── Self-fetch messages if props are empty ───
  // This handles the case where CoachDashboard's loadMessages returned empty
  // (e.g., due to RLS issues or timing). We try both the JS client and REST API.
  const [selfMessages, setSelfMessages] = useState<DbMessageCoach[]>([]);
  const [selfLoading, setSelfLoading] = useState(false);
  const [selfFetched, setSelfFetched] = useState(false);

  const messages = propMessages.length > 0 ? propMessages : selfMessages;
  const loading = propLoading || selfLoading;

  useEffect(() => {
    // Only self-fetch if:
    // 1. Props gave us no messages
    // 2. Parent is done loading
    // 3. We haven't already tried
    if (propMessages.length === 0 && !propLoading && !selfFetched) {
      setSelfFetched(true);
      loadMessagesSelf();
    }
  }, [propMessages.length, propLoading, selfFetched]);

  // Reset self-fetch state when session changes
  useEffect(() => {
    setSelfFetched(false);
    setSelfMessages([]);
  }, [session.id]);

  const loadMessagesSelf = async () => {
    setSelfLoading(true);
    console.log(`[CoachSessionDetail] Self-fetching messages for session ${session.id}`);

    // Attempt 1: Supabase JS client
    try {
      const { data, error } = await supabase
        .from('ik_session_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('message_order', { ascending: true });

      if (!error && data && data.length > 0) {
        console.log(`[CoachSessionDetail] JS client returned ${data.length} messages`);
        setSelfMessages(data);
        setSelfLoading(false);
        return;
      }
    } catch (e: any) {
      console.warn(`[CoachSessionDetail] JS client error:`, e?.message);
    }

    // Attempt 2: Direct REST API
    try {
      const restMessages = await fetchMessagesDirectREST(session.id);
      if (restMessages.length > 0) {
        console.log(`[CoachSessionDetail] REST fallback returned ${restMessages.length} messages`);
        setSelfMessages(restMessages);
        setSelfLoading(false);
        return;
      }
    } catch (e: any) {
      console.warn(`[CoachSessionDetail] REST fallback error:`, e?.message);
    }

    setSelfMessages([]);
    setSelfLoading(false);
  };

  const parseQuickReplies = (raw: string[] | string | null): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  const formatTime = (d: string) => new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const aiMsgCount = messages.filter(m => m.role === 'assistant').length;

  // ═══════════════════════════════════════════════════════════════════
  // ─── PROCESSING STYLE ANALYSIS (computed from stored user messages) ───
  // ═══════════════════════════════════════════════════════════════════
  const processingAnalysis = useMemo(() => {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return null;

    const allSignals = new Set<NeurodivergentSignal>();
    const allAdaptations = new Set<string>();
    const allLanguageStyles = new Set<LanguageStyle>();
    const allRejectedStyles = new Set<LanguageStyle>();
    const allDirectRequests = new Set<DirectRequestType>();
    let leadershipNeededCount = 0;
    let totalConfidence = 0;
    let signalMessageCount = 0;

    for (const msg of userMessages) {
      const nd = detectNeurodivergentSignals(msg.content);
      for (const s of nd.signals) allSignals.add(s);
      for (const a of nd.suggestedAdaptations) allAdaptations.add(a);
      if (nd.signals.length > 0) {
        totalConfidence += nd.confidence;
        signalMessageCount++;
      }

      const langStyles = detectLanguagePreference(msg.content);
      for (const s of langStyles) allLanguageStyles.add(s);

      const rejStyles = detectLanguageRejection(msg.content);
      for (const s of rejStyles) allRejectedStyles.add(s);

      const dr = detectDirectRequest(msg.content);
      if (dr) allDirectRequests.add(dr);

      if (detectLeadershipNeed(msg.content)) leadershipNeededCount++;
    }

    const avgConfidence = signalMessageCount > 0 ? totalConfidence / signalMessageCount : 0;

    return {
      signals: [...allSignals],
      adaptations: [...allAdaptations],
      languageStyles: [...allLanguageStyles],
      rejectedStyles: [...allRejectedStyles],
      directRequests: [...allDirectRequests],
      leadershipNeeded: leadershipNeededCount > 0,
      leadershipCount: leadershipNeededCount,
      avgConfidence,
      totalUserMessages: userMessages.length,
    };
  }, [messages]);

  // ─── Human-readable processing descriptions for coach ───
  const describeSignals = (signals: NeurodivergentSignal[]): string[] => {
    const lines: string[] = [];
    if (signals.includes('fast_thinking') && signals.includes('attention_switching')) {
      lines.push('Denkt snel, springt tussen onderwerpen.');
    } else if (signals.includes('fast_thinking')) {
      lines.push('Denkt snel — het hoofd staat niet stil.');
    } else if (signals.includes('attention_switching')) {
      lines.push('De aandacht springt. Moeilijk om bij één ding te blijven.');
    }
    if (signals.includes('high_speed_processing')) {
      lines.push('Verwerkt in hoog tempo. Heeft geen herhaling nodig.');
    }
    if (signals.includes('high_sensitivity')) {
      lines.push('Gevoelig. Prikkels komen snel en hard binnen.');
    }
    if (signals.includes('overload_sensitivity') && !signals.includes('high_sensitivity')) {
      lines.push('Te veel opties of stappen zorgen voor blokkade.');
    } else if (signals.includes('overload_sensitivity')) {
      lines.push('Bij te veel input valt het stil.');
    }
    if (signals.includes('cognition_first') && signals.includes('mixed_cognition_overwhelm')) {
      lines.push('Wisselt tussen scherp analyseren en overweldiging.');
    } else if (signals.includes('cognition_first')) {
      lines.push('Wil eerst snappen. Voelen komt daarna.');
    }
    if (signals.includes('frustration_with_vagueness')) {
      lines.push('Vaagheid werkt niet. Wil het precies en concreet.');
    }
    if (signals.includes('need_for_speed') && !signals.includes('fast_thinking')) {
      lines.push('Wil tempo. Geen omhaal, geen herhaling.');
    }
    if (signals.includes('difficulty_finishing')) {
      lines.push('Begint veel, rondt moeilijk af.');
    }
    if (signals.includes('repetition_aversion') && !signals.includes('need_for_speed')) {
      lines.push('Herhaling irriteert. Variatie is nodig.');
    }
    return lines;
  };

  const describeLanguageStyles = (styles: LanguageStyle[]): string => {
    const parts: string[] = [];
    if (styles.includes('body_based')) parts.push('vanuit het lichaam');
    if (styles.includes('cognitive')) parts.push('analytisch');
    if (styles.includes('direct')) parts.push('kort en direct');
    if (styles.includes('soft')) parts.push('zacht en voorzichtig');
    if (styles.includes('structured')) parts.push('gestructureerd');
    if (styles.includes('intuitive')) parts.push('intuïtief');
    if (styles.includes('grounded')) parts.push('concreet en praktisch');
    if (styles.includes('abstract')) parts.push('zoekend naar betekenis');
    if (parts.length === 0) return '';
    if (parts.length === 1) return `Spreekt ${parts[0]}.`;
    return `Spreekt ${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}.`;
  };

  const describeRejectedStyles = (styles: LanguageStyle[]): string => {
    const parts: string[] = [];
    if (styles.includes('soft')) parts.push('zachte taal');
    if (styles.includes('body_based')) parts.push('lichaamstaal');
    if (styles.includes('cognitive')) parts.push('analytische taal');
    if (styles.includes('abstract')) parts.push('abstracte taal');
    if (styles.includes('structured')) parts.push('strakke structuur');
    if (parts.length === 0) return '';
    return `${parts.join(' en ')} landt niet.`;
  };

  const describeDirectRequests = (requests: DirectRequestType[]): string => {
    const parts: string[] = [];
    if (requests.includes('options')) parts.push('opties');
    if (requests.includes('sentence')) parts.push('een zin');
    if (requests.includes('exercise')) parts.push('een oefening');
    if (requests.includes('explanation')) parts.push('uitleg');
    if (requests.includes('steps')) parts.push('stappen');
    if (requests.includes('summary')) parts.push('een samenvatting');
    if (requests.includes('direction')) parts.push('richting');
    if (parts.length === 0) return '';
    return `Vroeg expliciet om ${parts.join(', ')}.`;
  };




  return (
    <div className="border-t border-sand-dark/10 animate-gentle-fade">
      {/* Tabs */}
      <div className="flex border-b border-sand-dark/10">
        <button
          onClick={() => setTab('gesprek')}
          className={`flex-1 px-4 py-3 text-xs font-sans uppercase tracking-wider transition-colors duration-200 ${
            tab === 'gesprek'
              ? 'text-anthracite border-b-2 border-gold bg-gold-light/5'
              : 'text-anthracite-soft/50 hover:text-anthracite-soft/70'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            Gesprek
            {messages.length > 0 && <span className="text-anthracite-soft/30 ml-0.5">({messages.length})</span>}
          </span>
        </button>
        <button
          onClick={() => setTab('inzichten')}
          className={`flex-1 px-4 py-3 text-xs font-sans uppercase tracking-wider transition-colors duration-200 ${
            tab === 'inzichten'
              ? 'text-anthracite border-b-2 border-gold bg-gold-light/5'
              : 'text-anthracite-soft/50 hover:text-anthracite-soft/70'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            Inzichten
          </span>
        </button>
        <button
          onClick={() => setTab('analyse')}
          className={`flex-1 px-4 py-3 text-xs font-sans uppercase tracking-wider transition-colors duration-200 ${
            tab === 'analyse'
              ? 'text-anthracite border-b-2 border-anthracite/60 bg-anthracite/5'
              : 'text-anthracite-soft/50 hover:text-anthracite-soft/70'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Professionele analyse
          </span>
        </button>
      </div>


      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 rounded-full bg-gold-light/30 animate-breathe" />
          </div>
        ) : tab === 'gesprek' ? (
          messages.length === 0 ? (
            <div className="text-center py-8">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/20">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-xs text-anthracite-soft/40 font-sans">Geen berichten beschikbaar voor deze sessie.</p>
              <p className="text-[10px] text-anthracite-soft/25 font-sans mt-1">
                Sessie ID: {session.id.substring(0, 8)}...
              </p>
              <button
                onClick={loadMessagesSelf}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-sans text-anthracite-soft/40 hover:text-anthracite-soft border border-sand-dark/10 hover:border-sand-dark/20 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Opnieuw proberen
              </button>
            </div>
          ) : (
            <div>
              {/* Stats bar */}
              <div className="flex items-center gap-4 mb-4 pb-3 border-b border-sand-dark/8">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-anthracite/15" />
                  <span className="text-[10px] text-anthracite-soft/50 font-sans">{userMsgCount} gebruiker</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gold-light/40" />
                  <span className="text-[10px] text-anthracite-soft/50 font-sans">{aiMsgCount} AI</span>
                </div>
                <span className="text-[10px] text-anthracite-soft/30 font-sans">{messages.length} totaal</span>
                <button
                  onClick={loadMessagesSelf}
                  className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-anthracite-soft/40 hover:text-anthracite-soft/70 font-sans border border-sand-dark/10 hover:border-sand-dark/20 transition-colors"
                  title="Berichten opnieuw laden"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Herladen
                </button>
              </div>

              {/* Conversation transcript */}
              <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
                {messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const quickReplies = parseQuickReplies(msg.quick_replies);
                  // Show time separator when >5 min gap between messages
                  const showTimeSep = idx === 0 || (idx > 0 &&
                    new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 300000);

                  return (
                    <React.Fragment key={msg.id}>
                      {showTimeSep && (
                        <div className="flex items-center gap-3 py-1.5">
                          <div className="flex-1 h-px bg-sand-dark/8" />
                          <span className="text-[10px] text-anthracite-soft/25 font-sans">{formatTime(msg.created_at)}</span>
                          <div className="flex-1 h-px bg-sand-dark/8" />
                        </div>
                      )}
                      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[85%]">
                          {/* Sender label */}
                          <p className={`text-[10px] text-anthracite-soft/25 font-sans mb-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                            {isUser ? (session.user_display_name || 'Gebruiker') : 'Inner Kompas'}
                          </p>
                          {/* Message bubble */}
                          <div className={`px-4 py-3 rounded-2xl text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                            isUser
                              ? 'bg-anthracite/10 text-anthracite border border-anthracite/8 rounded-br-md'
                              : 'bg-gold-light/10 text-anthracite/85 border border-gold-light/15 rounded-bl-md'
                          }`}>
                            {cleanRawJsonFromMessage(msg.content)}

                          </div>
                          {/* Quick replies */}
                          {!isUser && quickReplies.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                              {quickReplies.map((reply, ri) => (
                                <span key={ri} className="inline-block px-2.5 py-0.5 rounded-full text-xs font-sans bg-sand-dark/8 text-anthracite-soft/50 border border-sand-dark/12">{reply}</span>
                              ))}
                            </div>
                          )}
                          {/* Body map indicator */}
                          {!isUser && msg.show_body_map && (
                            <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-anthracite-soft/25">
                                <circle cx="12" cy="5" r="3" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="9" y1="20" x2="12" y2="16" /><line x1="15" y1="20" x2="12" y2="16" />
                              </svg>
                              <span className="text-xs text-anthracite-soft/25 font-sans">
                                Lichaamskaart{msg.body_area_selected && <> — {(BODY_AREA_LABELS as any)[msg.body_area_selected] || msg.body_area_selected}</>}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                {/* End marker */}
                <div className="flex items-center gap-3 pt-3 pb-1">
                  <div className="flex-1 h-px bg-sand-dark/10" />
                  <span className="text-[10px] text-anthracite-soft/20 font-sans">
                    {session.ended_at ? 'Sessie beëindigd' : 'Sessie niet afgesloten'}
                  </span>
                  <div className="flex-1 h-px bg-sand-dark/10" />
                </div>
              </div>
            </div>
          )
        ) : tab === 'inzichten' ? (
          /* ═══════════════════════════════════════════════════════════════════ */
          /* ─── INZICHTEN TAB — grounded reflection for the coach ─────────── */
          /* ═══════════════════════════════════════════════════════════════════ */
          <div className="space-y-4">

            {/* ── 1. Opening felt-sense: what happened in this session ── */}
            <p className="text-sm text-anthracite/85 font-sans leading-relaxed italic">
              {session.crisis_detected
                ? 'Er was een moment van crisis. Het systeem schakelde naar veiligheid.'
                : session.is_stable
                ? 'Er kwam rust. De sessie vond grond.'
                : (session.phases || []).includes('kern')
                ? 'Er was verdieping. Niet alles landde, maar er werd iets geraakt.'
                : (session.phases || []).includes('holding')
                ? 'Er werd vastgehouden. Nog geen verdieping, wel aanwezigheid.'
                : 'Er werd verkend. De ruimte was er, de richting nog niet helemaal.'}
            </p>

            {/* ── 2. What was alive: emotions + body ── */}
            {((session.emotion_words || []).length > 0 || (session.body_areas || []).length > 0) && (
              <div>
                {(session.emotion_words || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {session.emotion_words.map((w, i) => (
                      <span key={i} className="text-sm px-3 py-1 rounded-full bg-gold-light/20 text-anthracite font-sans">{w}</span>
                    ))}
                  </div>
                )}
                {(session.body_areas || []).length > 0 && (
                  <p className="text-sm text-anthracite-soft/65 font-sans leading-relaxed">
                    Het lichaam reageerde — {session.body_areas.map((a: string) => (BODY_AREA_LABELS as any)[a] || a).join(', ').toLowerCase()}.
                  </p>
                )}
              </div>
            )}

            {/* ── 3. Core insight — the summary, without clinical framing ── */}
            {session.summary && (
              <div className="pl-3.5 border-l-2 border-gold/30">
                <p className="text-sm text-anthracite/80 font-sans leading-relaxed">{session.summary}</p>
              </div>
            )}

            {/* ── 4. Session path — phases as context, not categories ── */}
            {(session.phases || []).length > 0 && (
              <p className="text-xs text-anthracite-soft/45 font-sans">
                De sessie bewoog door {session.phases.map(p => (PHASE_LABELS[p] || p).toLowerCase()).join(' → ')}.
                {session.ended_at && (
                  <span className="ml-1">
                    Duur: {Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)} minuten, {messages.length} berichten.
                  </span>
                )}
              </p>
            )}

            {/* ── 5. Processing style — grounded observations, not clinical labels ── */}
            {processingAnalysis && (processingAnalysis.signals.length > 0 || processingAnalysis.languageStyles.length > 0 || processingAnalysis.leadershipNeeded || processingAnalysis.directRequests.length > 0) && (
              <div className="pt-3 border-t border-sand-dark/8">
                <h4 className="text-xs font-sans text-anthracite-soft/45 uppercase tracking-wider mb-2.5">Hoe deze persoon beweegt</h4>

                {processingAnalysis.signals.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {describeSignals(processingAnalysis.signals).map((line, i) => (
                      <p key={i} className="text-sm text-anthracite/75 font-sans leading-relaxed">{line}</p>
                    ))}
                  </div>
                )}

                {processingAnalysis.languageStyles.length > 0 && (
                  <p className="text-sm text-anthracite/70 font-sans leading-relaxed mb-1.5">
                    {describeLanguageStyles(processingAnalysis.languageStyles)}
                  </p>
                )}

                {processingAnalysis.rejectedStyles.length > 0 && (
                  <p className="text-sm text-anthracite-soft/60 font-sans leading-relaxed mb-1.5">
                    {describeRejectedStyles(processingAnalysis.rejectedStyles)}
                  </p>
                )}

                {processingAnalysis.directRequests.length > 0 && (
                  <p className="text-sm text-anthracite/70 font-sans leading-relaxed mb-1.5">
                    {describeDirectRequests(processingAnalysis.directRequests)}
                  </p>
                )}

                {processingAnalysis.leadershipNeeded && (
                  <p className="text-sm text-anthracite-soft/60 font-sans leading-relaxed italic">
                    Er was behoefte aan richting — open vragen werkten niet altijd.
                  </p>
                )}
              </div>
            )}

          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════ */
          /* ─── PROFESSIONELE ANALYSE TAB — clinical / systemic view ──────── */
          /* ═══════════════════════════════════════════════════════════════════ */
          <div className="space-y-5">

            {/* ── Session metrics ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-anthracite/5 border border-anthracite/8">
                <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Berichten</p>
                <p className="text-lg font-serif text-anthracite">{messages.length}</p>
                <p className="text-[10px] text-anthracite-soft/40 font-sans">{userMsgCount} gebruiker / {aiMsgCount} AI</p>
              </div>
              <div className="p-3 rounded-xl bg-anthracite/5 border border-anthracite/8">
                <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Duur</p>
                <p className="text-lg font-serif text-anthracite">
                  {session.ended_at ? `${Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)} min` : '—'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-anthracite/5 border border-anthracite/8">
                <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Emoties</p>
                <p className="text-lg font-serif text-anthracite">{(session.emotion_words || []).length}</p>
              </div>
              <div className="p-3 rounded-xl bg-anthracite/5 border border-anthracite/8">
                <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Status</p>
                <p className={`text-lg font-serif ${session.crisis_detected ? 'text-red-600' : session.is_stable ? 'text-emerald-600' : 'text-anthracite'}`}>
                  {session.crisis_detected ? 'Crisis' : session.is_stable ? 'Stabiel' : 'Actief'}
                </p>
              </div>
            </div>

            {/* ── Phase progression ── */}
            <div>
              <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Faseverloop</h4>
              <div className="flex items-center gap-1.5">
                {(session.phases || []).map((p, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-anthracite-soft/25 flex-shrink-0">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-anthracite/8 text-anthracite font-sans font-medium">
                      {PHASE_LABELS[p] || p}
                    </span>
                  </React.Fragment>
                ))}
                {(session.phases || []).length === 0 && (
                  <span className="text-xs text-anthracite-soft/40 font-sans">Geen fase-informatie</span>
                )}
              </div>
            </div>

            {/* ── Emotional profile ── */}
            {(session.emotion_words || []).length > 0 && (
              <div>
                <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Emotioneel profiel</h4>
                <div className="flex flex-wrap gap-1.5">
                  {session.emotion_words.map((w, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-anthracite/8 text-anthracite font-sans">{w}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Somatic indicators ── */}
            {(session.body_areas || []).length > 0 && (
              <div>
                <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Somatische indicatoren</h4>
                <div className="flex flex-wrap gap-1.5">
                  {session.body_areas.map((a, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-anthracite/8 text-anthracite font-sans">{(BODY_AREA_LABELS as any)[a] || a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Processing pattern analysis ── */}
            {processingAnalysis && (processingAnalysis.signals.length > 0 || processingAnalysis.languageStyles.length > 0) && (
              <div className="pt-3 border-t border-anthracite/8">
                <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Verwerkingsprofiel</h4>
                <div className="space-y-2">
                  {processingAnalysis.signals.length > 0 && (
                    <div>
                      <p className="text-[10px] text-anthracite-soft/40 font-sans mb-1">Gedetecteerde signalen:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {processingAnalysis.signals.map((s, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-amber-100/60 border border-amber-200/40 text-amber-800/80 font-sans">
                            {s.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                      {processingAnalysis.avgConfidence > 0 && (
                        <p className="text-[10px] text-anthracite-soft/35 font-sans mt-1">
                          Confidence: {Math.round(processingAnalysis.avgConfidence * 100)}% — {processingAnalysis.totalUserMessages} berichten geanalyseerd
                        </p>
                      )}
                    </div>
                  )}
                  {processingAnalysis.languageStyles.length > 0 && (
                    <div>
                      <p className="text-[10px] text-anthracite-soft/40 font-sans mb-1">Taalvoorkeur:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {processingAnalysis.languageStyles.map((s, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-sky-100/60 border border-sky-200/40 text-sky-800/80 font-sans">
                            {s.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {processingAnalysis.rejectedStyles.length > 0 && (
                    <div>
                      <p className="text-[10px] text-anthracite-soft/40 font-sans mb-1">Afgewezen stijlen:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {processingAnalysis.rejectedStyles.map((s, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-red-100/50 border border-red-200/30 text-red-700/70 font-sans">
                            {s.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {processingAnalysis.directRequests.length > 0 && (
                    <div>
                      <p className="text-[10px] text-anthracite-soft/40 font-sans mb-1">Directe verzoeken:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {processingAnalysis.directRequests.map((r, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-emerald-100/50 border border-emerald-200/30 text-emerald-700/70 font-sans">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {processingAnalysis.leadershipNeeded && (
                    <p className="text-xs text-anthracite-soft/60 font-sans">
                      Leiderschap nodig: {processingAnalysis.leadershipCount} van {processingAnalysis.totalUserMessages} berichten
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Adaptations ── */}
            {processingAnalysis && processingAnalysis.adaptations.length > 0 && (
              <div className="pt-3 border-t border-anthracite/8">
                <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Aanbevolen aanpassingen</h4>
                <ul className="space-y-1">
                  {processingAnalysis.adaptations.map((a, i) => (
                    <li key={i} className="text-xs text-anthracite/70 font-sans pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-anthracite/20">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Risk assessment ── */}
            <div className="pt-3 border-t border-anthracite/8">
              <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Risico-indicatoren</h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${session.crisis_detected ? 'bg-red-500' : 'bg-emerald-400'}`} />
                  <span className="text-xs text-anthracite/70 font-sans">
                    Crisis: {session.crisis_detected ? 'Gedetecteerd' : 'Niet gedetecteerd'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${session.is_stable ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-xs text-anthracite/70 font-sans">
                    Stabilisatie: {session.is_stable ? 'Bereikt' : 'Niet bereikt'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${(session.phases || []).includes('kern') ? 'bg-emerald-400' : 'bg-anthracite/20'}`} />
                  <span className="text-xs text-anthracite/70 font-sans">
                    Verdieping: {(session.phases || []).includes('kern') ? 'Bereikt' : 'Niet bereikt'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${(session.phases || []).includes('alignment') ? 'bg-emerald-400' : 'bg-anthracite/20'}`} />
                  <span className="text-xs text-anthracite/70 font-sans">
                    Integratie: {(session.phases || []).includes('alignment') ? 'Bereikt' : 'Niet bereikt'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Summary ── */}
            {session.summary && (
              <div className="pt-3 border-t border-anthracite/8">
                <h4 className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-2">Sessiesamenvatting</h4>
                <p className="text-xs text-anthracite/70 font-sans leading-relaxed">{session.summary}</p>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};

export default CoachSessionDetail;

