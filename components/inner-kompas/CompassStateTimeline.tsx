import React, { useState, useMemo } from 'react';
import {
  CompassState,
  CompassStateDetection,
  COMPASS_STATE_LABELS,
  COMPASS_STATE_DESCRIPTIONS,
} from '@/lib/types';

// ─── Category mapping ───
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

const CATEGORY_STYLES: Record<CompassCategory, {
  dot: string;
  dotBorder: string;
  line: string;
  bg: string;
  text: string;
  label: string;
  badgeBg: string;
  badgeText: string;
}> = {
  activatie: {
    dot: 'bg-amber-400',
    dotBorder: 'border-amber-200',
    line: 'bg-amber-300/50',
    bg: 'bg-amber-50/60',
    text: 'text-amber-700',
    label: 'Activatie-staat (1-7)',
    badgeBg: 'bg-amber-100/70',
    badgeText: 'text-amber-700',
  },
  zoek: {
    dot: 'bg-sky-400',
    dotBorder: 'border-sky-200',
    line: 'bg-sky-300/50',
    bg: 'bg-sky-50/60',
    text: 'text-sky-700',
    label: 'Zoek-staat (8-10)',
    badgeBg: 'bg-sky-100/70',
    badgeText: 'text-sky-700',
  },
  beweging: {
    dot: 'bg-emerald-400',
    dotBorder: 'border-emerald-200',
    line: 'bg-emerald-300/50',
    bg: 'bg-emerald-50/60',
    text: 'text-emerald-700',
    label: 'Bewegings-staat (11-12)',
    badgeBg: 'bg-emerald-100/70',
    badgeText: 'text-emerald-700',
  },
};

const CATEGORY_LABELS_NL: Record<CompassCategory, string> = {
  activatie: 'Activatie',
  zoek: 'Zoek',
  beweging: 'Beweging',
};

// ─── Props ───
interface CompassStateTimelineProps {
  compassStateHistory: CompassStateDetection[];
  reachedRelease: boolean;
  reachedIntegration: boolean;
  currentCompassState?: CompassState | null;
  currentSecondaryCompassState?: CompassState | null;
}

