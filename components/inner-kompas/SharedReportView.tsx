import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { type TagReportData } from '@/lib/generateTagReport';

// ─── Types ───
interface SharedReportData {
  title: string;
  reportData: TagReportData;
  uniqueTagCount: number;
  totalTagUsages: number;
  sessionsCount: number;
  risingTags: string[];
  fallingTags: string[];
  createdAt: string;
}

interface ShareMeta {
  expiresAt: string;
  firstAccessed: boolean;
}

type LoadState = 'loading' | 'loaded' | 'error';
type ErrorCode = 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'REPORT_DELETED' | 'UNKNOWN';

// ─── Tag icon SVG ───
const TagIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatExpiry(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diffDays <= 0) return 'Verlopen';
  if (diffDays === 1) return 'Verloopt morgen';
  if (diffDays <= 7) return `Verloopt over ${diffDays} dagen`;
  return `Geldig tot ${formatDate(dateStr)}`;
}

// ─── Error messages ───
const ERROR_MESSAGES: Record<ErrorCode, { title: string; message: string; icon: 'lock' | 'clock' | 'search' }> = {
  NOT_FOUND: {
    title: 'Link niet gevonden',
    message: 'Deze deellink bestaat niet of is verwijderd.',
    icon: 'search',
  },
  REVOKED: {
    title: 'Toegang ingetrokken',
    message: 'De eigenaar van dit rapport heeft de toegang tot deze deellink ingetrokken.',
    icon: 'lock',
  },
  EXPIRED: {
    title: 'Link verlopen',
    message: 'Deze deellink is verlopen. Vraag de eigenaar om een nieuwe link te genereren.',
    icon: 'clock',
  },
  REPORT_DELETED: {
    title: 'Rapport verwijderd',
    message: 'Het rapport dat bij deze link hoorde is verwijderd.',
    icon: 'search',
  },
  UNKNOWN: {
    title: 'Er ging iets mis',
    message: 'Er is een onverwachte fout opgetreden. Probeer het later opnieuw.',
    icon: 'search',
  },
};

