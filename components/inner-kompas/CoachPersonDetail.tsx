import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ─── Persoonsduiding field definitions (display-only) ───
interface PersoonduidingFieldDef {
  key: string;
  label: string;
  type: 'feit' | 'werkhypothese' | 'coachrichting';
}

const PERSOONSDUIDING_FIELDS: PersoonduidingFieldDef[] = [
  { key: 'kernpatroon', label: 'Kernpatroon', type: 'werkhypothese' },
  { key: 'onderliggende_laag', label: 'Onderliggende laag', type: 'werkhypothese' },
  { key: 'beschermingsmechanisme', label: 'Beschermingsmechanisme', type: 'werkhypothese' },
  { key: 'wat_activeert', label: 'Wat activeert dit systeem', type: 'feit' },
  { key: 'wat_helpt', label: 'Wat helpt meestal in begeleiding', type: 'feit' },
  { key: 'wat_werkt_niet', label: 'Wat werkt meestal niet', type: 'feit' },
  { key: 'fase_readiness', label: 'Fase-readiness', type: 'werkhypothese' },
  { key: 'coachrichting_nu', label: 'Coachrichting nu', type: 'coachrichting' },
];

interface PersoonduidingData {
  [key: string]: string;
}

const TYPE_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  feit: { label: 'Feit', bg: 'bg-emerald-50/60', text: 'text-emerald-700/60', border: 'border-emerald-200/40' },
  werkhypothese: { label: 'Werkhypothese', bg: 'bg-amber-50/60', text: 'text-amber-700/60', border: 'border-amber-200/40' },
  coachrichting: { label: 'Coachrichting', bg: 'bg-sky-50/60', text: 'text-sky-700/60', border: 'border-sky-200/40' },
};


interface ClientPerson {
  user_id: string;
  display_name: string;
  session_count: number;
  last_session_date: string | null;
  short_status: string;
}

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

const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
  alignment: 'Richting',
};

interface CoachPersonDetailProps {
  person: ClientPerson;
  onBack: () => void;
  onOpenSession: (session: DbSession) => void;
}

