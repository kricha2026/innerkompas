import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { BODY_AREA_LABELS } from '@/lib/types';
import { cleanRawJsonFromMessage } from '@/ai/messageCleaner';

interface DbSession {
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
}

interface DbMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quick_replies: string[] | string | null;
  show_body_map: boolean;
  body_area_selected: string | null;
  message_order: number;
  created_at: string;
}

const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
  alignment: 'Richting',
};

interface CoachSessionViewProps {
  session: DbSession;
  personName: string;
  onBack: () => void;
  onSessionNotesChanged: (sessionId: string, notes: string) => void;
}

// ─── Direct REST API fallback for loading messages ───
// Bypasses the supabase JS client entirely, using a raw fetch with the anon key.
// This works around potential issues with the JS client (stale auth, RLS mismatch, etc.)
const SUPABASE_URL = 'https://bzmlljjjwrpxwiwnlwpb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y';

async function fetchMessagesDirectREST(sessionId: string): Promise<DbMessage[]> {
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      console.error(`[CoachSessionView] REST API error: ${response.status} ${errorText}`);
      return [];
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
    console.warn('[CoachSessionView] REST API returned non-array:', data);
    return [];
  } catch (e) {
    console.error('[CoachSessionView] REST API fetch error:', e);
    return [];
  }
}


