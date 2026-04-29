import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CompassState,
  COMPASS_STATE_LABELS,
  COMPASS_STATE_DESCRIPTIONS,
} from '@/lib/types';
import { DbSessionCoach } from './CoachSessionDetail';
import ClientProgressReport from './ClientProgressReport';


// ─── Category mapping (same as CompassStateTimeline) ───
type CompassCategory = 'activatie' | 'zoek' | 'beweging';

const COMPASS_STATE_CATEGORY: Record<CompassState, CompassCategory> = {
  overprikkeld: 'activatie',
  mental_looping: 'activatie',
  injustice_activated: 'activatie',
  emotional_flooding: 'activatie',
  fight_activation: 'activatie',
  freeze_stuck: 'activatie',
  shutdown_numbness: 'activatie',
  body_signal: 'zoek',
  insight_seeking: 'zoek',
  meaning_search: 'zoek',
  release_movement: 'beweging',
  integration: 'beweging',
};

const CATEGORY_COLORS: Record<CompassCategory, {
  dot: string;
  bg: string;
  text: string;
  bar: string;
  barBg: string;
  border: string;
}> = {
  activatie: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-50/60',
    text: 'text-amber-700',
    bar: 'bg-amber-400',
    barBg: 'bg-amber-100/50',
    border: 'border-amber-200/40',
  },
  zoek: {
    dot: 'bg-sky-400',
    bg: 'bg-sky-50/60',
    text: 'text-sky-700',
    bar: 'bg-sky-400',
    barBg: 'bg-sky-100/50',
    border: 'border-sky-200/40',
  },
  beweging: {
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-50/60',
    text: 'text-emerald-700',
    bar: 'bg-emerald-400',
    barBg: 'bg-emerald-100/50',
    border: 'border-emerald-200/40',
  },
};

const CATEGORY_LABELS: Record<CompassCategory, string> = {
  activatie: 'Activatie',
  zoek: 'Zoek',
  beweging: 'Beweging',
};

// DB record shape
interface DbCompassRecord {
  id: string;
  session_id: string;
  primary_state: string;
  secondary_state: string | null;
  confidence: number;
  detected_at: string;
  source: 'client' | 'ai';
}

// Per-session analysis
interface SessionAnalysis {
  sessionId: string;
  sessionDate: Date;
  records: DbCompassRecord[];
  startState: CompassState | null;
  endState: CompassState | null;
  reachedRelease: boolean;
  reachedIntegration: boolean;
  stateFreq: Partial<Record<CompassState, number>>;
  categoryDist: Record<CompassCategory, number>;
  transitions: Array<{ from: CompassState; to: CompassState }>;
}

interface CrossSessionPatternsProps {
  sessions: DbSessionCoach[];
}

