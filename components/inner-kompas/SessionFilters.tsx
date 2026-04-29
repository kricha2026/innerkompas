import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { BODY_AREA_LABELS } from '@/lib/types';

// ─── Types ───
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
  user_notes: string | null;
  custom_tags: string[];
}


type QuickFilter =
  | { type: 'crisis' }
  | { type: 'completed' }
  | { type: 'emotion'; value: string }
  | { type: 'body_area'; value: string }
  | { type: 'phase'; value: string }
  | { type: 'tag'; value: string };

const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
};

interface SessionFiltersProps {
  sessions: DbSession[];
  onFilteredChange: (filtered: DbSession[]) => void;
  externalTagFilter?: string | null;
  onExternalTagFilterHandled?: () => void;
  onActiveTagsChange?: (tags: string[]) => void;
}

const SessionFilters: React.FC<SessionFiltersProps> = ({ sessions, onFilteredChange, externalTagFilter, onExternalTagFilterHandled, onActiveTagsChange }) => {

  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuickFilters, setActiveQuickFilters] = useState<QuickFilter[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);


  // ─── Compute top emotions, body areas, and tags for quick filter chips ───
  const { topEmotions, topBodyAreas, availablePhases, allTags, hasCrisis, hasCompleted } = useMemo(() => {
    const emotionFreq: Record<string, number> = {};
    const bodyFreq: Record<string, number> = {};
    const tagFreq: Record<string, number> = {};
    const phaseSet = new Set<string>();
    let crisisCount = 0;
    let completedCount = 0;

    sessions.forEach(s => {
      (s.emotion_words || []).forEach(w => { emotionFreq[w] = (emotionFreq[w] || 0) + 1; });
      (s.body_areas || []).forEach(a => { bodyFreq[a] = (bodyFreq[a] || 0) + 1; });
      (s.phases || []).forEach(p => phaseSet.add(p));
      (s.custom_tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; });
      if (s.crisis_detected) crisisCount++;
      if (s.ended_at) completedCount++;
    });

    return {
      topEmotions: Object.entries(emotionFreq).sort((a, b) => b[1] - a[1]).slice(0, 6),
      topBodyAreas: Object.entries(bodyFreq).sort((a, b) => b[1] - a[1]).slice(0, 4),
      availablePhases: Array.from(phaseSet),
      allTags: Object.entries(tagFreq).sort((a, b) => b[1] - a[1]),
      hasCrisis: crisisCount > 0,
      hasCompleted: completedCount > 0,
    };
  }, [sessions]);

  // ─── Filter logic ───
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s => {
        const emotionMatch = (s.emotion_words || []).some(w => w.toLowerCase().includes(q));
        const bodyMatch = (s.body_areas || []).some(a => {
          const label = (BODY_AREA_LABELS as any)[a] || a;
          return a.toLowerCase().includes(q) || label.toLowerCase().includes(q);
        });
        const phaseMatch = (s.phases || []).some(p => {
          const label = PHASE_LABELS[p] || p;
          return p.toLowerCase().includes(q) || label.toLowerCase().includes(q);
        });
        const summaryMatch = s.summary?.toLowerCase().includes(q) || false;
        const notesMatch = s.user_notes?.toLowerCase().includes(q) || false;
        const tagMatch = (s.custom_tags || []).some(t => t.toLowerCase().includes(q));
        const dateMatch = new Date(s.started_at).toLocaleDateString('nl-NL', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).toLowerCase().includes(q);
        return emotionMatch || bodyMatch || phaseMatch || summaryMatch || notesMatch || tagMatch || dateMatch;
      });
    }


    // Quick filters (OR within same type, AND across types)
    if (activeQuickFilters.length > 0) {
      const crisisFilter = activeQuickFilters.some(f => f.type === 'crisis');
      const completedFilter = activeQuickFilters.some(f => f.type === 'completed');
      const emotionFilters = activeQuickFilters.filter(f => f.type === 'emotion').map(f => (f as any).value);
      const bodyFilters = activeQuickFilters.filter(f => f.type === 'body_area').map(f => (f as any).value);
      const phaseFilters = activeQuickFilters.filter(f => f.type === 'phase').map(f => (f as any).value);
      const tagFilters = activeQuickFilters.filter(f => f.type === 'tag').map(f => (f as any).value);

      result = result.filter(s => {
        if (crisisFilter && !s.crisis_detected) return false;
        if (completedFilter && !s.ended_at) return false;
        if (emotionFilters.length > 0 && !emotionFilters.some(e => (s.emotion_words || []).includes(e))) return false;
        if (bodyFilters.length > 0 && !bodyFilters.some(b => (s.body_areas || []).includes(b))) return false;
        if (phaseFilters.length > 0 && !phaseFilters.some(p => (s.phases || []).includes(p))) return false;
        if (tagFilters.length > 0 && !tagFilters.some(t => (s.custom_tags || []).includes(t))) return false;
        return true;
      });
    }

    // Phase filter from advanced section
    if (selectedPhases.length > 0) {
      result = result.filter(s =>
        selectedPhases.some(p => (s.phases || []).includes(p))
      );
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter(s => new Date(s.started_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(s => new Date(s.started_at) <= to);
    }

    return result;
  }, [sessions, searchQuery, activeQuickFilters, dateFrom, dateTo, selectedPhases]);

  // Notify parent of filtered results
  useEffect(() => {
    onFilteredChange(filteredSessions);
  }, [filteredSessions, onFilteredChange]);

  // ─── Quick filter toggle ───
  const toggleQuickFilter = useCallback((filter: QuickFilter) => {
    setActiveQuickFilters(prev => {
      const exists = prev.some(f => {
        if (f.type !== filter.type) return false;
        if (f.type === 'crisis' || f.type === 'completed') return true;
        return (f as any).value === (filter as any).value;
      });
      if (exists) {
        return prev.filter(f => {
          if (f.type !== filter.type) return true;
          if (f.type === 'crisis' || f.type === 'completed') return false;
          return (f as any).value !== (filter as any).value;
        });
      }
      return [...prev, filter];
    });
  }, []);

  const isQuickFilterActive = useCallback((filter: QuickFilter): boolean => {
    return activeQuickFilters.some(f => {
      if (f.type !== filter.type) return false;
      if (f.type === 'crisis' || f.type === 'completed') return true;
      return (f as any).value === (filter as any).value;
    });
  }, [activeQuickFilters]);

  // ─── Clear all filters ───
  const clearAllFilters = () => {
    setSearchQuery('');
    setActiveQuickFilters([]);
    setDateFrom('');
    setDateTo('');
    setSelectedPhases([]);
  };

  const hasActiveFilters = searchQuery.trim() || activeQuickFilters.length > 0 || dateFrom || dateTo || selectedPhases.length > 0;

  // ─── Keyboard shortcut: focus search with / ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        if (searchQuery) setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  // ─── Handle external tag filter from TagStatistics ───
  useEffect(() => {
    if (externalTagFilter) {
      toggleQuickFilter({ type: 'tag', value: externalTagFilter });
      onExternalTagFilterHandled?.();
    }
  }, [externalTagFilter]);

  // ─── Notify parent of active tag filters ───
  useEffect(() => {
    const activeTags = activeQuickFilters
      .filter(f => f.type === 'tag')
      .map(f => (f as any).value as string);
    onActiveTagsChange?.(activeTags);
  }, [activeQuickFilters, onActiveTagsChange]);


  return (
    <div className="mb-8 space-y-4">
      {/* ─── Search bar ─── */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Zoek op emotie, lichaam, fase, tag, datum, samenvatting..."
          className="w-full pl-11 pr-20 py-3 rounded-2xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/35 focus:outline-none focus:border-gold-light/50 focus:bg-cream transition-all duration-200"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 rounded-full hover:bg-sand-dark/15 transition-colors"
              title="Wis zoekopdracht"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <span className="text-[10px] text-anthracite-soft/25 font-sans bg-sand-dark/10 px-1.5 py-0.5 rounded hidden sm:inline-block">/</span>
        </div>
      </div>

      {/* ─── Quick filter chips ─── */}
      <div className="flex flex-wrap gap-2">
        {/* Status chips */}
        {hasCrisis && (
          <FilterChip
            label="Met crisis"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            }
            active={isQuickFilterActive({ type: 'crisis' })}
            onClick={() => toggleQuickFilter({ type: 'crisis' })}
            variant="danger"
          />
        )}
        {hasCompleted && (
          <FilterChip
            label="Voltooid"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            active={isQuickFilterActive({ type: 'completed' })}
            onClick={() => toggleQuickFilter({ type: 'completed' })}
            variant="success"
          />
        )}

        {/* Divider if status chips exist */}
        {(hasCrisis || hasCompleted) && (topEmotions.length > 0 || topBodyAreas.length > 0 || allTags.length > 0) && (
          <div className="w-px h-6 bg-sand-dark/15 self-center mx-0.5" />
        )}

        {/* ─── Tag filter chips ─── */}
        {allTags.map(([tag, count]) => (
          <FilterChip
            key={`tag-${tag}`}
            label={tag}
            count={count}
            icon={
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            }
            active={isQuickFilterActive({ type: 'tag', value: tag })}
            onClick={() => toggleQuickFilter({ type: 'tag', value: tag })}
            variant="tag"
          />
        ))}

        {/* Divider between tags and emotions */}
        {allTags.length > 0 && topEmotions.length > 0 && (
          <div className="w-px h-6 bg-sand-dark/15 self-center mx-0.5" />
        )}

        {/* Top emotion chips */}
        {topEmotions.map(([emotion]) => (
          <FilterChip
            key={`emotion-${emotion}`}
            label={emotion}
            active={isQuickFilterActive({ type: 'emotion', value: emotion })}
            onClick={() => toggleQuickFilter({ type: 'emotion', value: emotion })}
            variant="emotion"
          />
        ))}

        {/* Divider */}
        {topEmotions.length > 0 && topBodyAreas.length > 0 && (
          <div className="w-px h-6 bg-sand-dark/15 self-center mx-0.5" />
        )}

        {/* Top body area chips */}
        {topBodyAreas.map(([area]) => (
          <FilterChip
            key={`body-${area}`}
            label={(BODY_AREA_LABELS as any)[area] || area}
            active={isQuickFilterActive({ type: 'body_area', value: area })}
            onClick={() => toggleQuickFilter({ type: 'body_area', value: area })}
            variant="body"
          />
        ))}

        {/* Divider */}
        {topBodyAreas.length > 0 && availablePhases.length > 0 && (
          <div className="w-px h-6 bg-sand-dark/15 self-center mx-0.5" />
        )}

        {/* Phase chips */}
        {availablePhases.map(phase => (
          <FilterChip
            key={`phase-${phase}`}
            label={PHASE_LABELS[phase] || phase}
            active={isQuickFilterActive({ type: 'phase', value: phase })}
            onClick={() => toggleQuickFilter({ type: 'phase', value: phase })}
            variant="phase"
          />
        ))}
      </div>

      {/* ─── Advanced filters toggle ─── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          {showAdvanced ? 'Minder filters' : 'Datumfilter'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Active filter count + clear */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-anthracite-soft/40 font-sans">
              {filteredSessions.length} van {sessions.length} sessie{sessions.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={clearAllFilters}
              className="text-xs text-gold-muted hover:text-anthracite font-sans underline underline-offset-2 transition-colors"
            >
              Wis filters
            </button>
          </div>
        )}
      </div>

      {/* ─── Advanced filter panel (date range) ─── */}
      {showAdvanced && (
        <div className="p-4 rounded-2xl bg-cream/60 border border-sand-dark/15 animate-gentle-fade">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                Vanaf datum
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-warm-white border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                Tot datum
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-warm-white border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50 transition-colors"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="mt-3 text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans underline underline-offset-2 transition-colors"
            >
              Datumfilter wissen
            </button>
          )}
        </div>
      )}

      {/* ─── No results message ─── */}
      {hasActiveFilters && filteredSessions.length === 0 && (
        <div className="text-center py-8 rounded-2xl bg-cream/40 border border-sand-dark/10">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-anthracite-soft/25">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <p className="text-sm text-anthracite-soft/50 font-sans">
            Geen sessies gevonden voor deze filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="mt-2 text-xs text-gold-muted hover:text-anthracite font-sans underline underline-offset-2 transition-colors"
          >
            Alle filters wissen
          </button>
        </div>
      )}
    </div>
  );
};