const CompassStateTimeline: React.FC<CompassStateTimelineProps> = ({
  compassStateHistory,
  reachedRelease,
  reachedIntegration,
  currentCompassState,
  currentSecondaryCompassState,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showFullSummary, setShowFullSummary] = useState(false);

  // ─── Computed data ───
  const summary = useMemo(() => {
    // State frequency
    const stateFreq: Partial<Record<CompassState, number>> = {};
    compassStateHistory.forEach(d => {
      if (d.primary) {
        stateFreq[d.primary] = (stateFreq[d.primary] || 0) + 1;
      }
    });

    // Sort by frequency
    const sortedStates = Object.entries(stateFreq)
      .sort((a, b) => b[1] - a[1]) as [CompassState, number][];

    // Category distribution
    const categoryFreq: Record<CompassCategory, number> = { activatie: 0, zoek: 0, beweging: 0 };
    compassStateHistory.forEach(d => {
      if (d.primary) {
        const cat = COMPASS_STATE_CATEGORY[d.primary];
        categoryFreq[cat] = (categoryFreq[cat] || 0) + 1;
      }
    });

    // Most common transitions (consecutive primary states)
    const transitions: Record<string, number> = {};
    for (let i = 1; i < compassStateHistory.length; i++) {
      const from = compassStateHistory[i - 1].primary;
      const to = compassStateHistory[i].primary;
      if (from && to && from !== to) {
        const key = `${from}→${to}`;
        transitions[key] = (transitions[key] || 0) + 1;
      }
    }
    const sortedTransitions = Object.entries(transitions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Average confidence
    const confidences = compassStateHistory.filter(d => d.primary).map(d => d.confidence);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    return {
      sortedStates,
      categoryFreq,
      sortedTransitions,
      avgConfidence,
      totalDetections: compassStateHistory.filter(d => d.primary).length,
    };
  }, [compassStateHistory]);

  if (compassStateHistory.length === 0 && !currentCompassState) {
    return null;
  }

  const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getCategory = (state: CompassState): CompassCategory => COMPASS_STATE_CATEGORY[state];
  const getStyle = (state: CompassState) => CATEGORY_STYLES[getCategory(state)];

  // Line color between two dots: use the "to" dot's category color
  const getLineColor = (fromIdx: number, toIdx: number): string => {
    const toState = compassStateHistory[toIdx]?.primary;
    if (!toState) return 'bg-sand-dark/20';
    return getStyle(toState).line;
  };

  return (
    <div className="space-y-4">
      {/* ─── SECTION HEADER ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <h3 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider">
            Kompas-staat verloop
          </h3>
        </div>
        {/* Category legend */}
        <div className="flex items-center gap-3">
          {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => (
            <div key={cat} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${CATEGORY_STYLES[cat].dot}`} />
              <span className="text-[10px] text-anthracite-soft/40 font-sans">{CATEGORY_LABELS_NL[cat]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── TIMELINE ─── */}
      {compassStateHistory.length > 0 && (
        <div className="relative">
          {/* Scrollable container for many data points */}
          <div className="overflow-x-auto pb-2 -mx-1 px-1">
            <div className="flex items-center gap-0 min-w-fit py-6 px-2">
              {compassStateHistory.map((detection, idx) => {
                if (!detection.primary) return null;
                const style = getStyle(detection.primary);
                const isHovered = hoveredIndex === idx;
                const isLast = idx === compassStateHistory.length - 1;
                const secondaryStyle = detection.secondary ? getStyle(detection.secondary) : null;

                return (
                  <React.Fragment key={idx}>
                    {/* Dot + tooltip */}
                    <div
                      className="relative flex-shrink-0"
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {/* Dot */}
                      <div
                        className={`
                          w-4 h-4 rounded-full border-2 cursor-pointer
                          transition-all duration-200
                          ${style.dot} ${style.dotBorder}
                          ${isHovered ? 'scale-150 shadow-md z-20' : 'hover:scale-125'}
                          ${isLast ? 'ring-2 ring-offset-1 ring-offset-cream ring-gold-light/40' : ''}
                        `}
                      />

                      {/* Secondary state indicator (small ring) */}
                      {detection.secondary && (
                        <div
                          className={`
                            absolute -bottom-1 -right-1 w-2 h-2 rounded-full border
                            ${secondaryStyle!.dot} border-cream
                          `}
                        />
                      )}

                      {/* Confidence indicator (opacity ring) */}
                      {detection.confidence < 0.6 && (
                        <div className="absolute inset-0 rounded-full border border-dashed border-anthracite-soft/20" />
                      )}

                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 animate-gentle-fade">
                          <div className="bg-anthracite text-sand-light rounded-xl px-4 py-3 shadow-lg min-w-[220px] max-w-[280px]">
                            {/* Arrow */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                              <div className="w-2.5 h-2.5 bg-anthracite rotate-45 -translate-y-1.5" />
                            </div>

                            {/* Timestamp */}
                            <p className="text-[10px] text-sand-light/50 font-sans mb-1.5">
                              {formatTime(detection.timestamp)}
                            </p>

                            {/* Primary state */}
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                              <span className="text-sm font-sans font-medium text-sand-light">
                                {COMPASS_STATE_LABELS[detection.primary]}
                              </span>
                            </div>
                            <p className="text-[11px] text-sand-light/60 font-sans leading-relaxed mb-2">
                              {COMPASS_STATE_DESCRIPTIONS[detection.primary]}
                            </p>

                            {/* Secondary state */}
                            {detection.secondary && (
                              <div className="pt-1.5 border-t border-sand-light/10">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <div className={`w-2 h-2 rounded-full ${secondaryStyle!.dot}`} />
                                  <span className="text-xs font-sans text-sand-light/70">
                                    Secundair: {COMPASS_STATE_LABELS[detection.secondary]}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Confidence */}
                            <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-sand-light/10">
                              <span className="text-[10px] text-sand-light/40 font-sans">Confidence:</span>
                              <div className="flex-1 h-1.5 bg-sand-light/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${style.dot}`}
                                  style={{ width: `${Math.round(detection.confidence * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-sand-light/50 font-sans">
                                {Math.round(detection.confidence * 100)}%
                              </span>
                            </div>

                            {/* Category label */}
                            <p className="text-[10px] text-sand-light/30 font-sans mt-1.5">
                              {CATEGORY_STYLES[getCategory(detection.primary)].label}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Connecting line */}
                    {idx < compassStateHistory.length - 1 && (
                      <div className={`h-0.5 flex-shrink-0 rounded-full transition-colors duration-300 ${getLineColor(idx, idx + 1)}`}
                        style={{ width: compassStateHistory.length > 12 ? '16px' : '28px' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Timeline labels (first and last) */}
          {compassStateHistory.length >= 2 && (
            <div className="flex justify-between px-2 -mt-1">
              <span className="text-[10px] text-anthracite-soft/30 font-sans">
                {formatTime(compassStateHistory[0].timestamp)}
              </span>
              <span className="text-[10px] text-anthracite-soft/30 font-sans">
                {formatTime(compassStateHistory[compassStateHistory.length - 1].timestamp)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── CURRENT STATE INDICATOR ─── */}
      {currentCompassState && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/15">
          <div className={`w-3 h-3 rounded-full ${getStyle(currentCompassState).dot} animate-slow-pulse`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-sans font-medium text-anthracite">
                {COMPASS_STATE_LABELS[currentCompassState]}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans ${getStyle(currentCompassState).badgeBg} ${getStyle(currentCompassState).badgeText}`}>
                {CATEGORY_LABELS_NL[getCategory(currentCompassState)]}
              </span>
            </div>
            {currentSecondaryCompassState && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${getStyle(currentSecondaryCompassState).dot}`} />
                <span className="text-[10px] text-anthracite-soft/50 font-sans">
                  Secundair: {COMPASS_STATE_LABELS[currentSecondaryCompassState]}
                </span>
              </div>
            )}
          </div>
          <span className="text-[10px] text-anthracite-soft/30 font-sans">nu</span>
        </div>
      )}

      {/* ─── SUMMARY ─── */}
      {summary.totalDetections > 0 && (
        <div className="space-y-3">
          {/* Quick stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl bg-cream/60 border border-sand-dark/10 text-center">
              <p className="text-lg font-serif text-anthracite">{summary.totalDetections}</p>
              <p className="text-[10px] text-anthracite-soft/50 font-sans">Detecties</p>
            </div>
            <div className="p-2.5 rounded-xl bg-cream/60 border border-sand-dark/10 text-center">
              <p className="text-lg font-serif text-anthracite">{Math.round(summary.avgConfidence * 100)}%</p>
              <p className="text-[10px] text-anthracite-soft/50 font-sans">Gem. confidence</p>
            </div>
            <div className={`p-2.5 rounded-xl border text-center ${reachedRelease ? 'bg-emerald-50/60 border-emerald-200/40' : 'bg-cream/60 border-sand-dark/10'}`}>
              <p className={`text-lg font-serif ${reachedRelease ? 'text-emerald-600' : 'text-anthracite-soft/30'}`}>
                {reachedRelease ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block text-emerald-500">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block text-anthracite-soft/20">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </p>
              <p className="text-[10px] text-anthracite-soft/50 font-sans">Release bereikt</p>
            </div>
            <div className={`p-2.5 rounded-xl border text-center ${reachedIntegration ? 'bg-emerald-50/60 border-emerald-200/40' : 'bg-cream/60 border-sand-dark/10'}`}>
              <p className={`text-lg font-serif ${reachedIntegration ? 'text-emerald-600' : 'text-anthracite-soft/30'}`}>
                {reachedIntegration ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block text-emerald-500">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block text-anthracite-soft/20">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </p>
              <p className="text-[10px] text-anthracite-soft/50 font-sans">Integratie bereikt</p>
            </div>
          </div>

          {/* Category distribution bar */}
          {summary.totalDetections > 0 && (
            <div>
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Categorie-verdeling</p>
              <div className="flex h-3 rounded-full overflow-hidden bg-sand-dark/8">
                {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                  const count = summary.categoryFreq[cat];
                  const pct = (count / summary.totalDetections) * 100;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={cat}
                      className={`${CATEGORY_STYLES[cat].dot} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                      title={`${CATEGORY_LABELS_NL[cat]}: ${count}x (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                {(['activatie', 'zoek', 'beweging'] as CompassCategory[]).map(cat => {
                  const count = summary.categoryFreq[cat];
                  if (count === 0) return <span key={cat} />;
                  return (
                    <span key={cat} className={`text-[10px] font-sans ${CATEGORY_STYLES[cat].text}`}>
                      {CATEGORY_LABELS_NL[cat]}: {count}x
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expandable detailed summary */}
          <button
            onClick={() => setShowFullSummary(!showFullSummary)}
            className="flex items-center gap-1.5 text-[11px] text-anthracite-soft/40 hover:text-anthracite-soft/60 font-sans transition-colors"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform duration-200 ${showFullSummary ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {showFullSummary ? 'Minder details' : 'Meer details'}
          </button>

          {showFullSummary && (
            <div className="space-y-4 animate-gentle-fade">
              {/* State frequency breakdown */}
              <div>
                <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Staat-frequentie</p>
                <div className="space-y-1.5">
                  {summary.sortedStates.map(([state, count]) => {
                    const style = getStyle(state);
                    const pct = (count / summary.totalDetections) * 100;
                    return (
                      <div key={state} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                        <span className="text-xs text-anthracite font-sans w-40 truncate">
                          {COMPASS_STATE_LABELS[state]}
                        </span>
                        <div className="flex-1 h-2 bg-sand-dark/8 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${style.dot} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-anthracite-soft/40 font-sans w-8 text-right">{count}x</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Most common transitions */}
              {summary.sortedTransitions.length > 0 && (
                <div>
                  <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Meest voorkomende transities</p>
                  <div className="space-y-1.5">
                    {summary.sortedTransitions.map(([key, count]) => {
                      const [fromKey, toKey] = key.split('→') as [CompassState, CompassState];
                      const fromStyle = getStyle(fromKey);
                      const toStyle = getStyle(toKey);
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs font-sans">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${fromStyle.dot}`} />
                            <span className="text-anthracite truncate">{COMPASS_STATE_LABELS[fromKey]}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30 flex-shrink-0">
                              <line x1="5" y1="12" x2="19" y2="12" />
                              <polyline points="12 5 19 12 12 19" />
                            </svg>
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${toStyle.dot}`} />
                            <span className="text-anthracite truncate">{COMPASS_STATE_LABELS[toKey]}</span>
                          </div>
                          <span className="text-anthracite-soft/40 flex-shrink-0">{count}x</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Regulation journey insight */}
              <div className="p-3 rounded-xl bg-cream/60 border border-sand-dark/10">
                <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">Regulatie-reis inzicht</p>
                <p className="text-xs text-anthracite-soft/70 font-sans leading-relaxed">
                  {reachedIntegration && reachedRelease ? (
                    'De gebruiker heeft zowel loslating als integratie bereikt in deze sessie. Dit wijst op een succesvol regulatieproces.'
                  ) : reachedRelease ? (
                    'De gebruiker heeft loslating/beweging bereikt. Er is verschuiving, maar volledige integratie is nog niet bereikt.'
                  ) : reachedIntegration ? (
                    'De gebruiker heeft integratie bereikt — reflectie en patroonherkenning zijn actief.'
                  ) : summary.categoryFreq.activatie > summary.categoryFreq.zoek + summary.categoryFreq.beweging ? (
                    'De sessie bevindt zich voornamelijk in activatie-staten. Het systeem is nog geactiveerd en zoekt regulatie.'
                  ) : summary.categoryFreq.zoek > 0 ? (
                    'De gebruiker beweegt richting zoek-staten — het systeem zoekt begrip, inzicht of betekenis.'
                  ) : (
                    'De kompas-staat detectie is gestart. Meer data is nodig voor een duidelijk patroon.'
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompassStateTimeline;
