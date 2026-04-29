import React, { useMemo, useState } from 'react';

// ─── Types ───
interface FlatShare {
  id: string;
  share_token: string;
  created_at: string;
  expires_at: string;
  accessed_at: string | null;
  revoked: boolean;
  report_id: string;
  report_title: string;
  report_created_at: string;
  report_tag_count: number;
  report_sessions_count: number;
}

interface ShareAnalyticsProps {
  shares: FlatShare[];
}

// ─── Helpers ───
function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours)} uur`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'dag' : 'dagen'}`;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
  });
}

// ─── SVG Icons ───
const ChartBarIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const ClockIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const TrophyIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const ActivityIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const HeartPulseIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
  </svg>
);

const ChevronIcon: React.FC<{ expanded: boolean; className?: string }> = ({ expanded, className = '' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''} ${className}`}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ─── Main Component ───
const ShareAnalytics: React.FC<ShareAnalyticsProps> = ({ shares }) => {
  const [expanded, setExpanded] = useState(false);

  // ─── Computed: Shares per month ───
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    shares.forEach(s => {
      const key = getMonthKey(s.created_at);
      months[key] = (months[key] || 0) + 1;
    });

    // Ensure we have at least 6 months of data for a nice chart
    const keys = Object.keys(months).sort();
    if (keys.length === 0) return [];

    const first = keys[0];
    const last = keys[keys.length - 1];
    const [fy, fm] = first.split('-').map(Number);
    const [ly, lm] = last.split('-').map(Number);

    const result: Array<{ key: string; label: string; count: number }> = [];
    let y = fy, m = fm;
    while (y < ly || (y === ly && m <= lm)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      result.push({ key, label: getMonthLabel(key), count: months[key] || 0 });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return result;
  }, [shares]);

  const maxMonthly = useMemo(() => Math.max(...monthlyData.map(d => d.count), 1), [monthlyData]);

  // ─── Computed: Average time-to-first-view ───
  const timeToView = useMemo(() => {
    const viewedShares = shares.filter(s => s.accessed_at);
    if (viewedShares.length === 0) return null;

    const times = viewedShares.map(s => {
      const created = new Date(s.created_at).getTime();
      const accessed = new Date(s.accessed_at!).getTime();
      return (accessed - created) / (1000 * 60 * 60); // hours
    });

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

    return { avg, min, max, median, count: viewedShares.length };
  }, [shares]);

  // ─── Computed: Most-shared reports ───
  const mostSharedReports = useMemo(() => {
    const reportMap: Record<string, { title: string; count: number; viewedCount: number; reportId: string }> = {};
    shares.forEach(s => {
      if (!reportMap[s.report_id]) {
        reportMap[s.report_id] = { title: s.report_title, count: 0, viewedCount: 0, reportId: s.report_id };
      }
      reportMap[s.report_id].count++;
      if (s.accessed_at) reportMap[s.report_id].viewedCount++;
    });
    return Object.values(reportMap).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [shares]);

  // ─── Computed: Share lifecycle ───
  const lifecycle = useMemo(() => {
    const now = new Date();
    const total = shares.length;
    const viewed = shares.filter(s => s.accessed_at !== null).length;
    const revoked = shares.filter(s => s.revoked).length;
    const expired = shares.filter(s => !s.revoked && new Date(s.expires_at) <= now).length;
    const active = shares.filter(s => !s.revoked && new Date(s.expires_at) > now).length;
    const activeViewed = shares.filter(s => !s.revoked && new Date(s.expires_at) > now && s.accessed_at !== null).length;
    const neverViewed = shares.filter(s => !s.accessed_at && (s.revoked || new Date(s.expires_at) <= now)).length;

    return { total, viewed, revoked, expired, active, activeViewed, neverViewed };
  }, [shares]);

  // ─── Computed: Coach engagement score ───
  const engagementScore = useMemo(() => {
    if (shares.length === 0) return null;

    const now = new Date();
    // Factors:
    // 1. View rate (what % of shares were viewed) — weight 40%
    const viewRate = shares.filter(s => s.accessed_at).length / shares.length;

    // 2. Timeliness (how quickly shares are viewed — faster = better) — weight 25%
    const viewedShares = shares.filter(s => s.accessed_at);
    let timelinessScore = 0;
    if (viewedShares.length > 0) {
      const avgHours = viewedShares.reduce((sum, s) => {
        return sum + (new Date(s.accessed_at!).getTime() - new Date(s.created_at).getTime()) / (1000 * 60 * 60);
      }, 0) / viewedShares.length;
      // < 1 hour = 1.0, < 24 hours = 0.8, < 72 hours = 0.5, > 72 hours = 0.2
      if (avgHours < 1) timelinessScore = 1.0;
      else if (avgHours < 24) timelinessScore = 0.8;
      else if (avgHours < 72) timelinessScore = 0.5;
      else if (avgHours < 168) timelinessScore = 0.3;
      else timelinessScore = 0.15;
    }

    // 3. Consistency (are shares being viewed regularly, not just once) — weight 20%
    const recentShares = shares.filter(s => {
      const age = (now.getTime() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return age <= 90; // last 90 days
    });
    const recentViewRate = recentShares.length > 0
      ? recentShares.filter(s => s.accessed_at).length / recentShares.length
      : 0;
    const consistencyScore = recentShares.length > 0 ? recentViewRate : viewRate;

    // 4. Freshness (are shares still being created recently) — weight 15%
    const lastShareDate = shares.length > 0 ? new Date(shares[0].created_at) : null;
    let freshnessScore = 0;
    if (lastShareDate) {
      const daysSinceLast = (now.getTime() - lastShareDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLast < 7) freshnessScore = 1.0;
      else if (daysSinceLast < 14) freshnessScore = 0.8;
      else if (daysSinceLast < 30) freshnessScore = 0.6;
      else if (daysSinceLast < 60) freshnessScore = 0.3;
      else freshnessScore = 0.1;
    }

    const score = Math.round(
      (viewRate * 0.4 + timelinessScore * 0.25 + consistencyScore * 0.2 + freshnessScore * 0.15) * 100
    );

    // Determine level
    let level: string;
    let levelColor: string;
    let levelBg: string;
    if (score >= 80) { level = 'Uitstekend'; levelColor = 'text-emerald-600'; levelBg = 'bg-emerald-500'; }
    else if (score >= 60) { level = 'Goed'; levelColor = 'text-indigo-600'; levelBg = 'bg-indigo-500'; }
    else if (score >= 40) { level = 'Matig'; levelColor = 'text-amber-600'; levelBg = 'bg-amber-500'; }
    else if (score >= 20) { level = 'Laag'; levelColor = 'text-orange-600'; levelBg = 'bg-orange-500'; }
    else { level = 'Minimaal'; levelColor = 'text-rose-500'; levelBg = 'bg-rose-400'; }

    return {
      score,
      level,
      levelColor,
      levelBg,
      components: {
        viewRate: Math.round(viewRate * 100),
        timeliness: Math.round(timelinessScore * 100),
        consistency: Math.round(consistencyScore * 100),
        freshness: Math.round(freshnessScore * 100),
      },
    };
  }, [shares]);

  // Not enough data
  if (shares.length < 2) {
    return (
      <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50/40 to-violet-50/30 border border-indigo-100/25">
        <div className="flex items-center gap-2 mb-2">
          <ChartBarIcon className="text-indigo-400/60" />
          <h4 className="text-sm font-sans font-medium text-anthracite">Deelanalyse</h4>
        </div>
        <p className="text-xs text-anthracite-soft/45 font-sans leading-relaxed">
          Deel minimaal 2 rapporten met je coach om analyse-inzichten te zien. Hoe meer je deelt, hoe rijker de statistieken.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-100/30 overflow-hidden animate-gentle-fade">
      {/* ─── Collapsible header ─── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50/50 via-violet-50/30 to-indigo-50/40 hover:from-indigo-50/70 hover:via-violet-50/50 hover:to-indigo-50/60 transition-all duration-200"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100/60 border border-indigo-200/25 flex items-center justify-center">
            <ChartBarIcon className="text-indigo-500/70" />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-sans font-medium text-anthracite">Deelanalyse</h4>
            <p className="text-[10px] text-anthracite-soft/40 font-sans">
              {shares.length} deellinks — {shares.filter(s => s.accessed_at).length} bekeken
              {engagementScore && (
                <span className={`ml-1.5 ${engagementScore.levelColor}`}>
                  — Score: {engagementScore.score}%
                </span>
              )}
            </p>
          </div>
        </div>
        <ChevronIcon expanded={expanded} className="text-anthracite-soft/40" />
      </button>

      {/* ─── Expanded content ─── */}
      {expanded && (
        <div className="p-4 space-y-5 bg-warm-white/30">

          {/* ═══ 1. SHARES PER MONTH — BAR CHART ═══ */}
          {monthlyData.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <ChartBarIcon className="text-indigo-400/60" />
                <span className="text-xs font-sans font-medium text-anthracite">Deellinks per maand</span>
              </div>
              <div className="flex items-end gap-1.5 h-28 px-1">
                {monthlyData.map((d) => {
                  const heightPct = Math.max((d.count / maxMonthly) * 100, 4);
                  return (
                    <div key={d.key} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] font-sans text-anthracite-soft/50 opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.count}
                      </span>
                      <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                        <div
                          className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-indigo-400/70 to-indigo-300/50 group-hover:from-indigo-500/80 group-hover:to-indigo-400/60 transition-all duration-200 relative"
                          style={{ height: `${heightPct}%`, minHeight: '3px' }}
                        >
                          {d.count > 0 && (
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-sans font-medium text-indigo-600/70">
                              {d.count}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[8px] font-sans text-anthracite-soft/35 uppercase tracking-wider whitespace-nowrap">
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ 2. TIME-TO-FIRST-VIEW ═══ */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ClockIcon className="text-violet-400/60" />
              <span className="text-xs font-sans font-medium text-anthracite">Reactietijd coach</span>
            </div>
            {timeToView ? (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Gemiddeld', value: formatHours(timeToView.avg), highlight: true },
                  { label: 'Mediaan', value: formatHours(timeToView.median), highlight: false },
                  { label: 'Snelst', value: formatHours(timeToView.min), highlight: false },
                  { label: 'Langzaamst', value: formatHours(timeToView.max), highlight: false },
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    className={`p-2.5 rounded-lg text-center ${
                      highlight
                        ? 'bg-violet-50/60 border border-violet-200/25'
                        : 'bg-sand-dark/4 border border-sand-dark/8'
                    }`}
                  >
                    <span className={`text-sm font-serif ${highlight ? 'text-violet-700' : 'text-anthracite-soft/70'}`}>
                      {value}
                    </span>
                    <p className="text-[8px] font-sans text-anthracite-soft/35 uppercase tracking-wider mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-anthracite-soft/40 font-sans italic">
                Nog geen bekeken deellinks — reactietijd wordt berekend zodra je coach een link opent.
              </p>
            )}
          </div>

          {/* ═══ 3. MOST-SHARED REPORTS ═══ */}
          {mostSharedReports.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <TrophyIcon className="text-amber-500/60" />
                <span className="text-xs font-sans font-medium text-anthracite">Meest gedeelde rapporten</span>
              </div>
              <div className="space-y-1.5">
                {mostSharedReports.map((report, idx) => {
                  const barWidth = Math.max((report.count / mostSharedReports[0].count) * 100, 8);
                  const medal = idx === 0 ? 'bg-amber-100/60 border-amber-200/30 text-amber-700' :
                                idx === 1 ? 'bg-slate-100/60 border-slate-200/30 text-slate-600' :
                                idx === 2 ? 'bg-orange-100/50 border-orange-200/25 text-orange-700' :
                                'bg-sand-dark/6 border-sand-dark/10 text-anthracite-soft/50';
                  return (
                    <div key={report.reportId} className="flex items-center gap-2.5">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-sans font-bold border flex-shrink-0 ${medal}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-sans text-anthracite truncate pr-2">{report.title}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-sans text-anthracite-soft/50">
                              {report.count}x gedeeld
                            </span>
                            {report.viewedCount > 0 && (
                              <span className="text-[9px] font-sans text-emerald-600/60">
                                ({report.viewedCount} bekeken)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 bg-sand-dark/6 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-300/60 to-amber-400/50 transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ 4. SHARE LIFECYCLE VISUALIZATION ═══ */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ActivityIcon className="text-indigo-400/60" />
              <span className="text-xs font-sans font-medium text-anthracite">Levenscyclus deellinks</span>
            </div>

            {/* Funnel / flow visualization */}
            <div className="relative">
              {/* Flow steps */}
              <div className="flex items-stretch gap-0">
                {/* Created */}
                <div className="flex-1 text-center relative">
                  <div className="px-2 py-3 rounded-l-xl bg-indigo-50/60 border border-indigo-200/20 border-r-0">
                    <span className="text-lg font-serif text-indigo-600">{lifecycle.total}</span>
                    <p className="text-[8px] font-sans text-indigo-500/60 uppercase tracking-wider mt-0.5">Aangemaakt</p>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center -mx-1 z-10">
                  <svg width="12" height="24" viewBox="0 0 12 24" className="text-indigo-200/50">
                    <path d="M0 0 L12 12 L0 24" fill="currentColor" />
                  </svg>
                </div>

                {/* Viewed */}
                <div className="flex-1 text-center relative">
                  <div className="px-2 py-3 bg-emerald-50/60 border-y border-emerald-200/20">
                    <span className="text-lg font-serif text-emerald-600">{lifecycle.viewed}</span>
                    <p className="text-[8px] font-sans text-emerald-500/60 uppercase tracking-wider mt-0.5">Bekeken</p>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center -mx-1 z-10">
                  <svg width="12" height="24" viewBox="0 0 12 24" className="text-emerald-200/50">
                    <path d="M0 0 L12 12 L0 24" fill="currentColor" />
                  </svg>
                </div>

                {/* End states */}
                <div className="flex-1 text-center">
                  <div className="px-2 py-3 rounded-r-xl bg-sand-dark/4 border border-sand-dark/10 border-l-0">
                    <div className="flex items-center justify-center gap-3">
                      <div>
                        <span className="text-sm font-serif text-emerald-600">{lifecycle.active}</span>
                        <p className="text-[7px] font-sans text-emerald-500/50 uppercase tracking-wider">Actief</p>
                      </div>
                      <div className="w-px h-6 bg-sand-dark/10" />
                      <div>
                        <span className="text-sm font-serif text-amber-600">{lifecycle.expired}</span>
                        <p className="text-[7px] font-sans text-amber-500/50 uppercase tracking-wider">Verlopen</p>
                      </div>
                      <div className="w-px h-6 bg-sand-dark/10" />
                      <div>
                        <span className="text-sm font-serif text-rose-500">{lifecycle.revoked}</span>
                        <p className="text-[7px] font-sans text-rose-400/50 uppercase tracking-wider">Ingetrokken</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional stats below */}
              {lifecycle.neverViewed > 0 && (
                <div className="mt-2 flex items-center gap-1.5 px-2">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span className="text-[10px] text-anthracite-soft/40 font-sans">
                    {lifecycle.neverViewed} link{lifecycle.neverViewed !== 1 ? 's' : ''} {lifecycle.neverViewed === 1 ? 'is' : 'zijn'} verlopen of ingetrokken zonder ooit bekeken te zijn
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ═══ 5. COACH ENGAGEMENT SCORE ═══ */}
          {engagementScore && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <HeartPulseIcon className="text-rose-400/60" />
                <span className="text-xs font-sans font-medium text-anthracite">Coach-betrokkenheid</span>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50/30 via-violet-50/20 to-rose-50/20 border border-indigo-100/20">
                {/* Score display */}
                <div className="flex items-center gap-4 mb-4">
                  {/* Circular score */}
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-sand-dark/8" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeDasharray={`${engagementScore.score * 0.975} 100`}
                        strokeLinecap="round"
                        className={engagementScore.levelColor}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-lg font-serif font-medium ${engagementScore.levelColor}`}>
                        {engagementScore.score}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-sans font-medium ${engagementScore.levelColor}`}>
                        {engagementScore.level}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${engagementScore.levelBg}`} />
                    </div>
                    <p className="text-[10px] text-anthracite-soft/45 font-sans leading-relaxed max-w-[200px]">
                      {engagementScore.score >= 80
                        ? 'Je coach bekijkt je rapporten snel en consistent. Uitstekende samenwerking!'
                        : engagementScore.score >= 60
                        ? 'Je coach bekijkt de meeste rapporten. Goede betrokkenheid.'
                        : engagementScore.score >= 40
                        ? 'Sommige rapporten worden bekeken. Overweeg je coach een herinnering te sturen.'
                        : 'Weinig rapporten worden bekeken. Bespreek het delen van rapporten met je coach.'
                      }
                    </p>
                  </div>
                </div>

                {/* Component breakdown */}
                <div className="space-y-2">
                  {[
                    { label: 'Bekijkpercentage', value: engagementScore.components.viewRate, color: 'bg-emerald-400/60' },
                    { label: 'Reactiesnelheid', value: engagementScore.components.timeliness, color: 'bg-violet-400/60' },
                    { label: 'Consistentie', value: engagementScore.components.consistency, color: 'bg-indigo-400/60' },
                    { label: 'Activiteit', value: engagementScore.components.freshness, color: 'bg-amber-400/60' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <span className="text-[10px] font-sans text-anthracite-soft/50 w-[100px] flex-shrink-0 text-right">{label}</span>
                      <div className="flex-1 h-1.5 bg-sand-dark/6 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color} transition-all duration-700`}
                          style={{ width: `${Math.max(value, 2)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-sans text-anthracite-soft/40 w-8 text-right">{value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── Insight note ─── */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-violet-50/30 border border-violet-100/20">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400/50 flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="text-[10px] text-anthracite-soft/45 font-sans leading-relaxed">
              Deze analyse is gebaseerd op {shares.length} deellink{shares.length !== 1 ? 's' : ''}. Hoe meer je deelt, hoe nauwkeuriger de inzichten. De betrokkenheidsscore wordt berekend op basis van bekijkpercentage, reactiesnelheid, consistentie en recente activiteit.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareAnalytics;
