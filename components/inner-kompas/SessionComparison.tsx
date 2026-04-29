import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { BODY_AREA_LABELS, COMPASS_STATE_LABELS, CompassState } from '@/lib/types';

const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
};

interface ComparisonSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  phases: string[];
  emotion_words: string[];
  body_areas: string[];
  is_stable: boolean;
  crisis_detected: boolean;
  summary: string | null;
  user_notes: string | null;
  custom_tags: string[];
}

interface ComparisonMessage {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  message_order: number;
}

interface CompassRecord {
  session_id: string;
  primary_state: string;
  secondary_state: string | null;
  confidence: number;
  detected_at: string;
}

interface SessionComparisonProps {
  sessions: ComparisonSession[];
  onClose: () => void;
}

const SessionComparison: React.FC<SessionComparisonProps> = ({ sessions, onClose }) => {
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ComparisonMessage[]>>({});
  const [compassBySession, setCompassBySession] = useState<Record<string, CompassRecord[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComparisonData();
  }, [sessions]);

  const loadComparisonData = async () => {
    setLoading(true);
    const sessionIds = sessions.map(s => s.id);

    try {
      // Load messages
      const { data: msgs } = await supabase
        .from('ik_session_messages')
        .select('session_id, role, content, message_order')
        .in('session_id', sessionIds)
        .order('message_order', { ascending: true });

      if (msgs) {
        const grouped: Record<string, ComparisonMessage[]> = {};
        msgs.forEach(m => {
          if (!grouped[m.session_id]) grouped[m.session_id] = [];
          grouped[m.session_id].push(m);
        });
        setMessagesBySession(grouped);
      }

      // Load compass states
      const { data: compass } = await supabase
        .from('ik_compass_state_history')
        .select('session_id, primary_state, secondary_state, confidence, detected_at')
        .in('session_id', sessionIds)
        .order('detected_at', { ascending: true });

      if (compass) {
        const grouped: Record<string, CompassRecord[]> = {};
        compass.forEach(c => {
          if (!grouped[c.session_id]) grouped[c.session_id] = [];
          grouped[c.session_id].push(c);
        });
        setCompassBySession(grouped);
      }
    } catch (e) {
      console.error('Error loading comparison data:', e);
    }
    setLoading(false);
  };

  // Compute differences
  const analysis = useMemo(() => {
    if (sessions.length < 2) return null;

    // Collect all unique items across sessions
    const allEmotions = new Set<string>();
    const allBodyAreas = new Set<string>();
    const allPhases = new Set<string>();
    const allCompassStates = new Set<string>();

    sessions.forEach(s => {
      (s.emotion_words || []).forEach(w => allEmotions.add(w));
      (s.body_areas || []).forEach(a => allBodyAreas.add(a));
      (s.phases || []).forEach(p => allPhases.add(p));
      (compassBySession[s.id] || []).forEach(c => allCompassStates.add(c.primary_state));
    });

    // Find new/removed items between consecutive sessions
    const changes: Array<{
      type: 'new_emotion' | 'removed_emotion' | 'new_body' | 'removed_body' | 'new_phase' | 'deeper_phase' | 'new_compass' | 'stability_change';
      label: string;
      fromSession: number;
      toSession: number;
    }> = [];

    for (let i = 1; i < sessions.length; i++) {
      const prev = sessions[i - 1];
      const curr = sessions[i];
      const prevEmotions = new Set(prev.emotion_words || []);
      const currEmotions = new Set(curr.emotion_words || []);
      const prevBody = new Set(prev.body_areas || []);
      const currBody = new Set(curr.body_areas || []);
      const prevPhases = new Set(prev.phases || []);
      const currPhases = new Set(curr.phases || []);

      // New emotions
      currEmotions.forEach(e => {
        if (!prevEmotions.has(e)) {
          changes.push({ type: 'new_emotion', label: e, fromSession: i, toSession: i + 1 });
        }
      });

      // Removed emotions
      prevEmotions.forEach(e => {
        if (!currEmotions.has(e)) {
          changes.push({ type: 'removed_emotion', label: e, fromSession: i, toSession: i + 1 });
        }
      });

      // New body areas
      currBody.forEach(a => {
        if (!prevBody.has(a)) {
          changes.push({ type: 'new_body', label: (BODY_AREA_LABELS as any)[a] || a, fromSession: i, toSession: i + 1 });
        }
      });

      // Removed body areas
      prevBody.forEach(a => {
        if (!currBody.has(a)) {
          changes.push({ type: 'removed_body', label: (BODY_AREA_LABELS as any)[a] || a, fromSession: i, toSession: i + 1 });
        }
      });

      // Deeper phases
      const phaseOrder = ['regulation', 'holding', 'kern'];
      const prevMaxPhase = Math.max(...(prev.phases || []).map(p => phaseOrder.indexOf(p)), -1);
      const currMaxPhase = Math.max(...(curr.phases || []).map(p => phaseOrder.indexOf(p)), -1);
      if (currMaxPhase > prevMaxPhase && currMaxPhase >= 0) {
        changes.push({
          type: 'deeper_phase',
          label: PHASE_LABELS[phaseOrder[currMaxPhase]] || phaseOrder[currMaxPhase],
          fromSession: i,
          toSession: i + 1,
        });
      }

      // Stability change
      if (prev.is_stable !== curr.is_stable) {
        changes.push({
          type: 'stability_change',
          label: curr.is_stable ? 'Stabiel bereikt' : 'Niet meer stabiel',
          fromSession: i,
          toSession: i + 1,
        });
      }
    }

    return {
      allEmotions: [...allEmotions],
      allBodyAreas: [...allBodyAreas],
      allPhases: [...allPhases],
      allCompassStates: [...allCompassStates],
      changes,
    };
  }, [sessions, compassBySession]);

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  const getDuration = (s: ComparisonSession) => {
    if (!s.ended_at) return null;
    return Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
  };

  return (
    <div className="fixed inset-0 bg-anthracite/30 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
      <div className="bg-cream rounded-2xl shadow-xl max-w-6xl w-full animate-gentle-fade">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-sand-dark/15">
          <div>
            <h2 className="font-serif text-2xl text-anthracite">Sessie vergelijking</h2>
            <p className="text-sm text-anthracite-soft font-sans mt-1">
              {sessions.length} sessies naast elkaar
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-anthracite-soft/50 hover:text-anthracite hover:bg-sand-dark/10 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
              <p className="text-sm text-anthracite-soft/50 font-sans">Vergelijkingsdata laden...</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {/* Changes summary */}
            {analysis && analysis.changes.length > 0 && (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-gold-light/10 to-cream/60 border border-gold-light/20">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  <h3 className="text-sm font-sans font-medium text-anthracite">Wat is er veranderd?</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysis.changes.map((change, i) => {
                    const icons: Record<string, { color: string; symbol: string }> = {
                      new_emotion: { color: 'text-emerald-600', symbol: '+' },
                      removed_emotion: { color: 'text-red-500/60', symbol: '-' },
                      new_body: { color: 'text-emerald-600', symbol: '+' },
                      removed_body: { color: 'text-red-500/60', symbol: '-' },
                      deeper_phase: { color: 'text-purple-600', symbol: '↑' },
                      new_phase: { color: 'text-emerald-600', symbol: '+' },
                      new_compass: { color: 'text-sky-600', symbol: '~' },
                      stability_change: { color: 'text-amber-600', symbol: '~' },
                    };
                    const icon = icons[change.type] || { color: 'text-anthracite-soft', symbol: '·' };
                    const typeLabels: Record<string, string> = {
                      new_emotion: 'Nieuwe emotie',
                      removed_emotion: 'Emotie verdwenen',
                      new_body: 'Nieuw lichaamsgebied',
                      removed_body: 'Lichaamsgebied verdwenen',
                      deeper_phase: 'Diepere fase bereikt',
                      new_phase: 'Nieuwe fase',
                      new_compass: 'Nieuwe kompas-staat',
                      stability_change: 'Stabiliteit veranderd',
                    };

                    return (
                      <div key={i} className="flex items-center gap-2 text-xs font-sans">
                        <span className={`font-bold text-sm ${icon.color}`}>{icon.symbol}</span>
                        <span className="text-anthracite-soft/50">{typeLabels[change.type]}:</span>
                        <span className="text-anthracite font-medium">{change.label}</span>
                        <span className="text-anthracite-soft/30 ml-auto">S{change.fromSession}→S{change.toSession}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Side-by-side comparison grid */}
            <div className={`grid gap-4 ${sessions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {sessions.map((s, idx) => {
                const msgs = messagesBySession[s.id] || [];
                const compass = compassBySession[s.id] || [];
                const userMsgCount = msgs.filter(m => m.role === 'user').length;
                const duration = getDuration(s);

                // Check what's new compared to previous session
                const prevSession = idx > 0 ? sessions[idx - 1] : null;
                const prevEmotions = new Set(prevSession?.emotion_words || []);
                const prevBody = new Set(prevSession?.body_areas || []);

                return (
                  <div key={s.id} className="rounded-2xl border border-sand-dark/15 bg-warm-white/60 overflow-hidden">
                    {/* Session header */}
                    <div className="p-4 bg-cream/60 border-b border-sand-dark/10">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-anthracite/10 text-anthracite font-sans font-medium">
                          Sessie {idx + 1}
                        </span>
                        {s.is_stable && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {s.crisis_detected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        )}
                      </div>
                      <p className="text-sm text-anthracite font-sans font-medium">{formatDate(s.started_at)}</p>
                      <p className="text-xs text-anthracite-soft/40 font-sans">
                        {formatTime(s.started_at)}
                        {duration !== null && ` — ${duration} min`}
                      </p>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Phases */}
                      <div>
                        <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Fasen</p>
                        <div className="flex flex-wrap gap-1">
                          {(s.phases || []).map((p, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-sand-dark/12 text-anthracite-soft">
                              {PHASE_LABELS[p] || p}
                            </span>
                          ))}
                          {(s.phases || []).length === 0 && (
                            <span className="text-xs text-anthracite-soft/25 font-sans">Geen</span>
                          )}
                        </div>
                      </div>

                      {/* Emotions */}
                      <div>
                        <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Emoties</p>
                        <div className="flex flex-wrap gap-1">
                          {(s.emotion_words || []).map((w, i) => {
                            const isNew = prevSession && !prevEmotions.has(w);
                            return (
                              <span
                                key={i}
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  isNew
                                    ? 'bg-emerald-100/60 border border-emerald-300/30 text-emerald-700'
                                    : 'bg-gold-light/20 text-anthracite-soft'
                                }`}
                              >
                                {isNew && (
                                  <span className="font-bold mr-0.5">+</span>
                                )}
                                {w}
                              </span>
                            );
                          })}
                          {(s.emotion_words || []).length === 0 && (
                            <span className="text-xs text-anthracite-soft/25 font-sans">Geen</span>
                          )}
                        </div>
                      </div>

                      {/* Body areas */}
                      <div>
                        <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Lichaam</p>
                        <div className="flex flex-wrap gap-1">
                          {(s.body_areas || []).map((a, i) => {
                            const isNew = prevSession && !prevBody.has(a);
                            return (
                              <span
                                key={i}
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  isNew
                                    ? 'bg-emerald-100/60 border border-emerald-300/30 text-emerald-700'
                                    : 'bg-sand-dark/10 text-anthracite-soft/60'
                                }`}
                              >
                                {isNew && <span className="font-bold mr-0.5">+</span>}
                                {(BODY_AREA_LABELS as any)[a] || a}
                              </span>
                            );
                          })}
                          {(s.body_areas || []).length === 0 && (
                            <span className="text-xs text-anthracite-soft/25 font-sans">Geen</span>
                          )}
                        </div>
                      </div>

                      {/* Compass states */}
                      {compass.length > 0 && (
                        <div>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Kompas-staten</p>
                          <div className="flex flex-wrap gap-1">
                            {[...new Set(compass.map(c => c.primary_state))].map((state, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-sky-100/40 border border-sky-200/20 text-sky-700/70">
                                {COMPASS_STATE_LABELS[state as CompassState] || state}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-cream/60 border border-sand-dark/10 text-center">
                          <p className="text-lg font-serif text-anthracite">{userMsgCount}</p>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans">Berichten</p>
                        </div>
                        <div className="p-2 rounded-lg bg-cream/60 border border-sand-dark/10 text-center">
                          <p className="text-lg font-serif text-anthracite">{compass.length}</p>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans">Kompas-detecties</p>
                        </div>
                      </div>

                      {/* Summary */}
                      {s.summary && (
                        <div>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1">Samenvatting</p>
                          <p className="text-xs text-anthracite-soft/60 font-sans leading-relaxed line-clamp-4">
                            {s.summary}
                          </p>
                        </div>
                      )}

                      {/* User notes */}
                      {s.user_notes && (
                        <div>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1">Notitie</p>
                          <p className="text-xs text-anthracite-soft/60 font-sans leading-relaxed italic line-clamp-3">
                            {s.user_notes}
                          </p>
                        </div>
                      )}

                      {/* Conversation patterns */}
                      {msgs.length > 0 && (
                        <div>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Gesprekspatroon</p>
                          <div className="flex gap-0.5 h-4">
                            {msgs.slice(0, 40).map((m, mi) => (
                              <div
                                key={mi}
                                className={`flex-1 min-w-[3px] rounded-sm ${
                                  m.role === 'user' ? 'bg-anthracite/20' : 'bg-gold/30'
                                }`}
                                title={`${m.role === 'user' ? 'Jij' : 'InnerKompas'}: ${m.content.slice(0, 50)}...`}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm bg-anthracite/20" />
                              <span className="text-[9px] text-anthracite-soft/30 font-sans">Jij</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm bg-gold/30" />
                              <span className="text-[9px] text-anthracite-soft/30 font-sans">InnerKompas</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Emotion overlap analysis */}
            {analysis && analysis.allEmotions.length > 0 && (
              <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
                <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-3">Emotie-overlap</h3>
                <div className="space-y-1.5">
                  {analysis.allEmotions.map(emotion => (
                    <div key={emotion} className="flex items-center gap-3">
                      <span className="text-xs text-anthracite font-sans w-24 truncate">{emotion}</span>
                      <div className="flex gap-2 flex-1">
                        {sessions.map((s, i) => {
                          const hasEmotion = (s.emotion_words || []).includes(emotion);
                          return (
                            <div
                              key={i}
                              className={`flex-1 h-5 rounded-full flex items-center justify-center text-[10px] font-sans ${
                                hasEmotion
                                  ? 'bg-gold-light/30 text-anthracite-soft/60'
                                  : 'bg-sand-dark/5 text-anthracite-soft/15'
                              }`}
                            >
                              {hasEmotion ? 'S' + (i + 1) : '—'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionComparison;
