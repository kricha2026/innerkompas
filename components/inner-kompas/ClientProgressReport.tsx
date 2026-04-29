import React, { useState, useMemo, useRef } from 'react';
import {
  CompassState,
  COMPASS_STATE_LABELS,
  COMPASS_STATE_DESCRIPTIONS,
  BODY_AREA_LABELS,
  BodyArea,
} from '@/lib/types';
import { DbSessionCoach } from './CoachSessionDetail';

// ─── Types ───

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

const CATEGORY_LABELS: Record<CompassCategory, string> = {
  activatie: 'Activatie',
  zoek: 'Zoek',
  beweging: 'Beweging',
};

const CATEGORY_COLORS_PRINT: Record<CompassCategory, { bar: string; text: string; dot: string }> = {
  activatie: { bar: '#FBBF24', text: '#B45309', dot: '#FBBF24' },
  zoek: { bar: '#38BDF8', text: '#0369A1', dot: '#38BDF8' },
  beweging: { bar: '#34D399', text: '#047857', dot: '#34D399' },
};

interface DbCompassRecord {
  id: string;
  session_id: string;
  primary_state: string;
  secondary_state: string | null;
  confidence: number;
  detected_at: string;
  source: 'client' | 'ai';
}

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
}

interface ClientProgressReportProps {
  sessions: DbSessionCoach[];
  allRecords: DbCompassRecord[];
  sessionAnalyses: SessionAnalysis[];
  onClose: () => void;
}