const CrossSessionPatterns: React.FC<CrossSessionPatternsProps> = ({ sessions }) => {
  const [allRecords, setAllRecords] = useState<DbCompassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('frequency');
  const [showReport, setShowReport] = useState(false);


  // ─── Load all compass state records across all sessions ───
  useEffect(() => {
    loadAllRecords();
  }, [sessions]);

  const loadAllRecords = async () => {
    if (sessions.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Query all compass state history records, ordered by detected_at
      const { data, error: queryError } = await supabase
        .from('ik_compass_state_history')
        .select('*')
        .order('detected_at', { ascending: true });

      if (queryError) {
        console.error('Error loading cross-session compass data:', queryError);
        setError('Kon patronen niet laden.');
      } else if (data) {
        setAllRecords(data);
      }
    } catch (e) {
      console.error('Error loading cross-session compass data:', e);
      setError('Kon patronen niet laden.');
    }
    setLoading(false);
  };

  // ─── Build session map for date lookup ───
  const sessionMap = useMemo(() => {
    const map = new Map<string, DbSessionCoach>();
    sessions.forEach(s => map.set(s.id, s));
    return map;
  }, [sessions]);

  // ─── Per-session analysis ───
  const sessionAnalyses: SessionAnalysis[] = useMemo(() => {
    if (allRecords.length === 0) return [];

    // Group records by session_id
    const grouped = new Map<string, DbCompassRecord[]>();
    allRecords.forEach(r => {
      if (!grouped.has(r.session_id)) grouped.set(r.session_id, []);
      grouped.get(r.session_id)!.push(r);
    });

    const analyses: SessionAnalysis[] = [];

    grouped.forEach((records, sessionId) => {
      const sessionInfo = sessionMap.get(sessionId);
      const sessionDate = sessionInfo ? new Date(sessionInfo.started_at) : new Date(records[0].detected_at);

      // Sort by detected_at
      records.sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime());

      const startState = records.length > 0 ? (records[0].primary_state as CompassState) : null;
      const endState = records.length > 0 ? (records[records.length - 1].primary_state as CompassState) : null;
      const reachedRelease = records.some(r => r.primary_state === 'release_movement');
      const reachedIntegration = records.some(r => r.primary_state === 'integration');

      // State frequency
      const stateFreq: Partial<Record<CompassState, number>> = {};
      records.forEach(r => {
        const state = r.primary_state as CompassState;
        stateFreq[state] = (stateFreq[state] || 0) + 1;
      });

      // Category distribution
      const categoryDist: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
      records.forEach(r => {
        const state = r.primary_state as CompassState;
        if (COMPASS_STATE_CATEGORY[state]) {
          categoryDist[COMPASS_STATE_CATEGORY[state]]++;
        }
      });

      // Transitions
      const transitions: Array<{ from: CompassState; to: CompassState }> = [];
      for (let i = 1; i < records.length; i++) {
        const from = records[i - 1].primary_state as CompassState;
        const to = records[i].primary_state as CompassState;
        if (from !== to) {
          transitions.push({ from, to });
        }
      }

      analyses.push({
        sessionId,
        sessionDate,
        records,
        startState,
        endState,
        reachedRelease,
        reachedIntegration,
        stateFreq,
        categoryDist,
        transitions,
      });
    });

    // Sort by session date
    analyses.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime());

    return analyses;
  }, [allRecords, sessionMap]);

  // ─── Cross-session aggregated analytics ───
  const analytics = useMemo(() => {
    if (sessionAnalyses.length === 0) return null;

    // 1. Overall state frequency across all sessions
    const globalStateFreq: Partial<Record<CompassState, number>> = {};
    allRecords.forEach(r => {
      const state = r.primary_state as CompassState;
      globalStateFreq[state] = (globalStateFreq[state] || 0) + 1;
    });
    const sortedGlobalStates = Object.entries(globalStateFreq)
      .sort((a, b) => b[1] - a[1]) as [CompassState, number][];

    // 2. Global category distribution
    const globalCategoryDist: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    allRecords.forEach(r => {
      const state = r.primary_state as CompassState;
      if (COMPASS_STATE_CATEGORY[state]) {
        globalCategoryDist[COMPASS_STATE_CATEGORY[state]]++;
      }
    });
    const totalDetections = allRecords.length;

    // 3. Common transitions across sessions (aggregate)
    const globalTransitions: Record<string, number> = {};
    sessionAnalyses.forEach(sa => {
      sa.transitions.forEach(t => {
        const key = `${t.from}→${t.to}`;
        globalTransitions[key] = (globalTransitions[key] || 0) + 1;
      });
    });
    const sortedTransitions = Object.entries(globalTransitions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // 4. Transitions that appear in MULTIPLE sessions (cross-session recurring)
    const transitionPerSession: Record<string, Set<string>> = {};
    sessionAnalyses.forEach(sa => {
      sa.transitions.forEach(t => {
        const key = `${t.from}→${t.to}`;
        if (!transitionPerSession[key]) transitionPerSession[key] = new Set();
        transitionPerSession[key].add(sa.sessionId);
      });
    });
    const recurringTransitions = Object.entries(transitionPerSession)
      .filter(([_, sessions]) => sessions.size >= 2)
      .map(([key, sessions]) => ({
        key,
        sessionCount: sessions.size,
        totalCount: globalTransitions[key] || 0,
      }))
      .sort((a, b) => b.sessionCount - a.sessionCount || b.totalCount - a.totalCount)
      .slice(0, 6);

    // 5. Release/integration trend over time
    const releaseTrend = sessionAnalyses.map(sa => ({
      date: sa.sessionDate,
      reachedRelease: sa.reachedRelease,
      reachedIntegration: sa.reachedIntegration,
      recordCount: sa.records.length,
    }));

    // Running average: what % of last N sessions reached release/integration
    const releaseRate = sessionAnalyses.filter(sa => sa.reachedRelease).length / sessionAnalyses.length;
    const integrationRate = sessionAnalyses.filter(sa => sa.reachedIntegration).length / sessionAnalyses.length;

    // Trend direction: compare first half vs second half
    const halfIdx = Math.floor(sessionAnalyses.length / 2);
    const firstHalf = sessionAnalyses.slice(0, halfIdx || 1);
    const secondHalf = sessionAnalyses.slice(halfIdx || 1);
    const firstHalfReleaseRate = firstHalf.filter(sa => sa.reachedRelease).length / (firstHalf.length || 1);
    const secondHalfReleaseRate = secondHalf.filter(sa => sa.reachedRelease).length / (secondHalf.length || 1);
    const firstHalfIntegrationRate = firstHalf.filter(sa => sa.reachedIntegration).length / (firstHalf.length || 1);
    const secondHalfIntegrationRate = secondHalf.filter(sa => sa.reachedIntegration).length / (secondHalf.length || 1);
    const releaseTrendDirection = secondHalfReleaseRate > firstHalfReleaseRate ? 'improving' :
      secondHalfReleaseRate < firstHalfReleaseRate ? 'declining' : 'stable';
    const integrationTrendDirection = secondHalfIntegrationRate > firstHalfIntegrationRate ? 'improving' :
      secondHalfIntegrationRate < firstHalfIntegrationRate ? 'declining' : 'stable';

    // 6. Start vs end states
    const startStateFreq: Partial<Record<CompassState, number>> = {};
    const endStateFreq: Partial<Record<CompassState, number>> = {};
    sessionAnalyses.forEach(sa => {
      if (sa.startState) startStateFreq[sa.startState] = (startStateFreq[sa.startState] || 0) + 1;
      if (sa.endState) endStateFreq[sa.endState] = (endStateFreq[sa.endState] || 0) + 1;
    });
    const sortedStartStates = Object.entries(startStateFreq)
      .sort((a, b) => b[1] - a[1]) as [CompassState, number][];
    const sortedEndStates = Object.entries(endStateFreq)
      .sort((a, b) => b[1] - a[1]) as [CompassState, number][];

    // 7. Start category vs end category distribution
    const startCatDist: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    const endCatDist: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    sessionAnalyses.forEach(sa => {
      if (sa.startState && COMPASS_STATE_CATEGORY[sa.startState]) {
        startCatDist[COMPASS_STATE_CATEGORY[sa.startState]]++;
      }
      if (sa.endState && COMPASS_STATE_CATEGORY[sa.endState]) {
        endCatDist[COMPASS_STATE_CATEGORY[sa.endState]]++;
      }
    });

    // 8. Average confidence across all records
    const avgConfidence = allRecords.length > 0
      ? allRecords.reduce((sum, r) => sum + r.confidence, 0) / allRecords.length
      : 0;

    // 9. States per session (average)
    const avgStatesPerSession = sessionAnalyses.length > 0
      ? sessionAnalyses.reduce((sum, sa) => sum + sa.records.length, 0) / sessionAnalyses.length
      : 0;

    return {
      sortedGlobalStates,
      globalCategoryDist,
      totalDetections,
      sortedTransitions,
      recurringTransitions,
      releaseTrend,
      releaseRate,
      integrationRate,
      releaseTrendDirection,
      integrationTrendDirection,
      sortedStartStates,
      sortedEndStates,
      startCatDist,
      endCatDist,
      avgConfidence,
      avgStatesPerSession,
      sessionCount: sessionAnalyses.length,
    };
  }, [sessionAnalyses, allRecords]);

  // ─── Helpers ───
  const getStateStyle = (state: CompassState) => {
    const cat = COMPASS_STATE_CATEGORY[state];
    return CATEGORY_COLORS[cat];
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const trendIcon = (direction: string) => {
    if (direction === 'improving') return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    );
    if (direction === 'declining') return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    );
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  };

  const trendLabel = (direction: string) => {
    if (direction === 'improving') return 'Verbeterend';
    if (direction === 'declining') return 'Afnemend';
    return 'Stabiel';
  };

  // ─── Render ───
  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
        <div className="flex items-center gap-3 mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <h2 className="font-serif text-lg text-anthracite">Patronen</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
            <p className="text-xs text-anthracite-soft/40 font-sans">Cross-sessie patronen laden...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
        <div className="flex items-center gap-3 mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <h2 className="font-serif text-lg text-anthracite">Patronen</h2>
        </div>
        <p className="text-sm text-red-500/70 font-sans">{error}</p>
        <button onClick={loadAllRecords} className="mt-2 text-xs text-gold hover:text-gold-muted font-sans underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (!analytics || analytics.totalDetections === 0) {
    return (
      <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
        <div className="flex items-center gap-3 mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <h2 className="font-serif text-lg text-anthracite">Patronen</h2>
        </div>
        <div className="text-center py-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/20">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <p className="text-sm text-anthracite-soft/40 font-sans">
            Nog geen kompas-staat data beschikbaar.
          </p>
          <p className="text-xs text-anthracite-soft/30 font-sans mt-1">
            Patronen worden zichtbaar zodra er sessies zijn met kompas-staat detectie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15 space-y-6">

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100 flex items-center justify-center border border-sand-dark/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite/60">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <div>
            <h2 className="font-serif text-lg text-anthracite">Patronen</h2>
            <p className="text-[11px] text-anthracite-soft/50 font-sans">
              Cross-sessie kompas-staat analyse — {analytics.sessionCount} sessies, {analytics.totalDetections} detecties
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-anthracite font-sans font-medium bg-gradient-to-r from-gold-light/40 to-gold-light/20 border border-gold/25 hover:border-gold/40 hover:from-gold-light/60 hover:to-gold-light/30 transition-all duration-200 shadow-sm"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Genereer rapport
          </button>
          <button
            onClick={loadAllRecords}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans border border-sand-dark/15 hover:border-sand-dark/30 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Vernieuwen
          </button>
        </div>
      </div>


      {/* ─── OVERVIEW STATS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-cream/80 border border-sand-dark/10 text-center">
          <p className="text-xl font-serif text-anthracite">{analytics.sessionCount}</p>
          <p className="text-[10px] text-anthracite-soft/50 font-sans">Sessies met data</p>
        </div>
        <div className="p-3 rounded-xl bg-cream/80 border border-sand-dark/10 text-center">
          <p className="text-xl font-serif text-anthracite">{analytics.totalDetections}</p>
          <p className="text-[10px] text-anthracite-soft/50 font-sans">Totaal detecties</p>
        </div>
        <div className="p-3 rounded-xl bg-cream/80 border border-sand-dark/10 text-center">
          <p className="text-xl font-serif text-anthracite">{analytics.avgStatesPerSession.toFixed(1)}</p>
          <p className="text-[10px] text-anthracite-soft/50 font-sans">Gem. per sessie</p>
        </div>
        <div className="p-3 rounded-xl bg-cream/80 border border-sand-dark/10 text-center">
          <p className="text-xl font-serif text-anthracite">{Math.round(analytics.avgConfidence * 100)}%</p>
          <p className="text-[10px] text-anthracite-soft/50 font-sans">Gem. confidence</p>
        </div>
      </div>

      {/* ─── GLOBAL CATEGORY DISTRIBUTION ─── */}
      <div>
        <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Categorie-verdeling (alle sessies)</p>
        <div className="flex h-4 rounded-full overflow-hidden bg-sand-dark/8">
          {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
            const count = analytics.globalCategoryDist[cat];
            const pct = (count / analytics.totalDetections) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={cat}
                className={`${CATEGORY_COLORS[cat].bar} transition-all duration-500 relative group`}
                style={{ width: `${pct}%` }}
              >
                {pct > 12 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-sans text-white/80 font-medium">
                    {Math.round(pct)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
            const count = analytics.globalCategoryDist[cat];
            if (count === 0) return <span key={cat} />;
            return (
              <div key={cat} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[cat].dot}`} />
                <span className={`text-[10px] font-sans ${CATEGORY_COLORS[cat].text}`}>
                  {CATEGORY_LABELS[cat]}: {count}x ({Math.round((count / analytics.totalDetections) * 100)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── SECTION 1: MOST FREQUENT STATES ─── */}
      <div className="border border-sand-dark/10 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('frequency')}
          className="w-full flex items-center justify-between px-4 py-3 bg-cream/40 hover:bg-cream/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span className="text-sm font-sans font-medium text-anthracite">Meest voorkomende staten</span>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-anthracite-soft/30 transition-transform duration-200 ${expandedSection === 'frequency' ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {expandedSection === 'frequency' && (
          <div className="px-4 py-4 space-y-2 animate-gentle-fade">
            {analytics.sortedGlobalStates.map(([state, count]) => {
              const style = getStateStyle(state);
              const pct = (count / analytics.totalDetections) * 100;
              return (
                <div key={state} className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className="text-xs text-anthracite font-sans w-44 truncate" title={COMPASS_STATE_DESCRIPTIONS[state]}>
                    {COMPASS_STATE_LABELS[state]}
                  </span>
                  <div className="flex-1 h-2.5 bg-sand-dark/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${style.bar} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-anthracite-soft/50 font-sans w-14 text-right">
                    {count}x ({Math.round(pct)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── SECTION 2: RELEASE / INTEGRATION TREND ─── */}
      <div className="border border-sand-dark/10 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('trend')}
          className="w-full flex items-center justify-between px-4 py-3 bg-cream/40 hover:bg-cream/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="text-sm font-sans font-medium text-anthracite">Release & integratie trend</span>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-anthracite-soft/30 transition-transform duration-200 ${expandedSection === 'trend' ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {expandedSection === 'trend' && (
          <div className="px-4 py-4 space-y-4 animate-gentle-fade">
            {/* Rate cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-xl border ${analytics.releaseRate > 0 ? 'bg-emerald-50/40 border-emerald-200/30' : 'bg-cream/60 border-sand-dark/10'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-anthracite-soft/60 font-sans">Release bereikt</span>
                  {trendIcon(analytics.releaseTrendDirection)}
                </div>
                <p className={`text-2xl font-serif ${analytics.releaseRate > 0 ? 'text-emerald-600' : 'text-anthracite-soft/30'}`}>
                  {Math.round(analytics.releaseRate * 100)}%
                </p>
                <p className="text-[10px] text-anthracite-soft/40 font-sans mt-0.5">
                  {sessionAnalyses.filter(sa => sa.reachedRelease).length} van {analytics.sessionCount} sessies
                  <span className="ml-1.5">
                    — {trendLabel(analytics.releaseTrendDirection)}
                  </span>
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${analytics.integrationRate > 0 ? 'bg-emerald-50/40 border-emerald-200/30' : 'bg-cream/60 border-sand-dark/10'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-anthracite-soft/60 font-sans">Integratie bereikt</span>
                  {trendIcon(analytics.integrationTrendDirection)}
                </div>
                <p className={`text-2xl font-serif ${analytics.integrationRate > 0 ? 'text-emerald-600' : 'text-anthracite-soft/30'}`}>
                  {Math.round(analytics.integrationRate * 100)}%
                </p>
                <p className="text-[10px] text-anthracite-soft/40 font-sans mt-0.5">
                  {sessionAnalyses.filter(sa => sa.reachedIntegration).length} van {analytics.sessionCount} sessies
                  <span className="ml-1.5">
                    — {trendLabel(analytics.integrationTrendDirection)}
                  </span>
                </p>
              </div>
            </div>

            {/* Session-by-session timeline */}
            <div>
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Per sessie</p>
              <div className="overflow-x-auto pb-1">
                <div className="flex items-end gap-1.5 min-w-fit">
                  {analytics.releaseTrend.map((entry, idx) => {
                    const maxRecords = Math.max(...analytics.releaseTrend.map(e => e.recordCount));
                    const barHeight = Math.max(12, (entry.recordCount / (maxRecords || 1)) * 60);
                    const hasRelease = entry.reachedRelease;
                    const hasIntegration = entry.reachedIntegration;
                    const barColor = hasIntegration ? 'bg-emerald-400' :
                      hasRelease ? 'bg-emerald-300' :
                      'bg-sand-dark/20';
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1 group relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-30">
                          <div className="bg-anthracite text-sand-light rounded-lg px-3 py-2 text-[10px] font-sans whitespace-nowrap shadow-lg">
                            <p className="font-medium">{formatDate(entry.date)}</p>
                            <p className="text-sand-light/60">{entry.recordCount} detecties</p>
                            {hasRelease && <p className="text-emerald-300">Release bereikt</p>}
                            {hasIntegration && <p className="text-emerald-300">Integratie bereikt</p>}
                            {!hasRelease && !hasIntegration && <p className="text-sand-light/40">Geen release/integratie</p>}
                          </div>
                        </div>
                        {/* Bar */}
                        <div
                          className={`w-5 rounded-t-md transition-all duration-300 cursor-pointer hover:opacity-80 ${barColor}`}
                          style={{ height: `${barHeight}px` }}
                        />
                        {/* Indicators */}
                        <div className="flex gap-0.5">
                          {hasRelease && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                          {hasIntegration && <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                          {!hasRelease && !hasIntegration && <div className="w-1.5 h-1.5 rounded-full bg-sand-dark/15" />}
                        </div>
                        {/* Date label (show every few) */}
                        {(idx === 0 || idx === analytics.releaseTrend.length - 1 || idx % Math.max(1, Math.floor(analytics.releaseTrend.length / 5)) === 0) && (
                          <span className="text-[8px] text-anthracite-soft/30 font-sans -rotate-45 origin-top-left mt-1 whitespace-nowrap">
                            {formatDate(entry.date)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                  <span className="text-[10px] text-anthracite-soft/50 font-sans">Release bereikt</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                  <span className="text-[10px] text-anthracite-soft/50 font-sans">Integratie bereikt</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-sand-dark/20" />
                  <span className="text-[10px] text-anthracite-soft/50 font-sans">Geen van beide</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 3: COMMON TRANSITIONS ─── */}
      <div className="border border-sand-dark/10 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('transitions')}
          className="w-full flex items-center justify-between px-4 py-3 bg-cream/40 hover:bg-cream/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <path d="M11 18H8a2 2 0 0 1-2-2V9" />
            </svg>
            <span className="text-sm font-sans font-medium text-anthracite">Veelvoorkomende transities</span>
            {analytics.recurringTransitions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-gold-light/20 text-[10px] text-anthracite-soft/60 font-sans">
                {analytics.recurringTransitions.length} herhalend
              </span>
            )}
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-anthracite-soft/30 transition-transform duration-200 ${expandedSection === 'transitions' ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {expandedSection === 'transitions' && (
          <div className="px-4 py-4 space-y-4 animate-gentle-fade">
            {/* Recurring transitions (across multiple sessions) */}
            {analytics.recurringTransitions.length > 0 && (
              <div>
                <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">
                  Herhalende transities (meerdere sessies)
                </p>
                <div className="space-y-2">
                  {analytics.recurringTransitions.map(({ key, sessionCount, totalCount }) => {
                    const [fromKey, toKey] = key.split('→') as [CompassState, CompassState];
                    const fromStyle = getStateStyle(fromKey);
                    const toStyle = getStateStyle(toKey);
                    return (
                      <div key={key} className="flex items-center gap-2 p-2.5 rounded-xl bg-gold-light/8 border border-gold-light/15">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${fromStyle.dot}`} />
                          <span className="text-xs text-anthracite font-sans truncate">{COMPASS_STATE_LABELS[fromKey]}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30 flex-shrink-0">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${toStyle.dot}`} />
                          <span className="text-xs text-anthracite font-sans truncate">{COMPASS_STATE_LABELS[toKey]}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-anthracite-soft/50 font-sans">{totalCount}x totaal</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-gold-light/20 text-[10px] text-anthracite-soft/70 font-sans">
                            {sessionCount} sessies
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All common transitions */}
            <div>
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">
                Alle veelvoorkomende transities
              </p>
              <div className="space-y-1.5">
                {analytics.sortedTransitions.map(([key, count]) => {
                  const [fromKey, toKey] = key.split('→') as [CompassState, CompassState];
                  const fromStyle = getStateStyle(fromKey);
                  const toStyle = getStateStyle(toKey);
                  const maxCount = analytics.sortedTransitions[0]?.[1] || 1;
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div className="flex items-center gap-1 w-52 flex-shrink-0 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${fromStyle.dot}`} />
                        <span className="text-[11px] text-anthracite font-sans truncate">{COMPASS_STATE_LABELS[fromKey]}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/25 flex-shrink-0">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${toStyle.dot}`} />
                        <span className="text-[11px] text-anthracite font-sans truncate">{COMPASS_STATE_LABELS[toKey]}</span>
                      </div>
                      <div className="flex-1 h-2 bg-sand-dark/8 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${toStyle.bar} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-anthracite-soft/40 font-sans w-8 text-right flex-shrink-0">{count}x</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 4: START vs END STATES ─── */}
      <div className="border border-sand-dark/10 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('startend')}
          className="w-full flex items-center justify-between px-4 py-3 bg-cream/40 hover:bg-cream/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
              <circle cx="5" cy="12" r="3" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <circle cx="19" cy="12" r="3" />
            </svg>
            <span className="text-sm font-sans font-medium text-anthracite">Start- vs. eindstaten</span>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-anthracite-soft/30 transition-transform duration-200 ${expandedSection === 'startend' ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {expandedSection === 'startend' && (
          <div className="px-4 py-4 space-y-5 animate-gentle-fade">
            {/* Category shift visualization */}
            <div>
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-3">Categorie-verschuiving: begin vs. einde</p>
              <div className="grid grid-cols-2 gap-4">
                {/* Start distribution */}
                <div>
                  <p className="text-[10px] text-anthracite-soft/50 font-sans mb-1.5 text-center">Begin van sessie</p>
                  <div className="flex h-3 rounded-full overflow-hidden bg-sand-dark/8">
                    {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                      const count = analytics.startCatDist[cat];
                      const total = Object.values(analytics.startCatDist).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      if (pct === 0) return null;
                      return (
                        <div
                          key={cat}
                          className={`${CATEGORY_COLORS[cat].bar} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                      const count = analytics.startCatDist[cat];
                      if (count === 0) return <span key={cat} />;
                      return (
                        <span key={cat} className={`text-[9px] font-sans ${CATEGORY_COLORS[cat].text}`}>
                          {count}x
                        </span>
                      );
                    })}
                  </div>
                </div>
                {/* End distribution */}
                <div>
                  <p className="text-[10px] text-anthracite-soft/50 font-sans mb-1.5 text-center">Einde van sessie</p>
                  <div className="flex h-3 rounded-full overflow-hidden bg-sand-dark/8">
                    {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                      const count = analytics.endCatDist[cat];
                      const total = Object.values(analytics.endCatDist).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      if (pct === 0) return null;
                      return (
                        <div
                          key={cat}
                          className={`${CATEGORY_COLORS[cat].bar} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                      const count = analytics.endCatDist[cat];
                      if (count === 0) return <span key={cat} />;
                      return (
                        <span key={cat} className={`text-[9px] font-sans ${CATEGORY_COLORS[cat].text}`}>
                          {count}x
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Arrow between */}
              <div className="flex items-center justify-center my-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/20">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>

            {/* Start states */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Meest voorkomende startstaten</p>
                <div className="space-y-1.5">
                  {analytics.sortedStartStates.slice(0, 5).map(([state, count]) => {
                    const style = getStateStyle(state);
                    return (
                      <div key={state} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                        <span className="text-xs text-anthracite font-sans flex-1 truncate">{COMPASS_STATE_LABELS[state]}</span>
                        <span className="text-[10px] text-anthracite-soft/40 font-sans">{count}x</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Meest voorkomende eindstaten</p>
                <div className="space-y-1.5">
                  {analytics.sortedEndStates.slice(0, 5).map(([state, count]) => {
                    const style = getStateStyle(state);
                    return (
                      <div key={state} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                        <span className="text-xs text-anthracite font-sans flex-1 truncate">{COMPASS_STATE_LABELS[state]}</span>
                        <span className="text-[10px] text-anthracite-soft/40 font-sans">{count}x</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Insight text */}
            <div className="p-3 rounded-xl bg-cream/60 border border-sand-dark/10">
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Inzicht: start vs. einde</p>
              <p className="text-xs text-anthracite-soft/70 font-sans leading-relaxed">
                {(() => {
                  const startActivatie = analytics.startCatDist.activatie;
                  const endActivatie = analytics.endCatDist.activatie;
                  const startBeweging = analytics.startCatDist.beweging;
                  const endBeweging = analytics.endCatDist.beweging;
                  const totalStart = Object.values(analytics.startCatDist).reduce((a, b) => a + b, 0);
                  const totalEnd = Object.values(analytics.endCatDist).reduce((a, b) => a + b, 0);

                  if (totalStart === 0 || totalEnd === 0) {
                    return 'Onvoldoende data om start- en eindpatronen te vergelijken.';
                  }

                  const startActivatiePct = (startActivatie / totalStart) * 100;
                  const endActivatiePct = (endActivatie / totalEnd) * 100;
                  const endBewegingPct = (endBeweging / totalEnd) * 100;
                  const startBewegingPct = (startBeweging / totalStart) * 100;

                  const parts: string[] = [];

                  if (startActivatiePct > 60) {
                    parts.push(`De gebruiker start sessies overwegend in activatie-staten (${Math.round(startActivatiePct)}%).`);
                  }

                  if (endBewegingPct > endActivatiePct && endBewegingPct > 30) {
                    parts.push(`Sessies eindigen vaker in bewegings-staten (${Math.round(endBewegingPct)}%), wat wijst op regulatie-succes.`);
                  } else if (endActivatiePct > startActivatiePct) {
                    parts.push(`Sessies eindigen nog vaak in activatie-staten — het regulatieproces heeft meer ruimte nodig.`);
                  }

                  if (endBewegingPct > startBewegingPct) {
                    parts.push('Er is een positieve verschuiving van activatie naar beweging over de sessie.');
                  }

                  if (parts.length === 0) {
                    parts.push('De start- en eindstaten tonen een gevarieerd patroon. Meer sessies geven een duidelijker beeld.');
                  }

                  return parts.join(' ');
                })()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 5: REGULATION JOURNEY INSIGHT ─── */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-cream/80 to-gold-light/10 border border-gold-light/20">
        <div className="flex items-center gap-2 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <h4 className="text-xs font-sans text-anthracite-soft/60 uppercase tracking-wider">Regulatie-reis samenvatting</h4>
        </div>
        <p className="text-sm text-anthracite font-sans leading-relaxed">
          {(() => {
            const parts: string[] = [];

            // Most common state
            if (analytics.sortedGlobalStates.length > 0) {
              const [topState, topCount] = analytics.sortedGlobalStates[0];
              const topPct = Math.round((topCount / analytics.totalDetections) * 100);
              parts.push(
                `De meest voorkomende kompas-staat is "${COMPASS_STATE_LABELS[topState]}" (${topPct}% van alle detecties).`
              );
            }

            // Release/integration trend
            if (analytics.releaseTrendDirection === 'improving') {
              parts.push('De gebruiker bereikt steeds vaker release en/of integratie — een positief teken van groeiend regulatievermogen.');
            } else if (analytics.releaseTrendDirection === 'declining') {
              parts.push('Release wordt minder vaak bereikt in recente sessies. Dit kan wijzen op een moeilijkere periode of nieuwe thema\'s.');
            }

            if (analytics.integrationTrendDirection === 'improving' && analytics.releaseTrendDirection !== 'improving') {
              parts.push('Integratie wordt vaker bereikt — de gebruiker kan beter reflecteren en patronen verbinden.');
            }

            // Recurring transitions
            if (analytics.recurringTransitions.length > 0) {
              const top = analytics.recurringTransitions[0];
              const [from, to] = top.key.split('→') as [CompassState, CompassState];
              parts.push(
                `Een herhalend patroon is de transitie van "${COMPASS_STATE_LABELS[from]}" naar "${COMPASS_STATE_LABELS[to]}" (in ${top.sessionCount} sessies).`
              );
            }

            // Category balance
            const activatiePct = Math.round((analytics.globalCategoryDist.activatie / analytics.totalDetections) * 100);
            const bewegingPct = Math.round((analytics.globalCategoryDist.beweging / analytics.totalDetections) * 100);
            if (activatiePct > 70) {
              parts.push('Het systeem bevindt zich overwegend in activatie-staten. Meer aandacht voor regulatie-strategieën kan helpen.');
            } else if (bewegingPct > 30) {
              parts.push('Er is een gezonde aanwezigheid van bewegings-staten, wat wijst op effectieve regulatie.');
            }

            return parts.join(' ');
          })()}
        </p>
      </div>
    </div>

      {/* ─── CLIENT PROGRESS REPORT OVERLAY ─── */}
      {showReport && (
        <ClientProgressReport
          sessions={sessions}
          allRecords={allRecords}
          sessionAnalyses={sessionAnalyses}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
};

export default CrossSessionPatterns;