const CoachSessionView: React.FC<CoachSessionViewProps> = ({
  session,
  personName,
  onBack,
  onSessionNotesChanged,
}) => {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gesprek' | 'inzichten' | 'notities'>('gesprek');

  const [coachNotes, setCoachNotes] = useState(session.coach_notes || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    loadMessages();
  }, [session.id]);

  const loadMessages = async () => {
    setLoading(true);
    setLoadError(null);

    const sessionId = session.id;
    console.log(`[CoachSessionView] Loading messages for session: ${sessionId}`);

    // ── Attempt 1: Supabase JS client ──
    try {
      const { data, error } = await supabase
        .from('ik_session_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: true });

      if (error) {
        console.warn(`[CoachSessionView] Supabase client error:`, error.message, error.code, error.details);
      }

      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`[CoachSessionView] Supabase client returned ${data.length} messages`);
        setMessages(data);
        setLoading(false);
        return;
      }

      // data is null or empty — could be RLS issue or genuinely no messages
      if (data && Array.isArray(data) && data.length === 0 && !error) {
        console.log(`[CoachSessionView] Supabase client returned 0 messages — trying REST API fallback`);
      } else if (!data) {
        console.warn(`[CoachSessionView] Supabase client returned null data — trying REST API fallback`);
      }
    } catch (e: any) {
      console.warn(`[CoachSessionView] Supabase client threw:`, e?.message || e);
    }

    // ── Attempt 2: Direct REST API (bypasses JS client entirely) ──
    try {
      const restMessages = await fetchMessagesDirectREST(sessionId);
      if (restMessages.length > 0) {
        console.log(`[CoachSessionView] REST API fallback returned ${restMessages.length} messages`);
        setMessages(restMessages);
        setLoading(false);
        return;
      }
      console.log(`[CoachSessionView] REST API fallback also returned 0 messages — session may genuinely have no messages`);
    } catch (e: any) {
      console.error(`[CoachSessionView] REST API fallback error:`, e?.message || e);
    }

    // ── Both attempts returned empty ──
    // This could mean the session genuinely has no messages,
    // or there's a deeper access issue.
    setMessages([]);
    setLoading(false);
  };

  const retryLoadMessages = () => {
    loadMessages();
  };

  const parseQuickReplies = (raw: string[] | string | null): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  const saveCoachNotes = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      await supabase.from('ik_sessions')
        .update({ coach_notes: coachNotes.trim() || null })
        .eq('id', session.id);
      onSessionNotesChanged(session.id, coachNotes.trim());
      setSaveStatus('saved');
      setIsEditing(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Error saving notes:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
    setSaving(false);
  };

  const duration = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null;

  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const aiMsgCount = messages.filter(m => m.role === 'assistant').length;

  return (
    <div className="min-h-[calc(100vh-72px)] flex flex-col">
      {/* ─── Header ─── */}
      <div className="px-6 py-5 border-b border-sand-dark/10 bg-cream/30">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-sand-dark/10 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div>
                <h1 className="font-serif text-xl text-anthracite">{formatDate(session.started_at)}</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-anthracite-soft/50 font-sans">{personName}</span>
                  <span className="text-anthracite-soft/20">·</span>
                  <span className="text-xs text-anthracite-soft/50 font-sans">{formatTime(session.started_at)}</span>
                  {duration && (
                    <><span className="text-anthracite-soft/20">·</span><span className="text-xs text-anthracite-soft/50 font-sans">{duration} min</span></>
                  )}
                  {session.ended_at && (
                    <><span className="text-anthracite-soft/20">·</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600/60 font-sans">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>Voltooid
                    </span></>
                  )}
                  {session.crisis_detected && (
                    <><span className="text-anthracite-soft/20">·</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-500/60 font-sans">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>Crisis
                    </span></>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(session.phases || []).map((p, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-gold-light/15 text-anthracite font-sans">{PHASE_LABELS[p] || p}</span>
              ))}
            </div>
          </div>
          {(session.emotion_words || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 ml-11">
              {session.emotion_words.map((w: string, i: number) => (
                <span key={i} className="text-xs px-2.5 py-0.5 rounded-full bg-gold-light/20 text-anthracite-soft">{w}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Tab bar ─── */}
      <div className="border-b border-sand-dark/10 bg-warm-white/50">
        <div className="max-w-5xl mx-auto flex">
          {[
            { key: 'gesprek' as const, label: 'Gesprek', count: messages.length },
            { key: 'inzichten' as const, label: 'Inzichten' },
            { key: 'notities' as const, label: 'Coach notities', hasBadge: !!coachNotes.trim() },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-3.5 text-xs font-sans uppercase tracking-wider transition-colors duration-200 ${
                activeTab === tab.key
                  ? 'text-anthracite border-b-2 border-gold bg-gold-light/5'
                  : 'text-anthracite-soft/50 hover:text-anthracite-soft/70'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && <span className="text-anthracite-soft/30">({tab.count})</span>}
                {tab.hasBadge && <span className="w-1.5 h-1.5 rounded-full bg-gold/60" />}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
            </div>
          ) : activeTab === 'gesprek' ? (
            <div>
              {/* Stats bar */}
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-sand-dark/8">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-anthracite/15" />
                  <span className="text-xs text-anthracite-soft/50 font-sans">{userMsgCount} gebruiker</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gold-light/40" />
                  <span className="text-xs text-anthracite-soft/50 font-sans">{aiMsgCount} AI</span>
                </div>
                <span className="text-xs text-anthracite-soft/30 font-sans">{messages.length} berichten totaal</span>
                {/* Retry button */}
                <button
                  onClick={retryLoadMessages}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] text-anthracite-soft/40 hover:text-anthracite-soft/70 font-sans border border-sand-dark/10 hover:border-sand-dark/20 transition-colors"
                  title="Berichten opnieuw laden"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Herladen
                </button>
              </div>

              {/* Error state */}
              {loadError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50/60 border border-red-200/30">
                  <p className="text-xs text-red-600/70 font-sans">{loadError}</p>
                </div>
              )}

              {messages.length === 0 ? (
                <div className="text-center py-16">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/20">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-sm text-anthracite-soft/40 font-sans">Geen berichten beschikbaar voor deze sessie.</p>
                  <p className="text-xs text-anthracite-soft/25 font-sans mt-1">
                    Sessie ID: {session.id.substring(0, 8)}...
                  </p>
                  <button
                    onClick={retryLoadMessages}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-sans text-anthracite-soft/50 hover:text-anthracite border border-sand-dark/15 hover:border-gold-light/30 transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Opnieuw proberen
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const quickReplies = parseQuickReplies(msg.quick_replies);
                    const showTimeSep = idx === 0 || (idx > 0 &&
                      new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 300000);

                    return (
                      <React.Fragment key={msg.id}>
                        {showTimeSep && (
                          <div className="flex items-center gap-3 py-2">
                            <div className="flex-1 h-px bg-sand-dark/8" />
                            <span className="text-[10px] text-anthracite-soft/25 font-sans">{formatTime(msg.created_at)}</span>
                            <div className="flex-1 h-px bg-sand-dark/8" />
                          </div>
                        )}
                        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%]">
                            <p className={`text-[10px] text-anthracite-soft/25 font-sans mb-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                              {isUser ? personName : 'Inner Kompas'}
                            </p>
                            <div className={`px-4 py-3 rounded-2xl text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                              isUser
                                ? 'bg-anthracite/8 text-anthracite border border-anthracite/6 rounded-br-md'
                                : 'bg-gold-light/8 text-anthracite/85 border border-gold-light/12 rounded-bl-md'
                            }`}>
                              {cleanRawJsonFromMessage(msg.content)}

                            </div>
                            {!isUser && quickReplies.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                                {quickReplies.map((reply, ri) => (
                                  <span key={ri} className="inline-block px-2.5 py-0.5 rounded-full text-xs font-sans bg-sand-dark/6 text-anthracite-soft/40 border border-sand-dark/10">{reply}</span>
                                ))}
                              </div>
                            )}
                            {!isUser && msg.show_body_map && (
                              <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-anthracite-soft/25">
                                  <circle cx="12" cy="5" r="3" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="9" y1="20" x2="12" y2="16" /><line x1="15" y1="20" x2="12" y2="16" />
                                </svg>
                                <span className="text-[10px] text-anthracite-soft/25 font-sans">
                                  Lichaamskaart{msg.body_area_selected && <> — <span className="text-anthracite-soft/35">{(BODY_AREA_LABELS as any)[msg.body_area_selected] || msg.body_area_selected}</span></>}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div className="flex items-center gap-3 pt-4 pb-2">
                    <div className="flex-1 h-px bg-sand-dark/10" />
                    <span className="text-[10px] text-anthracite-soft/20 font-sans">{session.ended_at ? 'Sessie beëindigd' : 'Sessie niet afgesloten'}</span>
                    <div className="flex-1 h-px bg-sand-dark/10" />
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'inzichten' ? (
            <div className="space-y-4">

              {/* ── Opening felt-sense ── */}
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

              {/* ── Emotions + body ── */}
              {((session.emotion_words || []).length > 0 || (session.body_areas || []).length > 0) && (
                <div>
                  {(session.emotion_words || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {session.emotion_words.map((w: string, i: number) => (
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

              {/* ── Core insight ── */}
              {session.summary && (
                <div className="pl-3.5 border-l-2 border-gold/30">
                  <p className="text-sm text-anthracite/80 font-sans leading-relaxed">{session.summary}</p>
                </div>
              )}

              {/* ── Session path ── */}
              {(session.phases || []).length > 0 && (
                <p className="text-xs text-anthracite-soft/45 font-sans">
                  De sessie bewoog door {session.phases.map(p => (PHASE_LABELS[p] || p).toLowerCase()).join(' → ')}.
                  {duration && <span className="ml-1">Duur: {duration} minuten, {messages.length} berichten.</span>}
                </p>
              )}

            </div>

          ) : (
            /* ═══ COACH NOTITIES TAB ═══ */
            <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-sans font-medium text-anthracite">Coach notities</h4>
                  <p className="text-xs text-anthracite-soft/40 font-sans mt-0.5">Sessie-specifieke notities — niet zichtbaar voor de gebruiker</p>
                </div>
                {!isEditing && (
                  <button onClick={() => { setIsEditing(true); setTimeout(() => notesRef.current?.focus(), 100); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-sans text-anthracite-soft/50 hover:text-anthracite-soft border border-sand-dark/15 hover:border-sand-dark/25 transition-colors">
                    {coachNotes.trim() ? 'Bewerken' : 'Notitie toevoegen'}
                  </button>
                )}
              </div>
              {isEditing ? (
                <div>
                  <textarea ref={notesRef} value={coachNotes} onChange={e => setCoachNotes(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveCoachNotes();
                      if (e.key === 'Escape') { setIsEditing(false); setCoachNotes(session.coach_notes || ''); }
                    }}
                    placeholder="Schrijf hier je observaties, hypotheses, aandachtspunten..."
                    className="w-full min-h-[160px] px-4 py-3 rounded-xl bg-warm-white border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40 resize-y leading-relaxed" />
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-anthracite-soft/25 font-sans">Ctrl+Enter om op te slaan</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setIsEditing(false); setCoachNotes(session.coach_notes || ''); }} className="px-3 py-1.5 text-xs text-anthracite-soft/50 font-sans">Annuleren</button>
                      <button onClick={saveCoachNotes} disabled={saving} className="px-5 py-2 rounded-xl text-xs font-sans font-medium bg-gold-light/20 text-anthracite border border-gold-light/30 hover:bg-gold-light/30 disabled:opacity-50 transition-all">
                        {saving ? 'Opslaan...' : 'Opslaan'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : coachNotes.trim() ? (
                <div className="px-4 py-3 rounded-xl bg-warm-white/60 border border-sand-dark/8">
                  <p className="text-sm text-anthracite/80 font-sans leading-relaxed whitespace-pre-wrap">{coachNotes}</p>
                </div>
              ) : (
                <div className="text-center py-10">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/15">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <p className="text-sm text-anthracite-soft/35 font-sans">Nog geen notities voor deze sessie.</p>
                  <button onClick={() => { setIsEditing(true); setTimeout(() => notesRef.current?.focus(), 100); }}
                    className="mt-3 px-4 py-2 rounded-xl text-xs font-sans text-anthracite-soft/50 hover:text-anthracite border border-sand-dark/15 hover:border-gold-light/30 transition-all">
                    Notitie toevoegen
                  </button>
                </div>
              )}
              {saveStatus === 'saved' && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-emerald-600/60 font-sans animate-gentle-fade">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>Opgeslagen
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-red-500/60 font-sans">Fout bij opslaan</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoachSessionView;