// ─── FilterChip component ───
interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  variant: 'danger' | 'success' | 'emotion' | 'body' | 'phase' | 'tag';
  icon?: React.ReactNode;
  count?: number;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, active, onClick, variant, icon, count }) => {
  const baseClasses = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-sans transition-all duration-200 cursor-pointer select-none border';

  const variantClasses: Record<string, { active: string; inactive: string }> = {
    danger: {
      active: 'bg-red-100/60 border-red-300/40 text-red-700',
      inactive: 'bg-warm-white border-red-200/25 text-red-500/60 hover:border-red-300/40 hover:text-red-600',
    },
    success: {
      active: 'bg-emerald-100/60 border-emerald-300/40 text-emerald-700',
      inactive: 'bg-warm-white border-emerald-200/25 text-emerald-500/60 hover:border-emerald-300/40 hover:text-emerald-600',
    },
    emotion: {
      active: 'bg-gold-light/40 border-gold/30 text-anthracite',
      inactive: 'bg-warm-white border-gold-light/20 text-anthracite-soft/60 hover:border-gold-light/40 hover:text-anthracite-soft',
    },
    body: {
      active: 'bg-sand-dark/20 border-sand-dark/30 text-anthracite',
      inactive: 'bg-warm-white border-sand-dark/15 text-anthracite-soft/50 hover:border-sand-dark/25 hover:text-anthracite-soft',
    },
    phase: {
      active: 'bg-anthracite/10 border-anthracite/20 text-anthracite',
      inactive: 'bg-warm-white border-anthracite/10 text-anthracite-soft/50 hover:border-anthracite/15 hover:text-anthracite-soft',
    },
    tag: {
      active: 'bg-violet-100/60 border-violet-300/40 text-violet-800',
      inactive: 'bg-warm-white border-violet-200/25 text-violet-600/60 hover:border-violet-300/40 hover:text-violet-700',
    },
  };

  const classes = active ? variantClasses[variant].active : variantClasses[variant].inactive;

  return (
    <button onClick={onClick} className={`${baseClasses} ${classes}`}>
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {label}
      {count !== undefined && count > 1 && (
        <span className="text-[10px] opacity-50">{count}x</span>
      )}
      {active && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </button>
  );
};

export default SessionFilters;
