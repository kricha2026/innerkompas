import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { supabase } from '@/lib/supabase';

import { BODY_AREA_LABELS } from '@/lib/types';
import CoachSessionDetail, { DbSessionCoach, DbMessageCoach } from './CoachSessionDetail';
import CompassStateTimeline from './CompassStateTimeline';
import CrossSessionPatterns from './CrossSessionPatterns';
import AITestSuite from './AITestSuite';
import SessionPDFExport from './SessionPDFExport';
import CoachReviewPanel from './CoachReviewPanel';


const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
  alignment: 'Integratie',
};


type CrisisFilter = 'all' | 'crisis' | 'no-crisis';
type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';







type DashboardTab = 'sessies' | 'ai-tests' | 'ai-review';

const CoachDashboard: React.FC = () => {
  const { setCurrentView, session, activateCoach, setPhase } = useSession();

  // ─── Dashboard tab ───
  const [activeTab, setActiveTab] = useState<DashboardTab>('sessies');

  // ─── State ───
  const [sessions, setSessions] = useState<DbSessionCoach[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailMessages, setDetailMessages] = useState<DbMessageCoach[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ─── Filters ───
  const [crisisFilter, setCrisisFilter] = useState<CrisisFilter>('all');
  const [emotionFilter, setEmotionFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Coach actions ───
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const [isCoachMode, setIsCoachMode] = useState(false);

  // ─── Grouped session list state ───
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const toggleUserGroup = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };


  // ─── Load sessions ───
  useEffect(() => {
    loadSessions();
  }, []);


  const loadSessions = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ik_sessions')
        .select('*')
        .order('started_at', { ascending: false });
      if (data) setSessions(data);
    } catch (e) {
      console.error('Error loading sessions:', e);
    }
    setLoading(false);
  };

  const loadMessages = useCallback(async (sessionId: string) => {
    // Attempt 1: Supabase JS client
    try {
      const { data, error } = await supabase
        .from('ik_session_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: true });
      if (!error && data && data.length > 0) {
        setDetailMessages(data);
        return;
      }
      if (data && data.length === 0 && !error) {
        console.log(`[CoachDashboard] JS client returned 0 messages for ${sessionId} — trying REST fallback`);
      }
    } catch (e) {
      console.error('Error loading messages (JS client):', e);
    }

    // Attempt 2: Direct REST API fallback
    try {
      const SUPABASE_URL = 'https://bzmlljjjwrpxwiwnlwpb.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y';
      const url = `${SUPABASE_URL}/rest/v1/ik_session_messages?session_id=eq.${sessionId}&order=message_order.asc&select=*`;
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log(`[CoachDashboard] REST fallback returned ${data.length} messages`);
          setDetailMessages(data);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading messages (REST fallback):', e);
    }

    // Both attempts returned empty
    setDetailMessages([]);
  }, []);


  const handleSelectSession = useCallback(async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setDetailMessages([]);
    } else {
      setSelectedId(id);
      setLoadingDetail(true);
      await loadMessages(id);
      setLoadingDetail(false);
    }
  }, [selectedId, loadMessages]);

  const handleTakeover = () => {
    activateCoach();
    setIsCoachMode(true);
    setShowTakeoverConfirm(false);
  };

  // ─── Derived data ───
  const allEmotionsInData = useMemo(() => {
    const emotionSet = new Set<string>();
    sessions.forEach(s => {
      (s.emotion_words || []).forEach(w => emotionSet.add(w));
    });
    return Array.from(emotionSet).sort();
  }, [sessions]);

  // ─── Filtered sessions ───
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // Crisis filter
    if (crisisFilter === 'crisis') {
      result = result.filter(s => s.crisis_detected);
    } else if (crisisFilter === 'no-crisis') {
      result = result.filter(s => !s.crisis_detected);
    }

    // Emotion filter
    if (emotionFilter !== 'all') {
      result = result.filter(s => (s.emotion_words || []).includes(emotionFilter));
    }

    // Date filter
    const now = new Date();
    if (dateFilter === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      result = result.filter(s => new Date(s.started_at) >= todayStart);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      result = result.filter(s => new Date(s.started_at) >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      result = result.filter(s => new Date(s.started_at) >= monthAgo);
    } else if (dateFilter === 'custom') {
      if (customDateFrom) {
        const from = new Date(customDateFrom);
        result = result.filter(s => new Date(s.started_at) >= from);
      }
      if (customDateTo) {
        const to = new Date(customDateTo + 'T23:59:59');
        result = result.filter(s => new Date(s.started_at) <= to);
      }
    }

    // Search query (searches in summary and emotion words)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        (s.summary || '').toLowerCase().includes(q) ||
        (s.emotion_words || []).some(w => w.includes(q)) ||
        (s.body_areas || []).some(a => a.includes(q))
      );
    }

    return result;
  }, [sessions, crisisFilter, emotionFilter, dateFilter, customDateFrom, customDateTo, searchQuery]);

  // ─── Stats ───
  const stats = useMemo(() => {
    const total = sessions.length;
    const crisisCount = sessions.filter(s => s.crisis_detected).length;
    const stableCount = sessions.filter(s => s.is_stable).length;
    const withEmotions = sessions.filter(s => (s.emotion_words || []).length > 0).length;
    const withBody = sessions.filter(s => (s.body_areas || []).length > 0).length;

    // Emotion frequency
    const emotionFreq: Record<string, number> = {};
    sessions.forEach(s => {
      (s.emotion_words || []).forEach(w => {
        emotionFreq[w] = (emotionFreq[w] || 0) + 1;
      });
    });
    const topEmotions = Object.entries(emotionFreq).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Body area frequency
    const bodyFreq: Record<string, number> = {};
    sessions.forEach(s => {
      (s.body_areas || []).forEach(a => {
        bodyFreq[a] = (bodyFreq[a] || 0) + 1;
      });
    });
    const topBodyAreas = Object.entries(bodyFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Phase frequency
    const phaseFreq: Record<string, number> = {};
    sessions.forEach(s => {
      (s.phases || []).forEach(p => {
        phaseFreq[p] = (phaseFreq[p] || 0) + 1;
      });
    });

    return { total, crisisCount, stableCount, withEmotions, withBody, topEmotions, topBodyAreas, phaseFreq };
  }, [sessions]);

  // ─── Inner Kompas staten counts ───
  const compassStateCounts = useMemo(() => {
    const counts: Record<string, number> = {
      regulatie: 0,
      opening: 0,
      afstemming: 0,
      expansie: 0,
    };

    // Map compass_states from sessions to our 4 categories
    const stateMapping: Record<string, string> = {
      // Direct matches
      'regulation': 'regulatie',
      'regulatie': 'regulatie',
      'grounding': 'regulatie',
      'stabilization': 'regulatie',
      'safety': 'regulatie',
      'holding': 'regulatie',
      // Opening
      'opening': 'opening',
      'exploration': 'opening',
      'curiosity': 'opening',
      'awareness': 'opening',
      'kern': 'opening',
      // Afstemming
      'afstemming': 'afstemming',
      'alignment': 'afstemming',
      'attunement': 'afstemming',
      'connection': 'afstemming',
      'resonance': 'afstemming',
      'integration': 'afstemming',
      // Expansie
      'expansie': 'expansie',
      'expansion': 'expansie',
      'release': 'expansie',
      'growth': 'expansie',
      'transformation': 'expansie',
      'flow': 'expansie',
    };

    sessions.forEach(s => {
      // Count from compass_states if available
      (s.compass_states || []).forEach(cs => {
        const normalized = cs.toLowerCase().trim();
        const mapped = stateMapping[normalized];
        if (mapped) {
          counts[mapped]++;
        }
      });

      // Also derive from phases and session properties
      (s.phases || []).forEach(p => {
        if (p === 'regulation' || p === 'holding') counts.regulatie++;
        if (p === 'kern') counts.opening++;
        if (p === 'alignment') counts.afstemming++;
      });

      // Stable sessions suggest regulation was achieved
      if (s.is_stable && (s.compass_states || []).length === 0 && (s.phases || []).length === 0) {
        counts.regulatie++;
      }
    });

    const total = counts.regulatie + counts.opening + counts.afstemming + counts.expansie;
    return { ...counts, total };
  }, [sessions]);

  // ─── Grouped sessions by user ───
  interface UserGroup {
    userId: string;
    displayName: string;
    lastSessionDate: string;
    sessionCount: number;
    sessions: DbSessionCoach[];
  }

  const groupedSessions = useMemo((): UserGroup[] => {
    const groups: Record<string, UserGroup> = {};

    filteredSessions.forEach(s => {
      const userId = s.user_id || 'unknown';
      if (!groups[userId]) {
        groups[userId] = {
          userId,
          displayName: s.user_display_name || `Gebruiker ${userId.substring(0, 8)}`,
          lastSessionDate: s.started_at,
          sessionCount: 0,
          sessions: [],
        };
      }
      groups[userId].sessions.push(s);
      groups[userId].sessionCount++;
      // Update display name if this session has one and current doesn't
      if (s.user_display_name && groups[userId].displayName.startsWith('Gebruiker ')) {
        groups[userId].displayName = s.user_display_name;
      }
      // Track latest session date
      if (new Date(s.started_at) > new Date(groups[userId].lastSessionDate)) {
        groups[userId].lastSessionDate = s.started_at;
      }
    });

    // Sort groups by last session date (most recent first)
    return Object.values(groups).sort((a, b) =>
      new Date(b.lastSessionDate).getTime() - new Date(a.lastSessionDate).getTime()
    );
  }, [filteredSessions]);


  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };




  return (
    <div className="min-h-[calc(100vh-72px)] bg-sand">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ─── HEADER ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl text-anthracite">Coach Dashboard</h1>
            <p className="text-sm text-anthracite-soft font-sans mt-1">
              Sessie-overzicht, transcripten en begeleiding
            </p>
          </div>
          <div className="flex items-center gap-3">
            {session && !isCoachMode && (
              <button
                onClick={() => setShowTakeoverConfirm(true)}
                className="px-4 py-2 rounded-xl text-sm bg-anthracite text-sand-light hover:bg-anthracite-light transition-colors duration-200 font-sans"
              >
                Sessie overnemen
              </button>
            )}
            {isCoachMode && (
              <span className="px-4 py-2 rounded-xl text-sm bg-gold-light/30 text-anthracite font-sans border border-gold/20">
                Coach modus actief
              </span>
            )}
            <button
              onClick={() => setCurrentView('home')}
              className="px-4 py-2 rounded-xl text-sm text-anthracite-soft hover:text-anthracite font-sans transition-colors duration-200 border border-sand-dark/20 hover:border-sand-dark/40"
            >
              Terug
            </button>

          </div>
        </div>


        {/* ─── DASHBOARD TAB BAR ─── */}
        {/* ─── DASHBOARD TAB BAR ─── */}
        <div className="flex gap-1 mb-8 p-1 rounded-2xl bg-cream/60 border border-sand-dark/15">
          {([
            { key: 'sessies' as DashboardTab, label: 'Sessies', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
            { key: 'ai-tests' as DashboardTab, label: 'AI Tests', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
            { key: 'ai-review' as DashboardTab, label: 'AI Review', icon: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-sans transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-gold-light/40 text-anthracite border border-gold/25 shadow-sm font-medium'
                  : 'text-anthracite-soft/60 hover:text-anthracite-soft hover:bg-cream/80'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>


        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gold-light/30 animate-breathe" />
              <p className="text-sm text-anthracite-soft/50 font-sans">Sessies laden...</p>
            </div>
          </div>
        ) : activeTab === 'ai-tests' ? (
          <AITestSuite />
        ) : activeTab === 'ai-review' ? (
          <CoachReviewPanel sessions={sessions} />
        ) : (
          <>

            {/* ─── STATS OVERVIEW ─── */}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
              <div className="p-4 rounded-2xl bg-cream/70 border border-sand-dark/15">
                <p className="text-2xl font-serif text-anthracite">{stats.total}</p>
                <p className="text-xs text-anthracite-soft/60 font-sans mt-1">Totaal sessies</p>
              </div>
              <div className="p-4 rounded-2xl bg-cream/70 border border-sand-dark/15">
                <p className="text-2xl font-serif text-anthracite">{stats.withEmotions}</p>
                <p className="text-xs text-anthracite-soft/60 font-sans mt-1">Met emoties</p>
              </div>
              <div className="p-4 rounded-2xl bg-cream/70 border border-sand-dark/15">
                <p className="text-2xl font-serif text-anthracite">{stats.withBody}</p>
                <p className="text-xs text-anthracite-soft/60 font-sans mt-1">Met lichaam</p>
              </div>
              <div className="p-4 rounded-2xl bg-cream/70 border border-sand-dark/15">
                <p className="text-2xl font-serif text-emerald-600">{stats.stableCount}</p>
                <p className="text-xs text-anthracite-soft/60 font-sans mt-1">Stabiel bereikt</p>
              </div>
              <div className={`p-4 rounded-2xl border ${stats.crisisCount > 0 ? 'bg-red-50/60 border-red-200/40' : 'bg-cream/70 border-sand-dark/15'}`}>
                <p className={`text-2xl font-serif ${stats.crisisCount > 0 ? 'text-red-600' : 'text-anthracite'}`}>{stats.crisisCount}</p>
                <p className="text-xs text-anthracite-soft/60 font-sans mt-1">Crisis-detecties</p>
              </div>
            </div>

            {/* ─── TOP EMOTIONS & BODY AREAS ─── */}
            {(stats.topEmotions.length > 0 || stats.topBodyAreas.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {/* Top emotions */}
                {stats.topEmotions.length > 0 && (
                  <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
                    <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-3">Meest voorkomende emoties</h3>
                    <div className="space-y-2">
                      {stats.topEmotions.map(([word, count]) => (
                        <div key={word} className="flex items-center gap-3">
                          <span className="text-sm text-anthracite font-sans w-28 truncate">{word}</span>
                          <div className="flex-1 h-4 bg-sand-dark/8 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gold/50 rounded-full transition-all duration-500"
                              style={{ width: `${(count / (stats.topEmotions[0]?.[1] || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-anthracite-soft/40 font-sans w-8 text-right">{count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top body areas */}
                {stats.topBodyAreas.length > 0 && (
                  <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
                    <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-3">Lichaamsgebieden</h3>
                    <div className="space-y-2">
                      {stats.topBodyAreas.map(([area, count]) => (
                        <div key={area} className="flex items-center gap-3">
                          <span className="text-sm text-anthracite font-sans w-28 truncate">
                            {(BODY_AREA_LABELS as any)[area] || area}
                          </span>
                          <div className="flex-1 h-4 bg-sand-dark/8 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-anthracite/20 rounded-full transition-all duration-500"
                              style={{ width: `${(count / (stats.topBodyAreas[0]?.[1] || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-anthracite-soft/40 font-sans w-8 text-right">{count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Phase distribution */}
                {Object.keys(stats.phaseFreq).length > 0 && stats.topBodyAreas.length === 0 && (
                  <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
                    <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-3">Fase-verdeling</h3>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(stats.phaseFreq).map(([phase, count]) => (
                        <div key={phase} className="px-4 py-3 rounded-xl bg-sand-dark/8 border border-sand-dark/10">
                          <p className="text-lg font-serif text-anthracite">{count}</p>
                          <p className="text-xs text-anthracite-soft/50 font-sans">{PHASE_LABELS[phase] || phase}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}



            {/* ─── INNER KOMPAS STATEN ─── */}
            {sessions.length > 0 && (
              <div className="mb-8 p-6 rounded-2xl bg-cream/80 border border-sand-dark/15">
                <div className="flex items-center gap-3 mb-5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite/60">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                  <div>
                    <h3 className="font-serif text-lg text-anthracite">Inner Kompas staten</h3>
                    <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">
                      Verdeling over alle sessies ({compassStateCounts.total} signalen)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Regulatie */}
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-sky-50/80 to-sky-100/40 border border-sky-200/30 overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <p className="text-3xl font-serif text-sky-700 mb-1">{compassStateCounts.regulatie}</p>
                    <p className="text-sm font-sans font-semibold text-sky-900/80">Regulatie</p>
                    <p className="text-[10px] text-sky-600/50 font-sans mt-1">Grounding, veiligheid, stabilisatie</p>
                    {compassStateCounts.total > 0 && (
                      <div className="mt-3 h-1.5 bg-sky-200/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500/60 rounded-full transition-all duration-700"
                          style={{ width: `${(compassStateCounts.regulatie / compassStateCounts.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Opening */}
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-amber-50/80 to-amber-100/40 border border-amber-200/30 overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </div>
                    <p className="text-3xl font-serif text-amber-700 mb-1">{compassStateCounts.opening}</p>
                    <p className="text-sm font-sans font-semibold text-amber-900/80">Opening</p>
                    <p className="text-[10px] text-amber-600/50 font-sans mt-1">Verkenning, bewustzijn, verdieping</p>
                    {compassStateCounts.total > 0 && (
                      <div className="mt-3 h-1.5 bg-amber-200/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500/60 rounded-full transition-all duration-700"
                          style={{ width: `${(compassStateCounts.opening / compassStateCounts.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Afstemming */}
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-violet-50/80 to-violet-100/40 border border-violet-200/30 overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <p className="text-3xl font-serif text-violet-700 mb-1">{compassStateCounts.afstemming}</p>
                    <p className="text-sm font-sans font-semibold text-violet-900/80">Afstemming</p>
                    <p className="text-[10px] text-violet-600/50 font-sans mt-1">Verbinding, resonantie, integratie</p>
                    {compassStateCounts.total > 0 && (
                      <div className="mt-3 h-1.5 bg-violet-200/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500/60 rounded-full transition-all duration-700"
                          style={{ width: `${(compassStateCounts.afstemming / compassStateCounts.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Expansie */}
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 border border-emerald-200/30 overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <p className="text-3xl font-serif text-emerald-700 mb-1">{compassStateCounts.expansie}</p>
                    <p className="text-sm font-sans font-semibold text-emerald-900/80">Expansie</p>
                    <p className="text-[10px] text-emerald-600/50 font-sans mt-1">Groei, release, transformatie</p>
                    {compassStateCounts.total > 0 && (
                      <div className="mt-3 h-1.5 bg-emerald-200/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/60 rounded-full transition-all duration-700"
                          style={{ width: `${(compassStateCounts.expansie / compassStateCounts.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── CROSS-SESSION COMPASS STATE PATTERNS ─── */}
            {sessions.length > 0 && (
              <div className="mb-8">
                <CrossSessionPatterns sessions={sessions} />
              </div>
            )}

            {/* ─── ACTIVE SESSION PANEL ─── */}

            {session && (
              <div className="mb-8 p-6 rounded-2xl bg-cream border border-gold-light/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-gold animate-slow-pulse" />
                  <h3 className="font-serif text-lg text-anthracite">Actieve sessie</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="p-3 rounded-xl bg-sand-light/50">
                    <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Fase</p>
                    <p className="text-sm text-anthracite font-sans font-medium capitalize">{session.currentPhase}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-sand-light/50">
                    <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Berichten</p>
                    <p className="text-sm text-anthracite font-sans font-medium">{session.messages.length}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-sand-light/50">
                    <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Emoties</p>
                    <p className="text-sm text-anthracite font-sans font-medium">{session.userEmotionWords.length}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-sand-light/50">
                    <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Status</p>
                    <p className="text-sm font-sans font-medium">
                      {session.crisisDetected ? (
                        <span className="text-red-600">Crisis</span>
                      ) : session.isStable ? (
                        <span className="text-emerald-600">Stabiel</span>
                      ) : (
                        <span className="text-anthracite-soft">In regulatie</span>
                      )}
                    </p>
                  </div>
                </div>
                {session.userEmotionWords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {session.userEmotionWords.map((word, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-gold-light/20 text-anthracite-soft">{word}</span>
                    ))}
                  </div>
                )}

                {/* ─── COMPASS STATE TIMELINE ─── */}
                {(session.compassStateHistory.length > 0 || session.currentCompassState) && (
                  <div className="mt-4 pt-4 border-t border-sand-dark/10">
                    <CompassStateTimeline
                      compassStateHistory={session.compassStateHistory}
                      reachedRelease={session.reachedRelease}
                      reachedIntegration={session.reachedIntegration}
                      currentCompassState={session.currentCompassState}
                      currentSecondaryCompassState={session.currentSecondaryCompassState}
                    />
                  </div>
                )}

                {/* ─── COACH PHASE CONTROLS ─── */}
                <div className="flex flex-wrap gap-3 mt-4">
                  {session.isStable && session.currentPhase !== 'kern' && session.currentPhase !== 'alignment' && (
                    <button
                      onClick={() => setPhase('kern')}
                      className="px-4 py-2 rounded-xl text-sm border border-gold/30 text-anthracite hover:bg-gold-light/20 transition-colors duration-200 font-sans"
                    >
                      Kern activeren
                    </button>
                  )}
                  {(session.currentPhase === 'kern' || session.reachedIntegration) && session.currentPhase !== 'alignment' && (
                    <button
                      onClick={() => setPhase('alignment')}
                      className="px-4 py-2 rounded-xl text-sm border border-emerald-400/30 text-anthracite hover:bg-emerald-50/40 transition-colors duration-200 font-sans"
                    >
                      Integratie activeren
                    </button>
                  )}
                </div>


              </div>
            )}

            {/* ─── FILTER BAR ─── */}
            <div className="mb-6 p-4 rounded-2xl bg-cream/60 border border-sand-dark/15">
              <div className="flex items-center gap-2 mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <h3 className="text-sm font-sans font-medium text-anthracite">Filters</h3>
                {(crisisFilter !== 'all' || emotionFilter !== 'all' || dateFilter !== 'all' || searchQuery) && (
                  <button
                    onClick={() => {
                      setCrisisFilter('all');
                      setEmotionFilter('all');
                      setDateFilter('all');
                      setSearchQuery('');
                      setCustomDateFrom('');
                      setCustomDateTo('');
                    }}
                    className="ml-auto text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans underline"
                  >
                    Alles wissen
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Date filter */}
                <div>
                  <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Periode</label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                    className="w-full px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50 transition-colors"
                  >
                    <option value="all">Alle perioden</option>
                    <option value="today">Vandaag</option>
                    <option value="week">Afgelopen week</option>
                    <option value="month">Afgelopen maand</option>
                    <option value="custom">Aangepast...</option>
                  </select>
                </div>

                {/* Emotion filter */}
                <div>
                  <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Emotie</label>
                  <select
                    value={emotionFilter}
                    onChange={(e) => setEmotionFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50 transition-colors"
                  >
                    <option value="all">Alle emoties</option>
                    {allEmotionsInData.map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>

                {/* Crisis filter */}
                <div>
                  <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Crisis-status</label>
                  <select
                    value={crisisFilter}
                    onChange={(e) => setCrisisFilter(e.target.value as CrisisFilter)}
                    className="w-full px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50 transition-colors"
                  >
                    <option value="all">Alle sessies</option>
                    <option value="crisis">Alleen met crisis</option>
                    <option value="no-crisis">Zonder crisis</option>
                  </select>
                </div>

                {/* Search */}
                <div>
                  <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Zoeken</label>
                  <div className="relative">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-anthracite-soft/30">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Zoek in samenvatting, emoties..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Custom date range */}
              {dateFilter === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Van</label>
                    <input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1">Tot</label>
                    <input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50"
                    />
                  </div>
                </div>
              )}

              {/* Active filter count */}
              {filteredSessions.length !== sessions.length && (
                <p className="text-xs text-anthracite-soft/50 font-sans mt-3">
                  {filteredSessions.length} van {sessions.length} sessies weergegeven
                </p>
              )}
            </div>

            {/* ─── SESSION LIST ─── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg text-anthracite">
                  Sessies
                  <span className="text-sm text-anthracite-soft/40 font-sans ml-2">({filteredSessions.length})</span>
                </h3>
                <button
                  onClick={loadSessions}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans border border-sand-dark/15 hover:border-sand-dark/30 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Vernieuwen
                </button>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="text-center py-16 rounded-2xl bg-cream/40 border border-sand-dark/10">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/20">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-sm text-anthracite-soft/40 font-sans">
                    {sessions.length === 0
                      ? 'Nog geen sessies gevonden.'
                      : 'Geen sessies gevonden met deze filters.'}
                  </p>
                  {sessions.length > 0 && filteredSessions.length === 0 && (
                    <button
                      onClick={() => {
                        setCrisisFilter('all');
                        setEmotionFilter('all');
                        setDateFilter('all');
                        setSearchQuery('');
                      }}
                      className="mt-3 text-xs text-gold hover:text-gold-muted font-sans underline"
                    >
                      Filters wissen
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedSessions.map((group) => {
                    const isExpanded = expandedUsers.has(group.userId);
                    const daysSinceLastSession = Math.floor((Date.now() - new Date(group.lastSessionDate).getTime()) / (1000 * 60 * 60 * 24));
                    const isRecent = daysSinceLastSession <= 7;

                    return (
                      <div key={group.userId} className="rounded-2xl border border-sand-dark/15 bg-cream/40 overflow-hidden">
                        {/* ─── User group header ─── */}
                        <button
                          onClick={() => toggleUserGroup(group.userId)}
                          className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-cream/60 transition-colors duration-200"
                        >
                          {/* Avatar initial */}
                          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-anthracite/10 flex items-center justify-center">
                            <span className="text-sm font-serif text-anthracite font-semibold">
                              {group.displayName.charAt(0).toUpperCase()}
                            </span>
                          </div>

                          {/* Name + meta */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-sans font-semibold text-anthracite truncate">
                                {group.displayName}
                              </span>
                              {isRecent && (
                                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400" title="Recent actief" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-anthracite-soft/50 font-sans">
                                Laatste sessie: {formatDate(group.lastSessionDate)}
                              </span>
                              <span className="text-xs text-anthracite-soft/30 font-sans">
                                — {group.sessionCount} sessie{group.sessionCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>

                          {/* Expand/collapse chevron */}
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`text-anthracite-soft/30 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {/* ─── Sessions within this user group ─── */}
                        {isExpanded && (
                          <div className="border-t border-sand-dark/10">
                            <div className="pl-5 pr-3 py-2 space-y-2">
                              {group.sessions.map((s) => (
                                <div
                                  key={s.id}
                                  className={`rounded-xl border transition-all duration-200 overflow-hidden ml-4 ${
                                    selectedId === s.id
                                      ? 'bg-cream border-gold-light/40 shadow-sm'
                                      : 'bg-cream/60 border-sand-dark/12 hover:border-gold-light/25'
                                  }`}
                                >
                                  {/* Session row */}
                                  <button
                                    onClick={() => handleSelectSession(s.id)}
                                    className="w-full text-left p-4"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        {/* Date & time */}
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className="text-sm font-sans text-anthracite font-medium">
                                            {formatDate(s.started_at)}
                                          </span>
                                          <span className="text-xs text-anthracite-soft/40 font-sans">
                                            {formatTime(s.started_at)}
                                          </span>
                                          {s.ended_at && (
                                            <span className="text-xs text-anthracite-soft/30 font-sans">
                                              — {formatTime(s.ended_at)}
                                            </span>
                                          )}
                                          {!s.ended_at && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-light/20 text-gold-muted font-sans">
                                              Lopend
                                            </span>
                                          )}
                                        </div>

                                        {/* Phases */}
                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                          {(s.phases || []).map((p, i) => (
                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-sand-dark/12 text-anthracite-soft">
                                              {PHASE_LABELS[p] || p}
                                            </span>
                                          ))}
                                        </div>

                                        {/* Emotion words */}
                                        {(s.emotion_words || []).length > 0 && (
                                          <div className="flex flex-wrap gap-1 mb-1.5">
                                            {s.emotion_words.slice(0, 5).map((w, i) => (
                                              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gold-light/15 text-anthracite-soft/70">
                                                {w}
                                              </span>
                                            ))}
                                            {s.emotion_words.length > 5 && (
                                              <span className="text-xs text-anthracite-soft/35 font-sans">
                                                +{s.emotion_words.length - 5}
                                              </span>
                                            )}
                                          </div>
                                        )}

                                        {/* Summary */}
                                        {s.summary && (
                                          <p className="text-xs text-anthracite-soft/45 font-sans line-clamp-1 mt-0.5">
                                            {s.summary}
                                          </p>
                                        )}
                                      </div>

                                      {/* Right side: status + chevron */}
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="flex flex-col items-end gap-1">
                                          {s.crisis_detected && (
                                            <span className="flex items-center gap-1 text-[10px] text-red-500/70 font-sans">
                                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                              </svg>
                                              Crisis
                                            </span>
                                          )}
                                          {s.is_stable && (
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-500/70 font-sans">
                                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="20 6 9 17 4 12" />
                                              </svg>
                                              Stabiel
                                            </span>
                                          )}
                                        </div>
                                        <svg
                                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                          className={`text-anthracite-soft/25 transition-transform duration-200 ${selectedId === s.id ? 'rotate-180' : ''}`}
                                        >
                                          <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                      </div>
                                    </div>
                                  </button>

                                  {/* Expanded detail */}
                                  {selectedId === s.id && (
                                    <CoachSessionDetail
                                      session={s}
                                      messages={detailMessages}
                                      loading={loadingDetail}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}

        {/* ─── TAKEOVER CONFIRMATION MODAL ─── */}
        {showTakeoverConfirm && (
          <div className="fixed inset-0 bg-anthracite/20 backdrop-blur-sm flex items-center justify-center z-50 px-6">
            <div className="bg-cream rounded-2xl p-6 max-w-sm w-full shadow-xl animate-gentle-fade">
              <h3 className="font-serif text-lg text-anthracite mb-3">Sessie overnemen?</h3>
              <p className="text-sm text-anthracite-soft font-sans mb-6 leading-relaxed">
                De gebruiker wordt geïnformeerd dat de coach de sessie tijdelijk overneemt.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleTakeover}
                  className="flex-1 py-2.5 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors"
                >
                  Bevestigen
                </button>
                <button
                  onClick={() => setShowTakeoverConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-sand-dark/30 text-anthracite-soft text-sm font-sans hover:bg-sand-dark/5 transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <div className="mt-12 pt-6 border-t border-sand-dark/15 text-center">
          <p className="text-xs text-anthracite-soft/30 font-sans">
            Coach-inzicht is alleen beschikbaar met toestemming van de gebruiker.
            Alle sessiegegevens worden vertrouwelijk behandeld.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CoachDashboard;