const SharedReportView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [report, setReport] = useState<SharedReportData | null>(null);
  const [shareMeta, setShareMeta] = useState<ShareMeta | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode>('UNKNOWN');

  useEffect(() => {
    if (token) {
      loadSharedReport(token);
    } else {
      setErrorCode('NOT_FOUND');
      setLoadState('error');
    }
  }, [token]);

  const loadSharedReport = async (shareToken: string) => {
    setLoadState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'get', token: shareToken },
      });

      if (error || !data || data.error) {
        const code = data?.code || 'UNKNOWN';
        setErrorCode(code as ErrorCode);
        setLoadState('error');
        return;
      }

      setReport(data.report);
      setShareMeta(data.share);
      setLoadState('loaded');
    } catch (e) {
      console.error('Error loading shared report:', e);
      setErrorCode('UNKNOWN');
      setLoadState('error');
    }
  };

  // ─── Loading state ───
  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-100/60 border border-violet-200/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/60">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 font-sans">Rapport laden...</p>
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (loadState === 'error') {
    const err = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.UNKNOWN;
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200/30 flex items-center justify-center mx-auto mb-5">
            {err.icon === 'lock' && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
            {err.icon === 'clock' && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            )}
            {err.icon === 'search' && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
          </div>
          <h2 className="font-serif text-xl text-[#1a1a2e] mb-2">{err.title}</h2>
          <p className="text-sm text-gray-500 font-sans leading-relaxed">{err.message}</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const data = report.reportData;
  const maxFreq = data.tagFrequency.length > 0 ? data.tagFrequency[0][1] : 1;

  // ─── Cloud size ───
  const getCloudSize = (count: number) => {
    const ratio = count / maxFreq;
    if (ratio >= 0.8) return 'text-xl px-4 py-2 font-semibold';
    if (ratio >= 0.6) return 'text-lg px-3.5 py-1.5 font-medium';
    if (ratio >= 0.4) return 'text-base px-3 py-1.5 font-medium';
    if (ratio >= 0.2) return 'text-sm px-2.5 py-1 font-normal';
    return 'text-xs px-2 py-1 font-normal';
  };

  const getCloudOpacity = (count: number) => {
    const ratio = count / maxFreq;
    if (ratio >= 0.7) return 'opacity-100';
    if (ratio >= 0.4) return 'opacity-85';
    return 'opacity-70';
  };

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* ─── Header bar ─── */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-100/60 border border-violet-200/30 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600/70">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
            <span className="text-sm font-sans font-medium text-violet-700/80">InnerKompas</span>
            <span className="text-xs text-gray-400 font-sans">Gedeeld rapport</span>
          </div>
          {shareMeta && (
            <span className="text-[10px] text-gray-400 font-sans flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {formatExpiry(shareMeta.expiresAt)}
            </span>
          )}
        </div>
      </div>

      {/* ─── Report content ─── */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Read-only badge */}
        <div className="flex items-center gap-2 mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 border border-violet-200/30 text-xs font-sans text-violet-600">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            Alleen-lezen weergave
          </span>
          {shareMeta?.firstAccessed && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/30 text-[10px] font-sans text-emerald-600">
              Eerste keer geopend
            </span>
          )}
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-[#1a1a2e] mb-1">{report.title || 'Tag Rapport'}</h1>
          <p className="text-sm text-gray-400 font-sans">
            Gegenereerd op {formatDate(report.createdAt)}
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="p-4 rounded-xl bg-white border border-gray-200/60 text-center">
            <p className="text-2xl font-serif text-violet-700/80">{report.uniqueTagCount}</p>
            <p className="text-[10px] text-gray-400 font-sans mt-0.5 uppercase tracking-wider">Unieke tags</p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200/60 text-center">
            <p className="text-2xl font-serif text-violet-700/80">{report.totalTagUsages}</p>
            <p className="text-[10px] text-gray-400 font-sans mt-0.5 uppercase tracking-wider">Totaal gebruikt</p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200/60 text-center">
            <p className="text-2xl font-serif text-violet-700/80">{data.avgTagsPerSession}</p>
            <p className="text-[10px] text-gray-400 font-sans mt-0.5 uppercase tracking-wider">Gem. per sessie</p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200/60 text-center">
            <p className="text-2xl font-serif text-violet-700/80">{report.sessionsCount}</p>
            <p className="text-[10px] text-gray-400 font-sans mt-0.5 uppercase tracking-wider">Sessies</p>
          </div>
        </div>

        {/* ─── Tag Cloud ─── */}
        <div className="mb-8 p-6 rounded-2xl bg-white border border-gray-200/60">
          <h2 className="font-serif text-lg text-[#1a1a2e] mb-1">Tagwolk</h2>
          <p className="text-xs text-gray-400 font-sans mb-4">Grotere tags komen vaker voor</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 py-4 min-h-[80px]">
            {data.tagFrequency.map(([tag, count]) => (
              <span
                key={tag}
                className={`inline-flex items-center gap-1.5 rounded-2xl border border-violet-200/25 bg-violet-50/40 text-violet-700/80 ${getCloudSize(count)} ${getCloudOpacity(count)}`}
              >
                <TagIcon size={count / maxFreq >= 0.6 ? 13 : 10} className="opacity-50" />
                {tag}
                <span className="text-[10px] opacity-50 font-normal">{count}x</span>
              </span>
            ))}
          </div>
        </div>

        {/* ─── Bar Chart ─── */}
        <div className="mb-8 p-6 rounded-2xl bg-white border border-gray-200/60">
          <h2 className="font-serif text-lg text-[#1a1a2e] mb-1">Tag-frequentie</h2>
          <p className="text-xs text-gray-400 font-sans mb-4">Hoe vaak elke tag is gebruikt</p>
          <div className="space-y-2.5">
            {data.tagFrequency.map(([tag, count]) => {
              const pct = (count / maxFreq) * 100;
              const sessionPct = Math.round((count / data.totalSessions) * 100);
              return (
                <div key={tag} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                    <TagIcon size={10} className="text-violet-400/50 flex-shrink-0" />
                    <span className="text-sm font-sans text-gray-600 truncate">{tag}</span>
                  </div>
                  <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full bg-violet-200/50 rounded-lg"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      {pct > 30 && (
                        <span className="text-[10px] text-violet-800/60 font-sans ml-2.5 font-medium leading-7">{count}x</span>
                      )}
                    </div>
                    {pct <= 30 && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-sans">{count}x</span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 font-sans w-10 text-right flex-shrink-0">{sessionPct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Trends ─── */}
        {(report.risingTags.length > 0 || report.fallingTags.length > 0) && (
          <div className="mb-8 p-6 rounded-2xl bg-white border border-gray-200/60">
            <h2 className="font-serif text-lg text-[#1a1a2e] mb-1">Trendanalyse</h2>
            <p className="text-xs text-gray-400 font-sans mb-4">Vergelijking eerste helft vs. tweede helft van sessies</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.risingTags.length > 0 && (
                <div className="px-4 py-3 rounded-xl bg-emerald-50/50 border border-emerald-200/25">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                    <span className="text-xs text-emerald-700/70 font-sans font-medium">Stijgend</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {report.risingTags.slice(0, 6).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100/50 border border-emerald-200/30 text-emerald-700/80 font-sans">
                        <TagIcon size={8} className="opacity-50" />
                        {tag}
                        {data.tagTrends[tag] && (
                          <span className="text-[9px] opacity-50">+{data.tagTrends[tag].change.toFixed(1)}/mnd</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {report.fallingTags.length > 0 && (
                <div className="px-4 py-3 rounded-xl bg-rose-50/50 border border-rose-200/25">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                    </svg>
                    <span className="text-xs text-rose-600/70 font-sans font-medium">Dalend</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {report.fallingTags.slice(0, 6).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-100/50 border border-rose-200/30 text-rose-600/80 font-sans">
                        <TagIcon size={8} className="opacity-50" />
                        {tag}
                        {data.tagTrends[tag] && (
                          <span className="text-[9px] opacity-50">{data.tagTrends[tag].change.toFixed(1)}/mnd</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Co-occurrence ─── */}
        {data.coOccurrence.length > 0 && (
          <div className="mb-8 p-6 rounded-2xl bg-white border border-gray-200/60">
            <h2 className="font-serif text-lg text-[#1a1a2e] mb-1">Veelvoorkomende combinaties</h2>
            <p className="text-xs text-gray-400 font-sans mb-4">Tags die samen voorkomen in dezelfde sessie</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {data.coOccurrence.map(({ pair, tags, count }) => (
                <div key={pair} className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-200/40">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200/25 text-violet-700/70 font-sans">{tags[0]}</span>
                    <span className="text-[10px] text-gray-400">+</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200/25 text-violet-700/70 font-sans">{tags[1]}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-sans">{count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Monthly overview ─── */}
        {data.sortedMonths.length >= 2 && (
          <div className="mb-8 p-6 rounded-2xl bg-white border border-gray-200/60">
            <h2 className="font-serif text-lg text-[#1a1a2e] mb-1">Maandelijks overzicht</h2>
            <p className="text-xs text-gray-400 font-sans mb-4">Hoe vaak elke tag per maand is gebruikt</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-sans">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-400 font-medium border-b border-gray-200/50">Maand</th>
                    {data.tagFrequency.slice(0, 8).map(([tag]) => (
                      <th key={tag} className="text-center py-2 px-2 text-violet-600/70 font-medium border-b border-gray-200/50 whitespace-nowrap max-w-[80px] truncate">{tag}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sortedMonths.map(month => (
                    <tr key={month}>
                      <td className="py-1.5 px-2 text-gray-500 font-medium whitespace-nowrap border-r border-gray-100">{month}</td>
                      {data.tagFrequency.slice(0, 8).map(([tag]) => {
                        const count = data.tagTimeline[tag]?.[month] || 0;
                        const maxForTag = Math.max(...data.sortedMonths.map(m => data.tagTimeline[tag]?.[m] || 0), 1);
                        const intensity = count / maxForTag;
                        return (
                          <td
                            key={tag}
                            className="text-center py-1.5 px-2"
                            style={{
                              backgroundColor: count > 0 ? `rgba(124, 58, 237, ${0.06 + intensity * 0.3})` : 'transparent',
                              color: count > 0 ? '#7c3aed' : '#d1d5db',
                              fontWeight: count > 0 ? 500 : 400,
                            }}
                          >
                            {count > 0 ? count : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Footer ─── */}
        <div className="mt-10 pt-6 border-t border-gray-200/50 text-center">
          <p className="text-xs text-gray-400 font-sans mb-2">
            Dit rapport is gedeeld via InnerKompas. Het biedt een overzicht van tag-patronen over {report.sessionsCount} sessie{report.sessionsCount !== 1 ? 's' : ''}.
          </p>
          <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200/40 max-w-lg mx-auto">
            <p className="text-[11px] text-gray-400 font-sans italic leading-relaxed">
              Dit rapport is bedoeld als hulpmiddel voor zelfreflectie en gesprekken met je therapeut of coach.
              Het vervangt geen professioneel advies. De trends en patronen zijn gebaseerd op hoe de gebruiker
              zelf sessies heeft getagd.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedReportView;