const ClientProgressReport: React.FC<ClientProgressReportProps> = ({
  sessions,
  allRecords,
  sessionAnalyses,
  onClose,
}) => {
  const [coachSummary, setCoachSummary] = useState('');
  const [clientName, setClientName] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  // ─── Date range ───
  const dateRange = useMemo(() => {
    if (sessions.length === 0) return { from: '', to: '' };
    const sorted = [...sessions].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    const from = new Date(sorted[0].started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const to = new Date(sorted[sorted.length - 1].started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    return { from, to };
  }, [sessions]);

  // ─── Emotion frequency over time ───
  const emotionTimeline = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    return sorted.map(s => ({
      date: new Date(s.started_at),
      dateLabel: new Date(s.started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      emotions: s.emotion_words || [],
    }));
  }, [sessions]);

  // ─── Global emotion frequency ───
  const globalEmotionFreq = useMemo(() => {
    const freq: Record<string, number> = {};
    sessions.forEach(s => {
      (s.emotion_words || []).forEach(w => {
        freq[w] = (freq[w] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // ─── Compass state frequency ───
  const compassStateFreq = useMemo(() => {
    const freq: Partial<Record<CompassState, number>> = {};
    allRecords.forEach(r => {
      const state = r.primary_state as CompassState;
      freq[state] = (freq[state] || 0) + 1;
    });
    return Object.entries(freq).sort((a, b) => (b[1] as number) - (a[1] as number)) as [CompassState, number][];
  }, [allRecords]);

  // ─── Category distribution ───
  const categoryDist = useMemo(() => {
    const dist: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    allRecords.forEach(r => {
      const state = r.primary_state as CompassState;
      if (COMPASS_STATE_CATEGORY[state]) {
        dist[COMPASS_STATE_CATEGORY[state]]++;
      }
    });
    return dist;
  }, [allRecords]);

  const totalDetections = allRecords.length;

  // ─── Release/integration trend ───
  const releaseTrend = useMemo(() => {
    return sessionAnalyses.map(sa => ({
      date: sa.sessionDate,
      dateLabel: sa.sessionDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      reachedRelease: sa.reachedRelease,
      reachedIntegration: sa.reachedIntegration,
      recordCount: sa.records.length,
    }));
  }, [sessionAnalyses]);

  const releaseRate = sessionAnalyses.length > 0
    ? sessionAnalyses.filter(sa => sa.reachedRelease).length / sessionAnalyses.length
    : 0;
  const integrationRate = sessionAnalyses.length > 0
    ? sessionAnalyses.filter(sa => sa.reachedIntegration).length / sessionAnalyses.length
    : 0;

  // ─── Body areas frequency ───
  const bodyAreaFreq = useMemo(() => {
    const freq: Record<string, number> = {};
    sessions.forEach(s => {
      (s.body_areas || []).forEach(a => {
        freq[a] = (freq[a] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // ─── Trend direction ───
  const trendDirection = useMemo(() => {
    if (sessionAnalyses.length < 2) return { release: 'stable', integration: 'stable' };
    const halfIdx = Math.floor(sessionAnalyses.length / 2);
    const firstHalf = sessionAnalyses.slice(0, halfIdx || 1);
    const secondHalf = sessionAnalyses.slice(halfIdx || 1);
    const fhRelease = firstHalf.filter(sa => sa.reachedRelease).length / (firstHalf.length || 1);
    const shRelease = secondHalf.filter(sa => sa.reachedRelease).length / (secondHalf.length || 1);
    const fhIntegration = firstHalf.filter(sa => sa.reachedIntegration).length / (firstHalf.length || 1);
    const shIntegration = secondHalf.filter(sa => sa.reachedIntegration).length / (secondHalf.length || 1);
    return {
      release: shRelease > fhRelease ? 'improving' : shRelease < fhRelease ? 'declining' : 'stable',
      integration: shIntegration > fhIntegration ? 'improving' : shIntegration < fhIntegration ? 'declining' : 'stable',
    };
  }, [sessionAnalyses]);

  const trendLabel = (d: string) => d === 'improving' ? 'Verbeterend' : d === 'declining' ? 'Afnemend' : 'Stabiel';
  const trendColor = (d: string) => d === 'improving' ? '#059669' : d === 'declining' ? '#DC2626' : '#6B7280';

  // ─── Start vs end state shift ───
  const stateShift = useMemo(() => {
    const startCat: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    const endCat: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    sessionAnalyses.forEach(sa => {
      if (sa.startState && COMPASS_STATE_CATEGORY[sa.startState]) startCat[COMPASS_STATE_CATEGORY[sa.startState]]++;
      if (sa.endState && COMPASS_STATE_CATEGORY[sa.endState]) endCat[COMPASS_STATE_CATEGORY[sa.endState]]++;
    });
    return { startCat, endCat };
  }, [sessionAnalyses]);

  // ─── Print handler ───
  const handlePrint = () => {
    const printContent = reportRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="nl">
      <head>
        <meta charset="UTF-8" />
        <title>Voortgangsrapport${clientName ? ` — ${clientName}` : ''}</title>
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', sans-serif; color: #3A3633; background: #fff; padding: 40px; line-height: 1.5; }
          h1, h2, h3, h4 { font-family: 'Crimson Text', serif; color: #3A3633; }
          .report-header { text-align: center; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #E8D5B0; }
          .report-header h1 { font-size: 28px; margin-bottom: 4px; }
          .report-header .subtitle { font-size: 13px; color: #7A7673; }
          .report-header .meta { font-size: 11px; color: #7A7673; margin-top: 8px; }
          .section { margin-bottom: 32px; page-break-inside: avoid; }
          .section-title { font-size: 16px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #E8E2D6; display: flex; align-items: center; gap: 8px; }
          .section-title .icon { width: 18px; height: 18px; }
          .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .stat-card { padding: 12px; border: 1px solid #E8E2D6; border-radius: 10px; text-align: center; }
          .stat-card .value { font-family: 'Crimson Text', serif; font-size: 24px; color: #3A3633; }
          .stat-card .label { font-size: 10px; color: #7A7673; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
          .bar-chart { margin: 8px 0; }
          .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
          .bar-label { width: 140px; font-size: 12px; color: #3A3633; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .bar-track { flex: 1; height: 14px; background: #F5F1E8; border-radius: 7px; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 7px; transition: width 0.3s; }
          .bar-count { width: 60px; font-size: 11px; color: #7A7673; text-align: right; flex-shrink: 0; }
          .category-bar { display: flex; height: 20px; border-radius: 10px; overflow: hidden; margin: 8px 0; }
          .category-legend { display: flex; gap: 16px; margin-top: 6px; }
          .category-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #7A7673; }
          .category-dot { width: 8px; height: 8px; border-radius: 50%; }
          .trend-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
          .trend-card { padding: 16px; border: 1px solid #E8E2D6; border-radius: 10px; }
          .trend-card .rate { font-family: 'Crimson Text', serif; font-size: 32px; }
          .trend-card .detail { font-size: 11px; color: #7A7673; margin-top: 4px; }
          .trend-card .direction { font-size: 11px; font-weight: 500; margin-top: 2px; }
          .session-bars { display: flex; align-items: flex-end; gap: 4px; margin: 12px 0; padding: 8px 0; }
          .session-bar { width: 20px; border-radius: 4px 4px 0 0; min-height: 8px; }
          .session-bar-label { font-size: 8px; color: #7A7673; text-align: center; margin-top: 2px; }
          .shift-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin: 12px 0; }
          .shift-col { text-align: center; }
          .shift-col .title { font-size: 10px; color: #7A7673; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
          .shift-arrow { font-size: 18px; color: #D4AF7A; }
          .body-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
          .body-chip { padding: 6px 14px; border: 1px solid #E8E2D6; border-radius: 20px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
          .body-chip .count { font-size: 10px; color: #7A7673; }
          .coach-summary { padding: 20px; border: 1px solid #E8D5B0; border-radius: 10px; background: #FDFBF7; margin-top: 12px; }
          .coach-summary .title { font-size: 10px; color: #7A7673; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
          .coach-summary .text { font-size: 13px; line-height: 1.7; color: #3A3633; white-space: pre-wrap; }
          .emotion-timeline { margin: 12px 0; }
          .emotion-timeline-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
          .emotion-timeline-date { width: 60px; font-size: 10px; color: #7A7673; flex-shrink: 0; }
          .emotion-timeline-pills { display: flex; flex-wrap: wrap; gap: 4px; }
          .emotion-pill { padding: 2px 8px; border-radius: 10px; font-size: 10px; background: #E8D5B0; color: #3A3633; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E8E2D6; text-align: center; font-size: 10px; color: #7A7673; }
          .no-print { display: none; }
          @media print {
            body { padding: 20px; }
            .section { page-break-inside: avoid; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const formatDate = (d: Date) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 bg-anthracite/30 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="w-full max-w-4xl animate-gentle-fade">
        {/* ─── TOOLBAR (not printed) ─── */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-anthracite-soft hover:text-anthracite font-sans border border-sand-dark/20 hover:border-sand-dark/40 bg-cream transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Sluiten
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-anthracite-soft/60 font-sans">Cliëntnaam:</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Optioneel..."
                className="px-3 py-1.5 rounded-lg bg-cream border border-sand-dark/20 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 w-48"
              />
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm bg-anthracite text-sand-light hover:bg-anthracite-light transition-colors font-sans shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Afdrukken / PDF
          </button>
        </div>

        {/* ─── REPORT CONTENT ─── */}
        <div ref={reportRef} className="bg-white rounded-2xl shadow-lg p-10 print:shadow-none print:rounded-none print:p-0">
          {/* ─── HEADER ─── */}
          <div className="report-header" style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 24, borderBottom: '2px solid #E8D5B0' }}>
            <h1 style={{ fontFamily: "'Crimson Text', serif", fontSize: 28, marginBottom: 4, color: '#3A3633' }}>
              Voortgangsrapport
            </h1>
            {clientName && (
              <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 20, color: '#7A7673', marginBottom: 4 }}>
                {clientName}
              </p>
            )}
            <p style={{ fontSize: 13, color: '#7A7673' }}>
              InnerKompas — Sessie-analyse en patronen
            </p>
            <p style={{ fontSize: 11, color: '#7A7673', marginTop: 8 }}>
              Periode: {dateRange.from} — {dateRange.to} | Rapport gegenereerd: {today}
            </p>
          </div>

          {/* ─── OVERVIEW STATS ─── */}
          <div className="section" style={{ marginBottom: 32 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div style={{ padding: 12, border: '1px solid #E8E2D6', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 24, color: '#3A3633' }}>{sessions.length}</p>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>Sessies</p>
              </div>
              <div style={{ padding: 12, border: '1px solid #E8E2D6', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 24, color: '#3A3633' }}>{totalDetections}</p>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>Kompas-detecties</p>
              </div>
              <div style={{ padding: 12, border: '1px solid #E8E2D6', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 24, color: '#3A3633' }}>{globalEmotionFreq.length}</p>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>Unieke emoties</p>
              </div>
              <div style={{ padding: 12, border: '1px solid #E8E2D6', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 24, color: '#3A3633' }}>{bodyAreaFreq.length}</p>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>Lichaamsgebieden</p>
              </div>
            </div>
          </div>

          {/* ─── 1. EMOTION FREQUENCY ─── */}
          <div className="section" style={{ marginBottom: 32, pageBreakInside: 'avoid' }}>
            <h2 style={{ fontFamily: "'Crimson Text', serif", fontSize: 18, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #E8E2D6', color: '#3A3633' }}>
              1. Emotie-frequentie
            </h2>

            {/* Global frequency bars */}
            {globalEmotionFreq.length > 0 ? (
              <div style={{ margin: '8px 0' }}>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Meest voorkomende emoties (alle sessies)
                </p>
                {globalEmotionFreq.slice(0, 10).map(([word, count]) => {
                  const maxCount = globalEmotionFreq[0]?.[1] || 1;
                  const pct = ((count as number) / (maxCount as number)) * 100;
                  return (
                    <div key={word} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 140, fontSize: 12, color: '#3A3633', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{word}</span>
                      <div style={{ flex: 1, height: 14, background: '#F5F1E8', borderRadius: 7, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#D4AF7A', borderRadius: 7 }} />
                      </div>
                      <span style={{ width: 60, fontSize: 11, color: '#7A7673', textAlign: 'right', flexShrink: 0 }}>{count}x</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#7A7673' }}>Geen emoties gedetecteerd in de sessies.</p>
            )}

            {/* Emotion timeline per session */}
            {emotionTimeline.filter(e => e.emotions.length > 0).length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Emoties per sessie (chronologisch)
                </p>
                {emotionTimeline.filter(e => e.emotions.length > 0).map((entry, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 60, fontSize: 10, color: '#7A7673', flexShrink: 0 }}>{entry.dateLabel}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {entry.emotions.slice(0, 8).map((e, i) => (
                        <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, background: '#E8D5B0', color: '#3A3633' }}>{e}</span>
                      ))}
                      {entry.emotions.length > 8 && (
                        <span style={{ fontSize: 10, color: '#7A7673' }}>+{entry.emotions.length - 8}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── 2. COMPASS STATES ─── */}
          <div className="section" style={{ marginBottom: 32, pageBreakInside: 'avoid' }}>
            <h2 style={{ fontFamily: "'Crimson Text', serif", fontSize: 18, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #E8E2D6', color: '#3A3633' }}>
              2. Kompas-staten
            </h2>

            {totalDetections > 0 ? (
              <>
                {/* Category distribution bar */}
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Categorie-verdeling
                </p>
                <div style={{ display: 'flex', height: 20, borderRadius: 10, overflow: 'hidden', margin: '8px 0' }}>
                  {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                    const count = categoryDist[cat];
                    const pct = (count / totalDetections) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={cat}
                        style={{ width: `${pct}%`, background: CATEGORY_COLORS_PRINT[cat].bar, position: 'relative' }}
                      >
                        {pct > 12 && (
                          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 500 }}>
                            {Math.round(pct)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                    const count = categoryDist[cat];
                    if (count === 0) return null;
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: CATEGORY_COLORS_PRINT[cat].text }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS_PRINT[cat].dot }} />
                        {CATEGORY_LABELS[cat]}: {count}x ({Math.round((count / totalDetections) * 100)}%)
                      </div>
                    );
                  })}
                </div>

                {/* State frequency bars */}
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Meest voorkomende staten
                  </p>
                  {compassStateFreq.slice(0, 8).map(([state, count]) => {
                    const pct = (count / totalDetections) * 100;
                    const cat = COMPASS_STATE_CATEGORY[state];
                    return (
                      <div key={state} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS_PRINT[cat].dot, flexShrink: 0 }} />
                        <span style={{ width: 180, fontSize: 12, color: '#3A3633', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={COMPASS_STATE_DESCRIPTIONS[state]}>
                          {COMPASS_STATE_LABELS[state]}
                        </span>
                        <div style={{ flex: 1, height: 14, background: '#F5F1E8', borderRadius: 7, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: CATEGORY_COLORS_PRINT[cat].bar, borderRadius: 7 }} />
                        </div>
                        <span style={{ width: 70, fontSize: 11, color: '#7A7673', textAlign: 'right', flexShrink: 0 }}>
                          {count}x ({Math.round(pct)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Start vs end category shift */}
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Categorie-verschuiving: begin vs. einde van sessies
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', margin: '12px 0' }}>
                    {/* Start */}
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Begin</p>
                      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#F5F1E8' }}>
                        {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                          const count = stateShift.startCat[cat];
                          const total = Object.values(stateShift.startCat).reduce((a, b) => a + b, 0);
                          const pct = total > 0 ? (count / total) * 100 : 0;
                          if (pct === 0) return null;
                          return <div key={cat} style={{ width: `${pct}%`, background: CATEGORY_COLORS_PRINT[cat].bar }} />;
                        })}
                      </div>
                    </div>
                    {/* Arrow */}
                    <div style={{ fontSize: 18, color: '#D4AF7A' }}>&#8594;</div>
                    {/* End */}
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Einde</p>
                      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#F5F1E8' }}>
                        {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                          const count = stateShift.endCat[cat];
                          const total = Object.values(stateShift.endCat).reduce((a, b) => a + b, 0);
                          const pct = total > 0 ? (count / total) * 100 : 0;
                          if (pct === 0) return null;
                          return <div key={cat} style={{ width: `${pct}%`, background: CATEGORY_COLORS_PRINT[cat].bar }} />;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: '#7A7673' }}>Geen kompas-staat data beschikbaar.</p>
            )}
          </div>

          {/* ─── 3. RELEASE / INTEGRATION TREND ─── */}
          <div className="section" style={{ marginBottom: 32, pageBreakInside: 'avoid' }}>
            <h2 style={{ fontFamily: "'Crimson Text', serif", fontSize: 18, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #E8E2D6', color: '#3A3633' }}>
              3. Release &amp; integratie trend
            </h2>

            {sessionAnalyses.length > 0 ? (
              <>
                {/* Rate cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: 16, border: '1px solid #E8E2D6', borderRadius: 10 }}>
                    <p style={{ fontSize: 11, color: '#7A7673' }}>Release bereikt</p>
                    <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 32, color: releaseRate > 0 ? '#059669' : '#7A7673' }}>
                      {Math.round(releaseRate * 100)}%
                    </p>
                    <p style={{ fontSize: 11, color: '#7A7673', marginTop: 4 }}>
                      {sessionAnalyses.filter(sa => sa.reachedRelease).length} van {sessionAnalyses.length} sessies
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: trendColor(trendDirection.release) }}>
                      {trendLabel(trendDirection.release)}
                    </p>
                  </div>
                  <div style={{ padding: 16, border: '1px solid #E8E2D6', borderRadius: 10 }}>
                    <p style={{ fontSize: 11, color: '#7A7673' }}>Integratie bereikt</p>
                    <p style={{ fontFamily: "'Crimson Text', serif", fontSize: 32, color: integrationRate > 0 ? '#059669' : '#7A7673' }}>
                      {Math.round(integrationRate * 100)}%
                    </p>
                    <p style={{ fontSize: 11, color: '#7A7673', marginTop: 4 }}>
                      {sessionAnalyses.filter(sa => sa.reachedIntegration).length} van {sessionAnalyses.length} sessies
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: trendColor(trendDirection.integration) }}>
                      {trendLabel(trendDirection.integration)}
                    </p>
                  </div>
                </div>

                {/* Session-by-session bars */}
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Per sessie
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, margin: '12px 0', padding: '8px 0' }}>
                  {releaseTrend.map((entry, idx) => {
                    const maxRecords = Math.max(...releaseTrend.map(e => e.recordCount), 1);
                    const barHeight = Math.max(10, (entry.recordCount / maxRecords) * 60);
                    const barColor = entry.reachedIntegration ? '#34D399' : entry.reachedRelease ? '#6EE7B7' : '#E8E2D6';
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 20, height: barHeight, borderRadius: '4px 4px 0 0', background: barColor }} />
                        {(idx === 0 || idx === releaseTrend.length - 1 || idx % Math.max(1, Math.floor(releaseTrend.length / 6)) === 0) && (
                          <span style={{ fontSize: 8, color: '#7A7673', marginTop: 2 }}>{entry.dateLabel}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#7A7673' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#6EE7B7' }} /> Release
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#7A7673' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#34D399' }} /> Integratie
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#7A7673' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#E8E2D6' }} /> Geen van beide
                  </div>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: '#7A7673' }}>Onvoldoende sessiedata voor trendanalyse.</p>
            )}
          </div>

          {/* ─── 4. BODY AREAS ─── */}
          <div className="section" style={{ marginBottom: 32, pageBreakInside: 'avoid' }}>
            <h2 style={{ fontFamily: "'Crimson Text', serif", fontSize: 18, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #E8E2D6', color: '#3A3633' }}>
              4. Lichaamsgebieden
            </h2>

            {bodyAreaFreq.length > 0 ? (
              <>
                {/* Body area chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
                  {bodyAreaFreq.map(([area, count]) => (
                    <div key={area} style={{ padding: '6px 14px', border: '1px solid #E8E2D6', borderRadius: 20, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(BODY_AREA_LABELS as any)[area] || area}
                      <span style={{ fontSize: 10, color: '#7A7673' }}>{count}x</span>
                    </div>
                  ))}
                </div>

                {/* Body area bars */}
                <div style={{ marginTop: 12 }}>
                  {bodyAreaFreq.map(([area, count]) => {
                    const maxCount = bodyAreaFreq[0]?.[1] || 1;
                    const pct = ((count as number) / (maxCount as number)) * 100;
                    return (
                      <div key={area} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 100, fontSize: 12, color: '#3A3633', flexShrink: 0 }}>
                          {(BODY_AREA_LABELS as any)[area] || area}
                        </span>
                        <div style={{ flex: 1, height: 14, background: '#F5F1E8', borderRadius: 7, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#7A7673', borderRadius: 7, opacity: 0.5 }} />
                        </div>
                        <span style={{ width: 40, fontSize: 11, color: '#7A7673', textAlign: 'right', flexShrink: 0 }}>{count}x</span>
                      </div>
                    );
                  })}
                </div>

                {/* Body area per session timeline */}
                {sessions.filter(s => (s.body_areas || []).length > 0).length > 1 && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                      Lichaamsgebieden per sessie
                    </p>
                    {[...sessions]
                      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
                      .filter(s => (s.body_areas || []).length > 0)
                      .map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 60, fontSize: 10, color: '#7A7673', flexShrink: 0 }}>
                            {new Date(s.started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(s.body_areas || []).map((a, i) => (
                              <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, background: '#E8E2D6', color: '#3A3633' }}>
                                {(BODY_AREA_LABELS as any)[a] || a}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, color: '#7A7673' }}>Geen lichaamsgebieden geregistreerd.</p>
            )}
          </div>

          {/* ─── 5. COACH SUMMARY ─── */}
          <div className="section" style={{ marginBottom: 32, pageBreakInside: 'avoid' }}>
            <h2 style={{ fontFamily: "'Crimson Text', serif", fontSize: 18, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #E8E2D6', color: '#3A3633' }}>
              5. Coach-samenvatting
            </h2>

            {/* Editable textarea (visible in app, hidden in print if empty) */}
            <div className="no-print print:hidden">
              <textarea
                value={coachSummary}
                onChange={(e) => setCoachSummary(e.target.value)}
                placeholder="Schrijf hier je samenvatting, observaties en aanbevelingen voor de cliënt...

Suggesties:
• Wat valt op in het emotionele patroon?
• Hoe ontwikkelt het regulatievermogen zich?
• Welke lichaamsgebieden vragen aandacht?
• Welke kompas-staten zijn dominant en wat betekent dat?
• Wat zijn de volgende stappen?"
                className="w-full h-48 px-5 py-4 rounded-xl bg-cream border border-sand-dark/20 text-sm text-anthracite font-sans leading-relaxed placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 resize-y"
              />
              <p className="text-[10px] text-anthracite-soft/40 font-sans mt-1.5">
                Deze samenvatting wordt meegenomen in het afgedrukte rapport.
              </p>
            </div>

            {/* Printed version of the summary */}
            {coachSummary ? (
              <div style={{ padding: 20, border: '1px solid #E8D5B0', borderRadius: 10, background: '#FDFBF7', marginTop: 12 }}>
                <p style={{ fontSize: 10, color: '#7A7673', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Observaties en aanbevelingen
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: '#3A3633', whiteSpace: 'pre-wrap' }}>
                  {coachSummary}
                </p>
              </div>
            ) : (
              <div className="hidden" style={{ padding: 20, border: '1px dashed #E8E2D6', borderRadius: 10, marginTop: 12 }}>
                <p style={{ fontSize: 12, color: '#7A7673', fontStyle: 'italic' }}>
                  Geen coach-samenvatting toegevoegd.
                </p>
              </div>
            )}
          </div>

          {/* ─── FOOTER ─── */}
          <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #E8E2D6', textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#7A7673' }}>
              InnerKompas Voortgangsrapport — Vertrouwelijk document — {today}
            </p>
            <p style={{ fontSize: 9, color: '#7A7673', marginTop: 4 }}>
              Dit rapport is gegenereerd op basis van {sessions.length} sessies met {totalDetections} kompas-staat detecties.
              Alle gegevens worden vertrouwelijk behandeld conform de privacyrichtlijnen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientProgressReport;
