import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { openTagReport, downloadTagReportAsText, type TagReportData } from '@/lib/generateTagReport';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  loadAutoReportSettings, checkAutoReportConditions, saveAutoReport,
  type AutoReportCheckResult,
} from '@/lib/autoReportManager';

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

type ViewMode = 'cloud' | 'bars' | 'timeline';

interface TagStatisticsProps {
  sessions: DbSession[];
  onTagClick: (tag: string) => void;
  activeFilterTags?: string[];
}

// ─── Tag icon SVG (reusable) ───
const TagIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

// ─── Color palette for timeline lines ───
const TAG_COLORS = [
  { stroke: '#8b5cf6', fill: '#8b5cf6', name: 'violet' },    // violet-500
  { stroke: '#6366f1', fill: '#6366f1', name: 'indigo' },     // indigo-500
  { stroke: '#d946ef', fill: '#d946ef', name: 'fuchsia' },    // fuchsia-500
  { stroke: '#f43f5e', fill: '#f43f5e', name: 'rose' },       // rose-500
  { stroke: '#f59e0b', fill: '#f59e0b', name: 'amber' },      // amber-500
  { stroke: '#10b981', fill: '#10b981', name: 'emerald' },     // emerald-500
  { stroke: '#06b6d4', fill: '#06b6d4', name: 'cyan' },       // cyan-500
  { stroke: '#3b82f6', fill: '#3b82f6', name: 'blue' },       // blue-500
  { stroke: '#a855f7', fill: '#a855f7', name: 'purple' },     // purple-500
  { stroke: '#ec4899', fill: '#ec4899', name: 'pink' },       // pink-500
];

// ─── Month parsing utilities ───
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

function parseMonthKey(key: string): Date {
  // key format: "jan. '25" or "mrt. '26" etc.
  const parts = key.replace(/\./g, '').replace(/'/g, '').trim().split(/\s+/);
  if (parts.length >= 2) {
    const monthStr = parts[0].toLowerCase();
    const yearStr = parts[1];
    const monthIdx = MONTH_MAP[monthStr] ?? 0;
    const year = 2000 + parseInt(yearStr, 10);
    return new Date(year, monthIdx, 1);
  }
  return new Date(0);
}

function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => parseMonthKey(a).getTime() - parseMonthKey(b).getTime());
}

// ─── Smooth path helper (Catmull-Rom to Bezier) ───
function smoothLine(points: { x: number; y: number }[], tension = 0.3): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }

  let path = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return path;
}