const CoachPersonDetail: React.FC<CoachPersonDetailProps> = ({ person, onBack, onOpenSession }) => {
  const { user: coachUser } = useAuth();
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState<DbSession[]>([]);
  const [personNotes, setPersonNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Message counts per session
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});

  // AI-generated fields
  const [aiStatus, setAiStatus] = useState('');
  const [progressSummary, setProgressSummary] = useState('');
  const [accumulatedInsights, setAccumulatedInsights] = useState<string[]>([]);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);

  // AI-generated persoonsduiding
  const [persoonsduiding, setPersoonsduiding] = useState<PersoonduidingData | null>(null);
  const [pdCollapsed, setPdCollapsed] = useState(false);

  // Editing insights
  const [editingInsights, setEditingInsights] = useState(false);
  const [savingInsights, setSavingInsights] = useState(false);
  const [insightsEditText, setInsightsEditText] = useState('');

  // New insight input
  const [newInsight, setNewInsight] = useState('');

  // AI generation state
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const insightsRef = useRef<HTMLTextAreaElement>(null);


  const formatDate = (d: string) => new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const formatRelativeTime = (d: string) => {
    const now = new Date();
    const then = new Date(d);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'zojuist';
    if (diffMins < 60) return `${diffMins} min geleden`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} uur geleden`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} dag${diffDays !== 1 ? 'en' : ''} geleden`;
  };

  useEffect(() => {
    loadPersonData();
  }, [person.user_id]);

  const loadPersonData = async () => {
    setLoading(true);
    try {
      // Load sessions
      const { data: sessionsData } = await supabase
        .from('ik_sessions')
        .select('*')
        .eq('user_id', person.user_id)
        .order('started_at', { ascending: false });

      if (sessionsData) {
        setSessions(sessionsData);
        fetchMessageCounts(sessionsData.map(s => s.id));
      }

      // Load person-level data from ik_client_status
      const { data: clientStatus } = await supabase
        .from('ik_client_status')
        .select('*')
        .eq('user_id', person.user_id)
        .maybeSingle();

      if (clientStatus) {
        setPersonNotes(clientStatus.coach_notes || '');
        setAiStatus(clientStatus.short_status || '');
        setProgressSummary(clientStatus.progress_summary || '');
        setLastAnalysisAt(clientStatus.last_analysis_at || null);

        // Parse accumulated_insights
        const rawInsights = clientStatus.accumulated_insights;
        if (Array.isArray(rawInsights)) {
          setAccumulatedInsights(rawInsights.filter((i: any) => typeof i === 'string' && i.trim().length > 0));
        } else if (typeof rawInsights === 'string' && rawInsights.trim().length > 0) {
          setAccumulatedInsights([rawInsights]);
        } else {
          setAccumulatedInsights([]);
        }

        // Load AI-generated persoonsduiding
        if (clientStatus.persoonsduiding && typeof clientStatus.persoonsduiding === 'object') {
          setPersoonsduiding(clientStatus.persoonsduiding as PersoonduidingData);
        } else {
          setPersoonsduiding(null);
        }
      } else {
        setPersonNotes('');
        setAiStatus('');
        setProgressSummary('');
        setAccumulatedInsights([]);
        setLastAnalysisAt(null);
        setPersoonsduiding(null);
      }
    } catch (e) {
      console.error('Error loading person data:', e);
    }
    setLoading(false);
  };

  // ─── Fetch message counts per session (single batch) ───
  // ─── Fetch message counts per session (using proper count approach) ───
  const fetchMessageCounts = async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;

    try {
      // Use individual count queries per session to avoid the 1000-row default limit
      const counts: Record<string, number> = {};
      
      // Batch approach: fetch with high limit to avoid default 1000 cap
      const { data, error } = await supabase
        .from('ik_session_messages')
        .select('session_id', { count: 'exact', head: false })
        .in('session_id', sessionIds)
        .limit(50000);

      if (!error && data && data.length > 0) {
        data.forEach((row: { session_id: string }) => {
          counts[row.session_id] = (counts[row.session_id] || 0) + 1;
        });
        setMessageCounts(counts);
        return;
      }

      if (error) {
        console.warn('[CoachPersonDetail] Message count query failed, trying REST fallback:', error.message);
      }

      // REST API fallback with explicit high limit
      const supabaseUrl = 'https://bzmlljjjwrpxwiwnlwpb.supabase.co';
      const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y';

      const inFilter = `in.(${sessionIds.join(',')})`;
      const restUrl = `${supabaseUrl}/rest/v1/ik_session_messages?select=session_id&session_id=${encodeURIComponent(inFilter)}&limit=50000`;

      const response = await fetch(restUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const rows = await response.json();
        rows.forEach((row: { session_id: string }) => {
          counts[row.session_id] = (counts[row.session_id] || 0) + 1;
        });
        setMessageCounts(counts);
      } else {
        console.error('[CoachPersonDetail] REST fallback also failed:', response.status, await response.text());
      }
    } catch (e) {
      console.error('[CoachPersonDetail] Error fetching message counts:', e);
    }
  };



  // ─── Trigger AI analysis ───
  const triggerAiAnalysis = async () => {
    setGeneratingAnalysis(true);
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-coach-analysis', {
        body: {
          user_id: person.user_id,
          requesting_user_id: coachUser?.id,
        }
      });

      if (error) {
        console.error('AI analysis error:', error);
      } else if (data?.error) {
        console.error('AI analysis returned error:', data.error);
      } else {
        // Update local state with new AI data
        if (data.short_status) setAiStatus(data.short_status);
        if (data.progress_summary) setProgressSummary(data.progress_summary);
        if (Array.isArray(data.accumulated_insights)) {
          setAccumulatedInsights(data.accumulated_insights);
        }
        if (data.generated_at) setLastAnalysisAt(data.generated_at);

        // Update persoonsduiding from AI response
        if (data.persoonsduiding && typeof data.persoonsduiding === 'object') {
          setPersoonsduiding(data.persoonsduiding);
        }
      }
    } catch (e) {
      console.error('Failed to trigger AI analysis:', e);
    }
    setGeneratingAnalysis(false);
  };

  // ─── Save person notes ───
  const savePersonNotes = async () => {
    setSavingNotes(true);
    try {
      const { data: existing } = await supabase
        .from('ik_client_status')
        .select('id')
        .eq('user_id', person.user_id)
        .maybeSingle();

      if (existing) {
        await supabase.from('ik_client_status')
          .update({ coach_notes: personNotes, updated_at: new Date().toISOString() })
          .eq('user_id', person.user_id);
      } else {
        await supabase.from('ik_client_status')
          .insert({ user_id: person.user_id, coach_notes: personNotes });
      }
      setEditingNotes(false);
    } catch (e) {
      console.error('Error saving notes:', e);
    }
    setSavingNotes(false);
  };

  // ─── Save accumulated insights (after editing) ───
  const saveAccumulatedInsights = async (newInsights: string[]) => {
    setSavingInsights(true);
    try {
      const { data: existing } = await supabase
        .from('ik_client_status')
        .select('id')
        .eq('user_id', person.user_id)
        .maybeSingle();

      if (existing) {
        await supabase.from('ik_client_status')
          .update({ accumulated_insights: newInsights, updated_at: new Date().toISOString() })
          .eq('user_id', person.user_id);
      } else {
        await supabase.from('ik_client_status')
          .insert({ user_id: person.user_id, accumulated_insights: newInsights });
      }
      setAccumulatedInsights(newInsights);
      setEditingInsights(false);
    } catch (e) {
      console.error('Error saving insights:', e);
    }
    setSavingInsights(false);
  };

  // ─── Add a single insight ───
  const addInsight = () => {
    if (!newInsight.trim()) return;
    const updated = [...accumulatedInsights, newInsight.trim()];
    setNewInsight('');
    saveAccumulatedInsights(updated);
  };

  // ─── Remove a single insight ───
  const removeInsight = (index: number) => {
    const updated = accumulatedInsights.filter((_, i) => i !== index);
    saveAccumulatedInsights(updated);
  };

  // ─── Start editing insights as text block ───
  const startEditingInsights = () => {
    setInsightsEditText(accumulatedInsights.join('\n'));
    setEditingInsights(true);
    setTimeout(() => insightsRef.current?.focus(), 100);
  };

  // ─── Save edited insights text block ───
  const saveEditedInsights = () => {
    const lines = insightsEditText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    saveAccumulatedInsights(lines);
  };

  // Compute emotion frequency across all sessions
  const emotionFreq: Record<string, number> = {};
  sessions.forEach(s => (s.emotion_words || []).forEach(w => { emotionFreq[w] = (emotionFreq[w] || 0) + 1; }));
  const topEmotions = Object.entries(emotionFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Check if persoonsduiding has any content
  const pdHasContent = persoonsduiding && Object.values(persoonsduiding).some(v => v && v.trim().length > 0);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-72px)] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-72px)]">
      {/* ─── Header ─── */}
      <div className="px-6 py-5 border-b border-sand-dark/10 bg-cream/30">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-sand-dark/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-11 h-11 rounded-full bg-gold-light/30 flex items-center justify-center">
              <span className="text-sm font-sans font-medium text-anthracite">
                {person.display_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
            <div>
              <h1 className="font-serif text-2xl text-anthracite">{person.display_name}</h1>
              <p className="text-xs text-anthracite-soft/50 font-sans">
                {person.session_count} sessie{person.session_count !== 1 ? 's' : ''}
                {person.last_session_date && (
                  <> · Laatst: {formatDate(person.last_session_date)}</>
                )}
              </p>
            </div>
          </div>

          {/* AI Analysis refresh button */}
          <button
            onClick={triggerAiAnalysis}
            disabled={generatingAnalysis}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-sans transition-all duration-200 ${
              generatingAnalysis
                ? 'bg-gold-light/20 text-anthracite-soft/50 cursor-wait'
                : 'bg-gold-light/15 text-anthracite-soft hover:bg-gold-light/30 border border-gold-light/20 hover:border-gold-light/40'
            }`}
            title={lastAnalysisAt ? `Laatst geanalyseerd: ${formatRelativeTime(lastAnalysisAt)}` : 'Nog niet geanalyseerd'}
          >
            {generatingAnalysis ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full bg-gold-light/40 animate-breathe" />
                <span>Analyseren...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <span>AI-analyse</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ LEFT COLUMN: Persoonsduiding, Status, Progress, Insights, Emotions, Notes ═══ */}
          <div className="lg:col-span-1 space-y-5">

            {/* ═══ PERSOONSDUIDING BLOCK (AI-generated, read-only) ═══ */}
            <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
              {/* Header with collapse toggle */}
              <button
                onClick={() => setPdCollapsed(!pdCollapsed)}
                className="w-full flex items-center justify-between group"
              >
                <div>
                  <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider">Persoonsduiding</h3>
                  <p className="text-[11px] text-anthracite-soft/35 font-sans mt-0.5">Samengebracht over meerdere sessies</p>
                </div>
                <div className="flex items-center gap-2">
                  {pdHasContent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-muted/50 flex-shrink-0" title="AI-gegenereerd" />
                  )}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`text-anthracite-soft/30 group-hover:text-anthracite-soft/50 transition-all duration-200 ${pdCollapsed ? '' : 'rotate-180'}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Collapsible content */}
              {!pdCollapsed && (
                <div className="mt-4 space-y-3">
                  {/* Loading state */}
                  {generatingAnalysis && !pdHasContent && (
                    <div className="flex items-center gap-2 py-3">
                      <div className="w-3 h-3 rounded-full bg-gold-light/30 animate-breathe" />
                      <span className="text-sm text-anthracite-soft/40 font-sans italic">Persoonsduiding wordt gegenereerd...</span>
                    </div>
                  )}

                  {/* No content yet */}
                  {!generatingAnalysis && !pdHasContent && (
                    <p className="text-sm text-anthracite-soft/40 font-sans italic py-2">
                      Nog geen persoonsduiding beschikbaar. Klik op "AI-analyse" om te genereren (minimaal 2 sessies nodig).
                    </p>
                  )}

                  {/* AI-generated content */}
                  {pdHasContent && (
                    <>
                      {/* Legend */}
                      <div className="flex flex-wrap gap-2 pb-3 border-b border-sand-dark/8">
                        {Object.entries(TYPE_STYLES).map(([key, style]) => (
                          <span key={key} className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                            {style.label}
                          </span>
                        ))}
                      </div>

                      {/* Fields */}
                      {PERSOONSDUIDING_FIELDS.map((field, index) => {
                        const style = TYPE_STYLES[field.type];
                        const value = persoonsduiding?.[field.key] || '';

                        if (!value.trim()) return null;

                        return (
                          <div key={field.key}>
                            {/* Field header */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-sans font-medium text-anthracite/70">
                                {index + 1}. {field.label}
                              </span>
                              <span className={`inline-flex text-[9px] px-1.5 py-px rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                                {style.label}
                              </span>
                            </div>

                            {/* Field value (read-only) */}
                            <p className="text-sm text-anthracite/75 font-sans leading-relaxed whitespace-pre-wrap px-3 py-2">
                              {value}
                            </p>
                          </div>
                        );
                      })}

                      {/* Generating indicator when refreshing */}
                      {generatingAnalysis && (
                        <div className="flex items-center gap-2 pt-2 border-t border-sand-dark/8">
                          <div className="w-2.5 h-2.5 rounded-full bg-gold-light/30 animate-breathe" />
                          <span className="text-[11px] text-anthracite-soft/35 font-sans italic">Wordt bijgewerkt...</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 1. AI-generated short status */}
            <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider">Status</h3>
                {lastAnalysisAt && (
                  <span className="text-[10px] text-anthracite-soft/30 font-sans" title={new Date(lastAnalysisAt).toLocaleString('nl-NL')}>
                    {formatRelativeTime(lastAnalysisAt)}
                  </span>
                )}
              </div>
              {generatingAnalysis && !aiStatus ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gold-light/30 animate-breathe" />
                  <span className="text-sm text-anthracite-soft/40 font-sans italic">Wordt gegenereerd...</span>
                </div>
              ) : (
                <p className="text-sm text-anthracite/80 font-sans leading-relaxed">
                  {aiStatus || person.short_status || 'Nog geen status beschikbaar. Klik op "AI-analyse" om te genereren.'}
                </p>
              )}
            </div>

            {/* 2. AI-generated progress */}
            <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
              <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-2">Voortgang</h3>
              {generatingAnalysis && !progressSummary ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gold-light/30 animate-breathe" />
                  <span className="text-sm text-anthracite-soft/40 font-sans italic">Wordt gegenereerd...</span>
                </div>
              ) : progressSummary ? (
                <p className="text-sm text-anthracite/80 font-sans leading-relaxed">
                  {progressSummary}
                </p>
              ) : sessions.length < 2 ? (
                <p className="text-sm text-anthracite-soft/50 font-sans italic">Minimaal 2 sessies nodig voor voortgangsinzicht.</p>
              ) : (
                <p className="text-sm text-anthracite-soft/50 font-sans italic">Klik op "AI-analyse" om voortgang te genereren.</p>
              )}
            </div>

            {/* 3. AI-generated accumulated insights */}
            <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider">Opgebouwde inzichten</h3>
                {!editingInsights && accumulatedInsights.length > 0 && (
                  <button onClick={startEditingInsights} className="text-xs text-anthracite-soft/40 hover:text-anthracite-soft font-sans transition-colors">
                    Bewerken
                  </button>
                )}
              </div>

              {generatingAnalysis && accumulatedInsights.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gold-light/30 animate-breathe" />
                  <span className="text-sm text-anthracite-soft/40 font-sans italic">Wordt gegenereerd...</span>
                </div>
              ) : editingInsights ? (
                <div>
                  <textarea
                    ref={insightsRef}
                    value={insightsEditText}
                    onChange={e => setInsightsEditText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditedInsights();
                      if (e.key === 'Escape') setEditingInsights(false);
                    }}
                    className="w-full min-h-[120px] px-3 py-2.5 rounded-lg bg-warm-white border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40 resize-y"
                    placeholder="Eén inzicht per regel..."
                  />
                  <p className="text-[10px] text-anthracite-soft/30 font-sans mt-1 mb-2">Eén inzicht per regel. Ctrl+Enter om op te slaan.</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingInsights(false)} className="px-3 py-1.5 text-xs text-anthracite-soft/50 font-sans">Annuleren</button>
                    <button onClick={saveEditedInsights} disabled={savingInsights} className="px-4 py-1.5 rounded-lg text-xs font-sans bg-gold-light/20 text-anthracite border border-gold-light/30 hover:bg-gold-light/30 disabled:opacity-50">
                      {savingInsights ? 'Opslaan...' : 'Opslaan'}
                    </button>
                  </div>
                </div>
              ) : accumulatedInsights.length > 0 ? (
                <div className="space-y-2">
                  {accumulatedInsights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-gold-muted/40 mt-2 flex-shrink-0" />
                      <p className="text-sm text-anthracite/80 font-sans leading-relaxed flex-1">{insight}</p>
                      <button
                        onClick={() => removeInsight(i)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all flex-shrink-0"
                        title="Verwijderen"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400/50 hover:text-red-500">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {/* Add new insight */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-sand-dark/8">
                    <input
                      type="text"
                      value={newInsight}
                      onChange={e => setNewInsight(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addInsight(); }}
                      placeholder="Nieuw inzicht toevoegen..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-warm-white border border-sand-dark/10 text-xs text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40"
                    />
                    <button
                      onClick={addInsight}
                      disabled={!newInsight.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-sans bg-gold-light/15 text-anthracite-soft hover:bg-gold-light/25 disabled:opacity-30 transition-colors"
                    >
                      Toevoegen
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-anthracite-soft/40 font-sans italic mb-3">Nog geen inzichten. Klik op "AI-analyse" of voeg handmatig toe.</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newInsight}
                      onChange={e => setNewInsight(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addInsight(); }}
                      placeholder="Inzicht toevoegen..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-warm-white border border-sand-dark/10 text-xs text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40"
                    />
                    <button
                      onClick={addInsight}
                      disabled={!newInsight.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-sans bg-gold-light/15 text-anthracite-soft hover:bg-gold-light/25 disabled:opacity-30 transition-colors"
                    >
                      Toevoegen
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Top emotions across sessions */}
            {topEmotions.length > 0 && (
              <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
                <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-3">Terugkerende emoties</h3>
                <div className="flex flex-wrap gap-1.5">
                  {topEmotions.map(([word, count]) => (
                    <span key={word} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gold-light/20 text-anthracite-soft">
                      {word} <span className="text-anthracite-soft/30">{count}x</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Person-level coach notes */}
            <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider">Coach notities (persoon)</h3>
                {!editingNotes && (
                  <button onClick={() => { setEditingNotes(true); setTimeout(() => notesRef.current?.focus(), 100); }} className="text-xs text-anthracite-soft/40 hover:text-anthracite-soft font-sans transition-colors">
                    {personNotes ? 'Bewerken' : 'Toevoegen'}
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div>
                  <textarea
                    ref={notesRef}
                    value={personNotes}
                    onChange={e => setPersonNotes(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) savePersonNotes();
                      if (e.key === 'Escape') setEditingNotes(false);
                    }}
                    className="w-full min-h-[100px] px-3 py-2.5 rounded-lg bg-warm-white border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40 resize-y"
                    placeholder="Notities over deze persoon..."
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setEditingNotes(false)} className="px-3 py-1.5 text-xs text-anthracite-soft/50 font-sans">Annuleren</button>
                    <button onClick={savePersonNotes} disabled={savingNotes} className="px-4 py-1.5 rounded-lg text-xs font-sans bg-gold-light/20 text-anthracite border border-gold-light/30 hover:bg-gold-light/30 disabled:opacity-50">
                      {savingNotes ? 'Opslaan...' : 'Opslaan'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-anthracite/80 font-sans leading-relaxed whitespace-pre-wrap">
                  {personNotes || <span className="italic text-anthracite-soft/40">Nog geen notities.</span>}
                </p>
              )}
            </div>
          </div>

          {/* ═══ RIGHT COLUMN: Sessions list ═══ */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider">
                Sessies ({sessions.length})
              </h3>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-cream/30 border border-sand-dark/8">
                <p className="text-sm text-anthracite-soft/40 font-sans">Nog geen sessies.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sessions.map(s => {
                  const duration = s.ended_at
                    ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                    : null;
                  const msgCount = messageCounts[s.id] || 0;

                  return (
                    <button
                      key={s.id}
                      onClick={() => onOpenSession(s)}
                      className="w-full text-left p-4 rounded-xl bg-cream/50 border border-sand-dark/10 hover:border-gold-light/30 hover:bg-cream/70 transition-all duration-200 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                            <span className="text-sm text-anthracite font-sans font-medium">{formatDate(s.started_at)}</span>
                            <span className="text-xs text-anthracite-soft/40 font-sans">{formatTime(s.started_at)}</span>
                            {duration && (
                              <span className="text-xs text-anthracite-soft/30 font-sans">{duration} min</span>
                            )}
                            {/* Message count badge */}
                            {msgCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600/70 font-sans border border-sky-100/60">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                {msgCount} bericht{msgCount !== 1 ? 'en' : ''}
                              </span>
                            )}
                            {s.ended_at && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600/50 font-sans">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                Voltooid
                              </span>
                            )}
                            {s.crisis_detected && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-red-500/50 font-sans">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                Crisis
                              </span>
                            )}
                          </div>

                          {/* Phase pills */}
                          {(s.phases || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {s.phases.map((p, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gold-light/12 text-anthracite-soft/70 font-sans">{PHASE_LABELS[p] || p}</span>
                              ))}
                            </div>
                          )}

                          {/* Emotion words */}
                          {(s.emotion_words || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {s.emotion_words.slice(0, 6).map((w: string, i: number) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gold-light/15 text-anthracite-soft/60">{w}</span>
                              ))}
                              {s.emotion_words.length > 6 && (
                                <span className="text-xs text-anthracite-soft/30 font-sans">+{s.emotion_words.length - 6}</span>
                              )}
                            </div>
                          )}

                          {/* Summary preview */}
                          {s.summary && (
                            <p className="text-xs text-anthracite-soft/45 font-sans mt-1 line-clamp-2 leading-relaxed">{s.summary}</p>
                          )}

                          {/* Coach notes indicator */}
                          {s.coach_notes && (
                            <div className="flex items-center gap-1 mt-1.5">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold-muted/40">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                              <span className="text-[10px] text-anthracite-soft/30 font-sans">Notities aanwezig</span>
                            </div>
                          )}
                        </div>

                        {/* Arrow */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-anthracite-soft/20 group-hover:text-anthracite-soft/40 transition-colors flex-shrink-0 mt-1 ml-3">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </button>
                  );
                })}

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachPersonDetail;