// ─── Smooth area path (for fill under line) ───
function smoothArea(points: { x: number; y: number }[], baseY: number, tension = 0.3): string {
  if (points.length < 2) return '';
  const linePath = smoothLine(points, tension);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${linePath} L${lastPoint.x},${baseY} L${firstPoint.x},${baseY} Z`;
}


const TagStatistics: React.FC<TagStatisticsProps> = ({ sessions, onTagClick, activeFilterTags = [] }) => {
  const { user, isAuthenticated } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('cloud');
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);

  // Timeline-specific state
  const [selectedTimelineTags, setSelectedTimelineTags] = useState<string[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<{ tag: string; month: string; count: number; x: number; y: number } | null>(null);
  const [timelineShowAll, setTimelineShowAll] = useState(false);

  // ─── Download rapport state ───
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  // ─── Auto-report state ───
  const [autoReportNotification, setAutoReportNotification] = useState<{
    reason: 'frequency' | 'milestone';
    milestoneCount?: number;
  } | null>(null);
  const autoReportCheckedRef = useRef(false);

  // Close download menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDownloadMenu]);

  // Clear download success message after 3 seconds
  useEffect(() => {
    if (downloadSuccess) {
      const timer = setTimeout(() => setDownloadSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [downloadSuccess]);

  // Clear auto-report notification after 8 seconds
  useEffect(() => {
    if (autoReportNotification) {
      const timer = setTimeout(() => setAutoReportNotification(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [autoReportNotification]);




  // ─── Compute tag frequency ───
  const tagFrequency = useMemo(() => {
    const freq: Record<string, number> = {};
    sessions.forEach(s => {
      (s.custom_tags || []).forEach(t => {
        freq[t] = (freq[t] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const maxFreq = tagFrequency.length > 0 ? tagFrequency[0][1] : 1;
  const totalTagUsages = tagFrequency.reduce((sum, [, count]) => sum + count, 0);

  // ─── Compute co-occurrence pairs ───
  const coOccurrence = useMemo(() => {
    const pairCounts: Record<string, number> = {};
    const pairSessions: Record<string, string[]> = {};

    sessions.forEach(s => {
      const tags = s.custom_tags || [];
      if (tags.length < 2) return;

      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const pair = [tags[i], tags[j]].sort().join(' + ');
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
          if (!pairSessions[pair]) pairSessions[pair] = [];
          pairSessions[pair].push(s.id);
        }
      }
    });

    return Object.entries(pairCounts)
      .map(([pair, count]) => ({
        pair,
        tags: pair.split(' + '),
        count,
        sessionIds: pairSessions[pair] || [],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [sessions]);

  // ─── Compute tag timeline (month -> tag -> count) ───
  const { tagTimeline, sortedMonths, allTimelineTags } = useMemo(() => {
    const timeline: Record<string, Record<string, number>> = {};
    const monthSet = new Set<string>();

    sessions.forEach(s => {
      const month = new Date(s.started_at).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' });
      monthSet.add(month);
      (s.custom_tags || []).forEach(t => {
        if (!timeline[t]) timeline[t] = {};
        timeline[t][month] = (timeline[t][month] || 0) + 1;
      });
    });

    const sorted = sortMonthKeys(Array.from(monthSet));
    const allTags = Object.keys(timeline).sort((a, b) => {
      const totalA = Object.values(timeline[a]).reduce((s, v) => s + v, 0);
      const totalB = Object.values(timeline[b]).reduce((s, v) => s + v, 0);
      return totalB - totalA;
    });

    return { tagTimeline: timeline, sortedMonths: sorted, allTimelineTags: allTags };
  }, [sessions]);

  // ─── Compute trend data for each tag ───
  const tagTrends = useMemo(() => {
    if (sortedMonths.length < 2) return {};

    const trends: Record<string, { direction: 'up' | 'down' | 'stable'; change: number; recentCount: number; earlierCount: number }> = {};

    const midpoint = Math.floor(sortedMonths.length / 2);
    const earlierMonths = sortedMonths.slice(0, midpoint);
    const recentMonths = sortedMonths.slice(midpoint);

    allTimelineTags.forEach(tag => {
      const data = tagTimeline[tag] || {};
      const earlierCount = earlierMonths.reduce((sum, m) => sum + (data[m] || 0), 0);
      const recentCount = recentMonths.reduce((sum, m) => sum + (data[m] || 0), 0);

      const earlierAvg = earlierMonths.length > 0 ? earlierCount / earlierMonths.length : 0;
      const recentAvg = recentMonths.length > 0 ? recentCount / recentMonths.length : 0;

      const change = recentAvg - earlierAvg;
      const direction = change > 0.3 ? 'up' : change < -0.3 ? 'down' : 'stable';

      trends[tag] = { direction, change, recentCount, earlierCount };
    });

    return trends;
  }, [tagTimeline, sortedMonths, allTimelineTags]);

  // ─── Auto-select top tags when switching to timeline ───
  const initTimelineTags = useCallback(() => {
    if (selectedTimelineTags.length === 0 && allTimelineTags.length > 0) {
      setSelectedTimelineTags(allTimelineTags.slice(0, Math.min(3, allTimelineTags.length)));
    }
  }, [selectedTimelineTags.length, allTimelineTags]);

  // ─── Toggle tag in timeline selection ───
  const toggleTimelineTag = useCallback((tag: string) => {
    setSelectedTimelineTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      }
      if (prev.length >= 8) return prev; // Max 8 tags
      return [...prev, tag];
    });
  }, []);

  // ─── Get color for a tag based on its index in selection ───
  const getTagColor = useCallback((tag: string): typeof TAG_COLORS[0] => {
    const idx = selectedTimelineTags.indexOf(tag);
    return TAG_COLORS[idx >= 0 ? idx % TAG_COLORS.length : 0];
  }, [selectedTimelineTags]);

  // ─── Sessions with tags stats ───
  const sessionsWithTags = sessions.filter(s => (s.custom_tags || []).length > 0).length;
  const avgTagsPerSession = sessionsWithTags > 0
    ? (totalTagUsages / sessionsWithTags).toFixed(1)
    : '0';

  // ─── Rising / falling tags insight ───
  const trendInsights = useMemo(() => {
    const rising = allTimelineTags.filter(t => tagTrends[t]?.direction === 'up');
    const falling = allTimelineTags.filter(t => tagTrends[t]?.direction === 'down');
    return { rising, falling };
  }, [allTimelineTags, tagTrends]);

  // ─── Collect report data ───
  const collectReportData = useCallback((): TagReportData => {
    return {
      uniqueTagCount: tagFrequency.length,
      totalTagUsages,
      avgTagsPerSession,
      sessionsWithTags,
      totalSessions: sessions.length,
      tagFrequency: tagFrequency as Array<[string, number]>,
      coOccurrence: coOccurrence.map(({ pair, tags, count }) => ({ pair, tags, count })),
      sortedMonths,
      tagTimeline,
      tagTrends,
      risingTags: trendInsights.rising,
      fallingTags: trendInsights.falling,
    };
  }, [tagFrequency, totalTagUsages, avgTagsPerSession, sessionsWithTags, sessions.length, coOccurrence, sortedMonths, tagTimeline, tagTrends, trendInsights]);

  // ─── Download handlers ───
  const handleDownloadPDF = useCallback(() => {
    const data = collectReportData();
    openTagReport(data);
    setShowDownloadMenu(false);
    setDownloadSuccess('pdf');
  }, [collectReportData]);

  const handleDownloadText = useCallback(() => {
    const data = collectReportData();
    downloadTagReportAsText(data);
    setShowDownloadMenu(false);
    setDownloadSuccess('text');
  }, [collectReportData]);

  // ─── Auto-report check on session load ───
  // NOTE: This useEffect MUST be placed after collectReportData is defined
  // to avoid "Cannot access before initialization" TDZ errors in production builds.
  useEffect(() => {
    if (!user || !isAuthenticated || autoReportCheckedRef.current || sessions.length < 3) return;
    autoReportCheckedRef.current = true;

    (async () => {
      try {
        const settings = await loadAutoReportSettings(user.id);
        const result = checkAutoReportConditions(settings, sessions.length);
        if (result.shouldGenerate && result.reason) {
          const data = collectReportData();
          const saved = await saveAutoReport(user.id, data, result.reason, result.milestoneCount, sessions.length);
          if (saved.success) {
            setAutoReportNotification({ reason: result.reason, milestoneCount: result.milestoneCount });
          }
        }
      } catch (e) {
        console.error('Auto-report check failed:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAuthenticated, sessions.length, collectReportData]);


  // Don't render if no tags exist
  if (tagFrequency.length === 0) return null;



  // ─── Cloud size calculation ───
  const getCloudSize = (count: number): { fontSize: string; padding: string; fontWeight: string } => {
    const ratio = count / maxFreq;
    if (ratio >= 0.8) return { fontSize: 'text-xl', padding: 'px-4 py-2', fontWeight: 'font-semibold' };
    if (ratio >= 0.6) return { fontSize: 'text-lg', padding: 'px-3.5 py-1.5', fontWeight: 'font-medium' };
    if (ratio >= 0.4) return { fontSize: 'text-base', padding: 'px-3 py-1.5', fontWeight: 'font-medium' };
    if (ratio >= 0.2) return { fontSize: 'text-sm', padding: 'px-2.5 py-1', fontWeight: 'font-normal' };
    return { fontSize: 'text-xs', padding: 'px-2 py-1', fontWeight: 'font-normal' };
  };

  const getCloudOpacity = (count: number): string => {
    const ratio = count / maxFreq;
    if (ratio >= 0.7) return 'opacity-100';
    if (ratio >= 0.4) return 'opacity-85';
    return 'opacity-70';
  };

  const getStrengthDots = (count: number, maxCount: number) => {
    const ratio = count / maxCount;
    const filled = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    return Array.from({ length: 4 }, (_, i) => (
      <div
        key={i}
        className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
          i < filled ? 'bg-violet-400' : 'bg-sand-dark/15'
        }`}
      />
    ));
  };

  // ─── Timeline chart dimensions ───
  const chartWidth = 600;
  const chartHeight = 260;
  const padding = { top: 28, right: 24, bottom: 44, left: 40 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;

  // ─── Compute chart data for selected tags ───
  const computeChartData = () => {
    if (sortedMonths.length === 0 || selectedTimelineTags.length === 0) return null;

    // Find max value across all selected tags
    let maxVal = 0;
    selectedTimelineTags.forEach(tag => {
      const data = tagTimeline[tag] || {};
      sortedMonths.forEach(m => {
        const val = data[m] || 0;
        if (val > maxVal) maxVal = val;
      });
    });
    if (maxVal === 0) maxVal = 1;

    // Compute points for each tag
    const tagLines: Record<string, { x: number; y: number; month: string; count: number }[]> = {};

    selectedTimelineTags.forEach(tag => {
      const data = tagTimeline[tag] || {};
      tagLines[tag] = sortedMonths.map((month, i) => {
        const count = data[month] || 0;
        const x = padding.left + (sortedMonths.length > 1 ? (i / (sortedMonths.length - 1)) * plotW : plotW / 2);
        const y = padding.top + plotH - (count / maxVal) * plotH;
        return { x, y, month, count };
      });
    });

    return { tagLines, maxVal };
  };

  // ─── Y-axis grid lines ───
  const getYGridLines = (maxVal: number) => {
    const steps = maxVal <= 3 ? maxVal : maxVal <= 6 ? Math.ceil(maxVal / 2) : 4;
    const lines = [];
    for (let i = 0; i <= steps; i++) {
      const val = Math.round((maxVal / steps) * i);
      const y = padding.top + plotH - (val / maxVal) * plotH;
      lines.push({ y, val });
    }
    return lines;
  };

  // ─── Trend arrow SVG ───
  const TrendArrow: React.FC<{ direction: 'up' | 'down' | 'stable'; size?: number }> = ({ direction, size = 12 }) => {
    if (direction === 'up') {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      );
    }
    if (direction === 'down') {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  };


  return (
    <div className="mb-10 rounded-2xl bg-cream/60 border border-violet-200/20 overflow-hidden transition-all duration-300">
      {/* ─── Header ─── */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-5 flex items-center justify-between hover:bg-cream/80 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100/60 border border-violet-200/30 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600/70">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div>
            <h3 className="font-serif text-lg text-anthracite">Tag-statistieken</h3>
            <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">
              {tagFrequency.length} unieke tag{tagFrequency.length !== 1 ? 's' : ''} over {sessionsWithTags} sessie{sessionsWithTags !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] text-anthracite-soft/40 font-sans bg-violet-100/30 px-2 py-0.5 rounded-full">
              gem. {avgTagsPerSession} tags/sessie
            </span>
            {coOccurrence.length > 0 && (
              <span className="text-[10px] text-anthracite-soft/40 font-sans bg-violet-100/30 px-2 py-0.5 rounded-full">
                {coOccurrence.length} combinatie{coOccurrence.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-anthracite-soft/40 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* ─── Expanded content ─── */}
      {isExpanded && (
        <div className="px-5 pb-5 animate-gentle-fade">
          {/* ─── View mode toggle ─── */}
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-sand-dark/10">
            <div className="flex items-center gap-1 bg-sand-dark/8 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('cloud')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all duration-200 ${
                  viewMode === 'cloud'
                    ? 'bg-warm-white text-anthracite shadow-sm'
                    : 'text-anthracite-soft/50 hover:text-anthracite-soft'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                </svg>
                Tagwolk
              </button>
              <button
                onClick={() => setViewMode('bars')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all duration-200 ${
                  viewMode === 'bars'
                    ? 'bg-warm-white text-anthracite shadow-sm'
                    : 'text-anthracite-soft/50 hover:text-anthracite-soft'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Staafdiagram
              </button>
              <button
                onClick={() => {
                  setViewMode('timeline');
                  initTimelineTags();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all duration-200 ${
                  viewMode === 'timeline'
                    ? 'bg-warm-white text-anthracite shadow-sm'
                    : 'text-anthracite-soft/50 hover:text-anthracite-soft'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Tijdlijn
              </button>
            </div>
            <span className="text-[10px] text-anthracite-soft/30 font-sans hidden sm:block">
              {viewMode === 'timeline' ? 'Selecteer tags om trends te volgen' : 'Klik op een tag om te filteren'}
            </span>
          </div>

          {/* ─── Tag Cloud View ─── */}
          {viewMode === 'cloud' && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 py-4 px-2 min-h-[100px]">
              {tagFrequency.map(([tag, count]) => {
                const size = getCloudSize(count);
                const opacity = getCloudOpacity(count);
                const isActive = activeFilterTags.includes(tag);
                const isHovered = hoveredTag === tag;

                return (
                  <button
                    key={tag}
                    onClick={() => onTagClick(tag)}
                    onMouseEnter={() => setHoveredTag(tag)}
                    onMouseLeave={() => setHoveredTag(null)}
                    className={`
                      inline-flex items-center gap-1.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none
                      ${size.fontSize} ${size.padding} ${size.fontWeight} ${opacity}
                      ${isActive
                        ? 'bg-violet-200/70 border-violet-400/50 text-violet-900 shadow-sm'
                        : isHovered
                          ? 'bg-violet-100/60 border-violet-300/40 text-violet-800 shadow-sm scale-105'
                          : 'bg-violet-50/40 border-violet-200/25 text-violet-700/80 hover:bg-violet-100/50'
                      }
                    `}
                    title={`${tag}: ${count}x gebruikt — Klik om te filteren`}
                  >
                    <TagIcon size={size.fontSize === 'text-xl' ? 14 : size.fontSize === 'text-lg' ? 13 : size.fontSize === 'text-base' ? 12 : 10} className="flex-shrink-0 opacity-60" />
                    {tag}
                    {(isHovered || isActive) && (
                      <span className="text-[10px] opacity-60 font-normal ml-0.5">
                        {count}x
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Bar Chart View ─── */}
          {viewMode === 'bars' && (
            <div className="space-y-2.5 py-2">
              {tagFrequency.map(([tag, count]) => {
                const percentage = (count / maxFreq) * 100;
                const isActive = activeFilterTags.includes(tag);
                const isHovered = hoveredTag === tag;
                const sessionPercentage = Math.round((count / sessions.length) * 100);

                return (
                  <button
                    key={tag}
                    onClick={() => onTagClick(tag)}
                    onMouseEnter={() => setHoveredTag(tag)}
                    onMouseLeave={() => setHoveredTag(null)}
                    className={`w-full text-left group transition-all duration-200 rounded-lg px-2 py-1.5 -mx-2 ${
                      isActive ? 'bg-violet-50/60' : isHovered ? 'bg-violet-50/30' : ''
                    }`}
                    title={`${tag}: ${count}x gebruikt in ${sessionPercentage}% van sessies — Klik om te filteren`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                        <TagIcon size={10} className={`flex-shrink-0 transition-colors duration-200 ${isActive ? 'text-violet-600' : 'text-violet-400/50'}`} />
                        <span className={`text-sm font-sans truncate transition-colors duration-200 ${
                          isActive ? 'text-violet-800 font-medium' : 'text-anthracite-soft/80 group-hover:text-anthracite'
                        }`}>
                          {tag}
                        </span>
                      </div>
                      <div className="flex-1 h-7 bg-sand-dark/8 rounded-lg overflow-hidden relative">
                        <div
                          className={`h-full rounded-lg transition-all duration-500 ease-out flex items-center ${
                            isActive
                              ? 'bg-violet-400/50'
                              : isHovered
                                ? 'bg-violet-300/40'
                                : 'bg-violet-200/35'
                          }`}
                          style={{ width: `${Math.max(percentage, 8)}%` }}
                        >
                          {percentage > 30 && (
                            <span className="text-[10px] text-violet-800/60 font-sans ml-2.5 font-medium">
                              {count}x
                            </span>
                          )}
                        </div>
                        {percentage <= 30 && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-anthracite-soft/40 font-sans">
                            {count}x
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-anthracite-soft/35 font-sans w-10 text-right flex-shrink-0">
                        {sessionPercentage}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Timeline Chart View ─── */}
          {viewMode === 'timeline' && (
            <div className="py-2 animate-gentle-fade">
              {sortedMonths.length < 2 ? (
                <div className="text-center py-10">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-violet-300/50">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <p className="text-sm text-anthracite-soft/50 font-sans">
                    Nog niet genoeg data voor een tijdlijn.
                  </p>
                  <p className="text-xs text-anthracite-soft/30 font-sans mt-1">
                    Sessies over meerdere maanden zijn nodig om trends te tonen.
                  </p>
                </div>
              ) : (
                <>
                  {/* ─── Tag selection pills ─── */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider">
                        Tags selecteren
                      </span>
                      <span className="text-[10px] text-anthracite-soft/25 font-sans">
                        ({selectedTimelineTags.length}/8)
                      </span>
                      {selectedTimelineTags.length > 0 && (
                        <button
                          onClick={() => setSelectedTimelineTags([])}
                          className="text-[10px] text-violet-500/50 hover:text-violet-600 font-sans ml-auto transition-colors"
                        >
                          Wis selectie
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(timelineShowAll ? allTimelineTags : allTimelineTags.slice(0, 12)).map((tag) => {
                        const isSelected = selectedTimelineTags.includes(tag);
                        const color = isSelected ? getTagColor(tag) : null;
                        const trend = tagTrends[tag];

                        return (
                          <button
                            key={tag}
                            onClick={() => toggleTimelineTag(tag)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-sans border transition-all duration-200 select-none ${
                              isSelected
                                ? 'border-current shadow-sm font-medium'
                                : 'bg-warm-white border-sand-dark/15 text-anthracite-soft/60 hover:border-violet-200/40 hover:text-anthracite-soft'
                            }`}
                            style={isSelected ? {
                              backgroundColor: `${color!.fill}15`,
                              borderColor: `${color!.stroke}50`,
                              color: color!.stroke,
                            } : undefined}
                          >
                            {isSelected && (
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color!.fill }}
                              />
                            )}
                            {tag}
                            {trend && trend.direction !== 'stable' && (
                              <TrendArrow direction={trend.direction} size={10} />
                            )}
                          </button>
                        );
                      })}
                      {!timelineShowAll && allTimelineTags.length > 12 && (
                        <button
                          onClick={() => setTimelineShowAll(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-sans border border-dashed border-sand-dark/20 text-anthracite-soft/40 hover:text-anthracite-soft/60 hover:border-sand-dark/30 transition-colors"
                        >
                          +{allTimelineTags.length - 12} meer
                        </button>
                      )}
                      {timelineShowAll && allTimelineTags.length > 12 && (
                        <button
                          onClick={() => setTimelineShowAll(false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-sans border border-dashed border-sand-dark/20 text-anthracite-soft/40 hover:text-anthracite-soft/60 hover:border-sand-dark/30 transition-colors"
                        >
                          Minder tonen
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ─── SVG Chart ─── */}
                  {selectedTimelineTags.length === 0 ? (
                    <div className="text-center py-8 rounded-xl bg-sand-dark/5 border border-dashed border-sand-dark/15">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-violet-300/40">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      <p className="text-xs text-anthracite-soft/40 font-sans">
                        Selecteer tags hierboven om trends te bekijken
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <svg
                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                        className="w-full h-auto"
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <defs>
                          {selectedTimelineTags.map((tag) => {
                            const color = getTagColor(tag);
                            return (
                              <linearGradient key={`grad-${tag}`} id={`area-grad-${tag.replace(/\s/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color.fill} stopOpacity="0.25" />
                                <stop offset="100%" stopColor={color.fill} stopOpacity="0.02" />
                              </linearGradient>
                            );
                          })}
                        </defs>

                        {/* Y-axis grid lines */}
                        {(() => {
                          const chartData = computeChartData();
                          if (!chartData) return null;
                          const gridLines = getYGridLines(chartData.maxVal);
                          return gridLines.map((line, i) => (
                            <g key={`grid-${i}`}>
                              <line
                                x1={padding.left}
                                y1={line.y}
                                x2={padding.left + plotW}
                                y2={line.y}
                                stroke="var(--sand-dark)"
                                strokeWidth="0.5"
                                opacity="0.3"
                              />
                              <text
                                x={padding.left - 8}
                                y={line.y + 3.5}
                                textAnchor="end"
                                fontSize="9"
                                fill="var(--anthracite-soft)"
                                opacity="0.4"
                                fontFamily="Inter, sans-serif"
                              >
                                {line.val}
                              </text>
                            </g>
                          ));
                        })()}

                        {/* X-axis month labels */}
                        {sortedMonths.map((month, i) => {
                          const x = padding.left + (sortedMonths.length > 1 ? (i / (sortedMonths.length - 1)) * plotW : plotW / 2);
                          // Show every label if <= 8 months, otherwise show every other
                          const showLabel = sortedMonths.length <= 8 || i % Math.ceil(sortedMonths.length / 8) === 0 || i === sortedMonths.length - 1;
                          return (
                            <g key={`x-${i}`}>
                              {/* Vertical grid line */}
                              <line
                                x1={x}
                                y1={padding.top}
                                x2={x}
                                y2={padding.top + plotH}
                                stroke="var(--sand-dark)"
                                strokeWidth="0.3"
                                opacity="0.2"
                              />
                              {showLabel && (
                                <text
                                  x={x}
                                  y={padding.top + plotH + 18}
                                  textAnchor="middle"
                                  fontSize="9"
                                  fill="var(--anthracite-soft)"
                                  opacity="0.5"
                                  fontFamily="Inter, sans-serif"
                                >
                                  {month}
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {/* Area fills (render first, behind lines) */}
                        {(() => {
                          const chartData = computeChartData();
                          if (!chartData) return null;
                          return selectedTimelineTags.map((tag) => {
                            const points = chartData.tagLines[tag];
                            if (!points || points.length < 2) return null;
                            const areaPath = smoothArea(points, padding.top + plotH);
                            return (
                              <path
                                key={`area-${tag}`}
                                d={areaPath}
                                fill={`url(#area-grad-${tag.replace(/\s/g, '-')})`}
                                className="transition-opacity duration-300"
                                opacity={hoveredPoint && hoveredPoint.tag !== tag ? 0.3 : 1}
                              />
                            );
                          });
                        })()}


                        {/* Lines */}
                        {(() => {
                          const chartData = computeChartData();
                          if (!chartData) return null;
                          return selectedTimelineTags.map((tag) => {
                            const points = chartData.tagLines[tag];
                            if (!points || points.length < 2) return null;
                            const color = getTagColor(tag);
                            const linePath = smoothLine(points);
                            return (
                              <path
                                key={`line-${tag}`}
                                d={linePath}
                                fill="none"
                                stroke={color.stroke}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="transition-opacity duration-300"
                                opacity={hoveredPoint && hoveredPoint.tag !== tag ? 0.25 : 1}
                              />
                            );
                          });
                        })()}

                        {/* Data points */}
                        {(() => {
                          const chartData = computeChartData();
                          if (!chartData) return null;
                          return selectedTimelineTags.map((tag) => {
                            const points = chartData.tagLines[tag];
                            if (!points) return null;
                            const color = getTagColor(tag);
                            return points.map((pt, i) => {
                              const isHovered = hoveredPoint?.tag === tag && hoveredPoint?.month === pt.month;
                              return (
                                <g key={`pt-${tag}-${i}`}>
                                  {/* Invisible larger hit area */}
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r="12"
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoveredPoint({ tag, month: pt.month, count: pt.count, x: pt.x, y: pt.y })}
                                  />
                                  {/* Visible dot */}
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r={isHovered ? 5 : pt.count > 0 ? 3.5 : 2}
                                    fill={pt.count > 0 ? color.fill : 'transparent'}
                                    stroke={pt.count > 0 ? color.stroke : color.stroke}
                                    strokeWidth={pt.count > 0 ? 0 : 1}
                                    strokeDasharray={pt.count > 0 ? undefined : '2,2'}
                                    className="transition-all duration-200"
                                    opacity={hoveredPoint && hoveredPoint.tag !== tag ? 0.25 : (pt.count > 0 ? 0.9 : 0.3)}
                                  />
                                  {/* Outer ring on hover */}
                                  {isHovered && (
                                    <circle
                                      cx={pt.x}
                                      cy={pt.y}
                                      r="8"
                                      fill="none"
                                      stroke={color.stroke}
                                      strokeWidth="1.5"
                                      opacity="0.3"
                                    />
                                  )}
                                </g>
                              );
                            });
                          });
                        })()}

                        {/* Y-axis label */}
                        <text
                          x={12}
                          y={padding.top + plotH / 2}
                          textAnchor="middle"
                          fontSize="8"
                          fill="var(--anthracite-soft)"
                          opacity="0.35"
                          fontFamily="Inter, sans-serif"
                          transform={`rotate(-90, 12, ${padding.top + plotH / 2})`}
                        >
                          Aantal
                        </text>
                      </svg>

                      {/* ─── Hover tooltip ─── */}
                      {hoveredPoint && (
                        <div
                          className="absolute pointer-events-none z-10 animate-gentle-fade"
                          style={{
                            left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                            top: `${(hoveredPoint.y / chartHeight) * 100}%`,
                            transform: `translate(${hoveredPoint.x > chartWidth * 0.7 ? '-110%' : '10%'}, -120%)`,
                          }}
                        >
                          <div className="bg-anthracite/90 text-warm-white px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getTagColor(hoveredPoint.tag).fill }}
                              />
                              <span className="text-xs font-medium font-sans">{hoveredPoint.tag}</span>
                            </div>
                            <div className="text-[10px] opacity-70 font-sans">
                              {hoveredPoint.month}: <span className="font-medium text-warm-white">{hoveredPoint.count}x</span> gebruikt
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Legend row ─── */}
                  {selectedTimelineTags.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-sand-dark/8">
                      {selectedTimelineTags.map(tag => {
                        const color = getTagColor(tag);
                        return (
                          <div key={tag} className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: color.fill }} />
                            <span className="text-[10px] text-anthracite-soft/60 font-sans">{tag}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ─── Trend Insights ─── */}
                  {(trendInsights.rising.length > 0 || trendInsights.falling.length > 0) && (
                    <div className="mt-5 pt-4 border-t border-sand-dark/10">
                      <div className="flex items-center gap-2 mb-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/50">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                          <polyline points="17 6 23 6 23 12" />
                        </svg>
                        <h4 className="font-serif text-base text-anthracite">Trends</h4>
                        <span className="text-[10px] text-anthracite-soft/30 font-sans ml-auto hidden sm:block">
                          Vergelijking eerste helft vs. tweede helft van je sessies
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Rising tags */}
                        {trendInsights.rising.length > 0 && (
                          <div className="px-3.5 py-3 rounded-xl bg-emerald-50/40 border border-emerald-200/25">
                            <div className="flex items-center gap-1.5 mb-2">
                              <TrendArrow direction="up" size={12} />
                              <span className="text-xs text-emerald-700/70 font-sans font-medium">Stijgend</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {trendInsights.rising.slice(0, 5).map(tag => (
                                <button
                                  key={tag}
                                  onClick={() => onTagClick(tag)}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100/50 border border-emerald-200/30 text-emerald-700/80 hover:bg-emerald-100/80 transition-colors"
                                >
                                  <TagIcon size={8} className="flex-shrink-0 opacity-50" />
                                  {tag}
                                  {tagTrends[tag] && (
                                    <span className="text-[9px] opacity-50">
                                      +{tagTrends[tag].change.toFixed(1)}/mnd
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Falling tags */}
                        {trendInsights.falling.length > 0 && (
                          <div className="px-3.5 py-3 rounded-xl bg-rose-50/40 border border-rose-200/25">
                            <div className="flex items-center gap-1.5 mb-2">
                              <TrendArrow direction="down" size={12} />
                              <span className="text-xs text-rose-600/70 font-sans font-medium">Dalend</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {trendInsights.falling.slice(0, 5).map(tag => (
                                <button
                                  key={tag}
                                  onClick={() => onTagClick(tag)}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-100/50 border border-rose-200/30 text-rose-600/80 hover:bg-rose-100/80 transition-colors"
                                >
                                  <TagIcon size={8} className="flex-shrink-0 opacity-50" />
                                  {tag}
                                  {tagTrends[tag] && (
                                    <span className="text-[9px] opacity-50">
                                      {tagTrends[tag].change.toFixed(1)}/mnd
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Trend insight text */}
                      <div className="mt-3 px-3.5 py-3 rounded-xl bg-violet-50/30 border border-violet-100/30">
                        <div className="flex items-start gap-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/40 flex-shrink-0 mt-0.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                          <p className="text-xs text-anthracite-soft/60 font-sans leading-relaxed">
                            {trendInsights.rising.length > 0 && trendInsights.falling.length > 0 ? (
                              <>
                                Je besteedt recent meer aandacht aan{' '}
                                <span className="font-medium text-emerald-700/80">
                                  {trendInsights.rising.slice(0, 2).join(' en ')}
                                </span>
                                , terwijl{' '}
                                <span className="font-medium text-rose-600/80">
                                  {trendInsights.falling.slice(0, 2).join(' en ')}
                                </span>{' '}
                                minder voorkomen. Dit kan duiden op een verschuiving in je therapeutische focus.
                              </>
                            ) : trendInsights.rising.length > 0 ? (
                              <>
                                De tag{trendInsights.rising.length > 1 ? 's' : ''}{' '}
                                <span className="font-medium text-emerald-700/80">
                                  {trendInsights.rising.slice(0, 3).join(', ')}
                                </span>{' '}
                                {trendInsights.rising.length > 1 ? 'komen' : 'komt'} steeds vaker voor in je recente sessies.
                                Dit kan wijzen op een groeiend bewustzijn van {trendInsights.rising.length > 1 ? 'deze thema\'s' : 'dit thema'}.
                              </>
                            ) : (
                              <>
                                De tag{trendInsights.falling.length > 1 ? 's' : ''}{' '}
                                <span className="font-medium text-rose-600/80">
                                  {trendInsights.falling.slice(0, 3).join(', ')}
                                </span>{' '}
                                {trendInsights.falling.length > 1 ? 'komen' : 'komt'} minder vaak voor dan eerder.
                                Dit kan betekenen dat je vooruitgang boekt op {trendInsights.falling.length > 1 ? 'deze gebieden' : 'dit gebied'}.
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── Co-occurrence Patterns (shown in cloud & bars views) ─── */}
          {viewMode !== 'timeline' && coOccurrence.length > 0 && (
            <div className="mt-6 pt-5 border-t border-sand-dark/10">
              <div className="flex items-center gap-2 mb-4">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/50">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12h8" />
                  <path d="M12 8v8" />
                </svg>
                <h4 className="font-serif text-base text-anthracite">Veelvoorkomende combinaties</h4>
                <span className="text-[10px] text-anthracite-soft/30 font-sans ml-auto hidden sm:block">
                  Tags die samen voorkomen
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {coOccurrence.map(({ pair, tags, count }) => {
                  const isHovered = hoveredPair === pair;
                  const maxPairCount = coOccurrence[0]?.count || 1;

                  return (
                    <div
                      key={pair}
                      onMouseEnter={() => setHoveredPair(pair)}
                      onMouseLeave={() => setHoveredPair(null)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-200 ${
                        isHovered
                          ? 'bg-violet-50/50 border-violet-200/40 shadow-sm'
                          : 'bg-warm-white/60 border-sand-dark/12 hover:border-violet-200/30'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => onTagClick(tags[0])}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors duration-200 ${
                              activeFilterTags.includes(tags[0])
                                ? 'bg-violet-200/60 border-violet-300/40 text-violet-800'
                                : 'bg-violet-50/50 border-violet-200/25 text-violet-700/70 hover:bg-violet-100/50 hover:text-violet-800'
                            }`}
                          >
                            <TagIcon size={8} className="flex-shrink-0 opacity-50" />
                            {tags[0]}
                          </button>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/20 flex-shrink-0">
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          <button
                            onClick={() => onTagClick(tags[1])}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors duration-200 ${
                              activeFilterTags.includes(tags[1])
                                ? 'bg-violet-200/60 border-violet-300/40 text-violet-800'
                                : 'bg-violet-50/50 border-violet-200/25 text-violet-700/70 hover:bg-violet-100/50 hover:text-violet-800'
                            }`}
                          >
                            <TagIcon size={8} className="flex-shrink-0 opacity-50" />
                            {tags[1]}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-0.5">
                          {getStrengthDots(count, maxPairCount)}
                        </div>
                        <span className="text-[10px] text-anthracite-soft/40 font-sans w-6 text-right">
                          {count}x
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {coOccurrence.length > 0 && (
                <div className="mt-4 px-3.5 py-3 rounded-xl bg-violet-50/30 border border-violet-100/30">
                  <div className="flex items-start gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/40 flex-shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <p className="text-xs text-anthracite-soft/60 font-sans leading-relaxed">
                      {coOccurrence[0].count >= 3 ? (
                        <>
                          De tags <span className="font-medium text-violet-700/80">{coOccurrence[0].tags[0]}</span> en{' '}
                          <span className="font-medium text-violet-700/80">{coOccurrence[0].tags[1]}</span> komen het vaakst samen voor
                          ({coOccurrence[0].count}x). Dit kan wijzen op een terugkerend thema in je sessies.
                        </>
                      ) : coOccurrence[0].count >= 2 ? (
                        <>
                          De combinatie <span className="font-medium text-violet-700/80">{coOccurrence[0].tags[0]}</span> +{' '}
                          <span className="font-medium text-violet-700/80">{coOccurrence[0].tags[1]}</span> komt {coOccurrence[0].count}x voor.
                          Naarmate je meer sessies tagt, worden patronen duidelijker zichtbaar.
                        </>
                      ) : (
                        <>
                          Je tag-combinaties zijn nog divers. Naarmate je meer sessies tagt, worden terugkerende thema-patronen zichtbaar.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Summary stats row ─── */}
          <div className="mt-5 pt-4 border-t border-sand-dark/10 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-serif text-violet-700/70">{tagFrequency.length}</div>
              <div className="text-[10px] text-anthracite-soft/40 font-sans mt-0.5 uppercase tracking-wider">Unieke tags</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-serif text-violet-700/70">{totalTagUsages}</div>
              <div className="text-[10px] text-anthracite-soft/40 font-sans mt-0.5 uppercase tracking-wider">Totaal gebruikt</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-serif text-violet-700/70">{avgTagsPerSession}</div>
              <div className="text-[10px] text-anthracite-soft/40 font-sans mt-0.5 uppercase tracking-wider">Gem. per sessie</div>
            </div>
          </div>

          {/* ─── Download Tag Rapport ─── */}
          <div className="mt-5 pt-4 border-t border-sand-dark/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/50">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <div>
                  <span className="text-xs text-anthracite-soft/70 font-sans font-medium">Tag rapport</span>
                  <p className="text-[10px] text-anthracite-soft/35 font-sans mt-0.5 hidden sm:block">
                    Download een overzicht om te delen met je therapeut of coach
                  </p>
                </div>
              </div>

              <div className="relative" ref={downloadMenuRef}>
                {/* Success feedback */}
                {downloadSuccess && (
                  <div className="absolute right-0 -top-8 animate-gentle-fade">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-sans px-2.5 py-1 rounded-full border whitespace-nowrap shadow-sm ${
                      downloadSuccess === 'save-error'
                        ? 'text-rose-600 bg-rose-50 border-rose-200/30'
                        : 'text-emerald-600 bg-emerald-50 border-emerald-200/30'
                    }`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {downloadSuccess === 'save-error' ? (
                          <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                        ) : (
                          <polyline points="20 6 9 17 4 12" />
                        )}
                      </svg>
                      {downloadSuccess === 'pdf' ? 'Rapport geopend'
                        : downloadSuccess === 'text' ? 'Bestand gedownload'
                        : downloadSuccess === 'saved' ? 'Opgeslagen in mijn rapporten'
                        : 'Opslaan mislukt'}
                    </span>
                  </div>
                )}

                {/* Download button */}
                <button
                  onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-sans font-medium
                    bg-violet-600 text-white hover:bg-violet-700
                    shadow-sm hover:shadow-md
                    transition-all duration-200 active:scale-[0.97]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download tag rapport
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-200 ${showDownloadMenu ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Dropdown menu */}
                {showDownloadMenu && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-warm-white rounded-xl border border-sand-dark/15 shadow-lg overflow-hidden z-20 animate-gentle-fade">

                    <div className="p-1.5">
                      {/* PDF / Print option */}
                      <button
                        onClick={handleDownloadPDF}
                        className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50/50 transition-colors text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-100/60 border border-violet-200/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-violet-100 transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600/70">
                            <polyline points="6 9 6 2 18 2 18 9" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                          </svg>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-anthracite font-sans block">Afdrukken / PDF opslaan</span>
                          <span className="text-[10px] text-anthracite-soft/45 font-sans leading-snug block mt-0.5">
                            Opent een opgemaakt rapport dat je kunt afdrukken of als PDF kunt opslaan
                          </span>
                        </div>
                      </button>

                      {/* Divider */}
                      <div className="mx-3 my-1 border-t border-sand-dark/8" />

                      {/* Text file option */}
                      <button
                        onClick={handleDownloadText}
                        className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50/50 transition-colors text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sand-dark/8 border border-sand-dark/12 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-sand-dark/12 transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-anthracite font-sans block">Tekstbestand downloaden</span>
                          <span className="text-[10px] text-anthracite-soft/45 font-sans leading-snug block mt-0.5">
                            Download een .txt bestand met alle tag-statistieken en trends
                          </span>
                        </div>
                      </button>

                      {/* Save to database option (only for authenticated users) */}
                      {isAuthenticated && user && (
                        <>
                          <div className="mx-3 my-1 border-t border-sand-dark/8" />
                          <button
                            onClick={async () => {
                              setSaveLoading(true);
                              try {
                                const data = collectReportData();
                                const dateStr = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
                                const { error } = await supabase
                                  .from('ik_tag_reports')
                                  .insert({
                                    user_id: user.id,
                                    title: `Tag Rapport — ${dateStr}`,
                                    report_data: data,
                                    unique_tag_count: data.uniqueTagCount,
                                    total_tag_usages: data.totalTagUsages,
                                    sessions_count: data.totalSessions,
                                    rising_tags: data.risingTags,
                                    falling_tags: data.fallingTags,
                                  });
                                if (error) {
                                  console.error('Save report error:', error);
                                  setDownloadSuccess('save-error');
                                } else {
                                  setDownloadSuccess('saved');
                                }
                              } catch (e) {
                                console.error('Save report error:', e);
                                setDownloadSuccess('save-error');
                              }
                              setSaveLoading(false);
                              setShowDownloadMenu(false);
                            }}
                            disabled={saveLoading}
                            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-emerald-50/50 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-emerald-100/50 border border-emerald-200/25 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-emerald-100/70 transition-colors">
                              {saveLoading ? (
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-300/40 border-t-emerald-500 animate-spin" />
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600/70">
                                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                  <polyline points="17 21 17 13 7 13 7 21" />
                                  <polyline points="7 3 7 8 15 8" />
                                </svg>
                              )}
                            </div>
                            <div>
                              <span className="text-xs font-medium text-anthracite font-sans block">
                                {saveLoading ? 'Opslaan...' : 'Opslaan in mijn rapporten'}
                              </span>
                              <span className="text-[10px] text-anthracite-soft/45 font-sans leading-snug block mt-0.5">
                                Bewaar dit rapport zodat je het later kunt terugvinden en vergelijken
                              </span>
                            </div>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Footer note */}
                    <div className="px-4 py-2.5 bg-sand-dark/5 border-t border-sand-dark/8">
                      <p className="text-[9px] text-anthracite-soft/35 font-sans leading-relaxed">
                        Het rapport bevat tag-frequenties, combinaties, trends en maandelijks overzicht.
                      </p>

                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagStatistics;
