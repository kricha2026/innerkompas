import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useShareNotifications } from '@/contexts/ShareNotificationContext';
import { openTagReport, downloadTagReportAsText, type TagReportData } from '@/lib/generateTagReport';
import ShareAnalytics from '@/components/inner-kompas/ShareAnalytics';
import ShareExpirationManager from '@/components/inner-kompas/ShareExpirationManager';



// ─── Types ───
interface SavedReport {
  id: string;
  created_at: string;
  title: string | null;
  report_data: TagReportData;
  unique_tag_count: number;
  total_tag_usages: number;
  sessions_count: number;
  rising_tags: string[];
  falling_tags: string[];
}

interface ReportShare {
  id: string;
  share_token: string;
  created_at: string;
  expires_at: string;
  accessed_at: string | null;
  revoked: boolean;
}

type ReportView = 'list' | 'compare' | 'shares';

type ShareFilter = 'all' | 'active' | 'revoked' | 'expired';

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


// ─── Tag icon SVG ───
const TagIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

// ─── Format date ───
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMin < 1) return 'Zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  if (diffHrs < 24) return `${diffHrs} uur geleden`;
  if (diffDays === 1) return 'Gisteren';
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  if (diffWeeks < 5) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weken'} geleden`;
  return `${diffMonths} ${diffMonths === 1 ? 'maand' : 'maanden'} geleden`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// ─── Comparison helpers ───
interface ComparisonResult {
  commonTags: Array<{ tag: string; countA: number; countB: number; change: number; changePercent: number }>;
  removedTags: Array<{ tag: string; count: number }>;
  newTags: Array<{ tag: string; count: number }>;
  statsComparison: {
    uniqueTagsDiff: number;
    totalUsagesDiff: number;
    sessionsDiff: number;
    avgPerSessionA: string;
    avgPerSessionB: string;
  };
  trendChanges: Array<{ tag: string; directionA: 'up' | 'down' | 'stable'; directionB: 'up' | 'down' | 'stable' }>;
}

function compareReports(reportA: TagReportData, reportB: TagReportData): ComparisonResult {
  const freqMapA = new Map(reportA.tagFrequency);
  const freqMapB = new Map(reportB.tagFrequency);
  const allTags = new Set([...freqMapA.keys(), ...freqMapB.keys()]);

  const commonTags: ComparisonResult['commonTags'] = [];
  const removedTags: ComparisonResult['removedTags'] = [];
  const newTags: ComparisonResult['newTags'] = [];

  allTags.forEach(tag => {
    const countA = freqMapA.get(tag) || 0;
    const countB = freqMapB.get(tag) || 0;
    if (countA > 0 && countB > 0) {
      commonTags.push({ tag, countA, countB, change: countB - countA, changePercent: countA > 0 ? ((countB - countA) / countA) * 100 : 0 });
    } else if (countA > 0) {
      removedTags.push({ tag, count: countA });
    } else if (countB > 0) {
      newTags.push({ tag, count: countB });
    }
  });

  commonTags.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  removedTags.sort((a, b) => b.count - a.count);
  newTags.sort((a, b) => b.count - a.count);

  const trendChanges: ComparisonResult['trendChanges'] = [];
  allTags.forEach(tag => {
    const dirA = reportA.tagTrends[tag]?.direction || 'stable';
    const dirB = reportB.tagTrends[tag]?.direction || 'stable';
    if (dirA !== dirB) trendChanges.push({ tag, directionA: dirA, directionB: dirB });
  });

  return {
    commonTags, removedTags, newTags,
    statsComparison: {
      uniqueTagsDiff: reportB.uniqueTagCount - reportA.uniqueTagCount,
      totalUsagesDiff: reportB.totalTagUsages - reportA.totalTagUsages,
      sessionsDiff: reportB.totalSessions - reportA.totalSessions,
      avgPerSessionA: reportA.avgTagsPerSession,
      avgPerSessionB: reportB.avgTagsPerSession,
    },
    trendChanges,
  };
}

// ─── Main Component ───
const MijnRapporten: React.FC = () => {
  const { user } = useAuth();
  const { notifications, unreadCount, onSharesViewOpened, dismissNotification, markAsRead } = useShareNotifications();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ReportView>('list');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Comparison state
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  // Share state
  const [shareReportId, setShareReportId] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareResult, setShareResult] = useState<{ token: string; expiresAt: string; isExisting: boolean; shareId: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [reportShares, setReportShares] = useState<Record<string, ReportShare[]>>({});
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);

  // Gedeelde links state
  const [shareFilter, setShareFilter] = useState<ShareFilter>('all');
  const [copiedShareToken, setCopiedShareToken] = useState<string | null>(null);

  // ─── Mark notifications as read when entering shares view ───
  useEffect(() => {
    if (view === 'shares') {
      onSharesViewOpened();
    }
  }, [view, onSharesViewOpened]);

  // ─── Get unread notification IDs for share cards ───
  const unreadShareIds = useMemo(() => {
    const ids = new Set<string>();
    notifications.filter(n => !n.read).forEach(n => ids.add(n.shareId));
    return ids;
  }, [notifications]);

  // ─── Recently notified share IDs (within last 24h) for visual indicators ───
  const recentlyNotifiedShareIds = useMemo(() => {
    const ids = new Set<string>();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    notifications
      .filter(n => new Date(n.createdAt).getTime() > oneDayAgo)
      .forEach(n => ids.add(n.shareId));
    return ids;
  }, [notifications]);




  // ─── Load reports ───
  useEffect(() => {
    if (user) loadReports();
  }, [user?.id]);

  const loadReports = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ik_tag_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setReports(data);
        // Load shares for all reports
        loadAllShares(data.map(r => r.id));
      }
    } catch (e) {
      console.error('Error loading reports:', e);
    }
    setLoading(false);
  };

  const loadAllShares = async (reportIds: string[]) => {
    if (!user || reportIds.length === 0) return;
    try {
      const { data } = await supabase
        .from('ik_report_shares')
        .select('*')
        .in('report_id', reportIds)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        const grouped: Record<string, ReportShare[]> = {};
        data.forEach(share => {
          if (!grouped[share.report_id]) grouped[share.report_id] = [];
          grouped[share.report_id].push(share);
        });
        setReportShares(grouped);
      }
    } catch (e) {
      console.error('Error loading shares:', e);
    }
  };

  // ─── Delete report ───
  const handleDelete = async (reportId: string) => {
    setDeleteLoading(true);
    try {
      const { error } = await supabase.from('ik_tag_reports').delete().eq('id', reportId);
      if (!error) {
        setReports(prev => prev.filter(r => r.id !== reportId));
        if (compareA === reportId) setCompareA(null);
        if (compareB === reportId) setCompareB(null);
      }
    } catch (e) {
      console.error('Error deleting report:', e);
    }
    setDeleteConfirm(null);
    setDeleteLoading(false);
  };

  // ─── Re-download handlers ───
  const handleRedownloadPDF = useCallback((report: SavedReport) => {
    openTagReport(report.report_data);
  }, []);

  const handleRedownloadText = useCallback((report: SavedReport) => {
    downloadTagReportAsText(report.report_data);
  }, []);

  // ─── Share handlers ───
  const handleShare = async (reportId: string) => {
    if (!user) return;
    setShareReportId(reportId);
    setShareLoading(true);
    setShareError(null);
    setShareResult(null);
    setCopiedLink(false);

    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'create', reportId, userId: user.id },
      });

      if (error || !data || data.error) {
        setShareError(data?.error || 'Kon deellink niet aanmaken');
        setShareLoading(false);
        return;
      }

      setShareResult({
        token: data.shareToken,
        expiresAt: data.expiresAt,
        isExisting: data.isExisting,
        shareId: data.shareId,
      });

      // Refresh shares for this report
      loadAllShares([reportId]);
    } catch (e) {
      console.error('Error creating share:', e);
      setShareError('Er ging iets mis bij het aanmaken van de deellink');
    }
    setShareLoading(false);
  };

  const handleCopyLink = () => {
    if (!shareResult) return;
    const shareUrl = `${window.location.origin}/share?token=${shareResult.token}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  const handleRevoke = async (shareId: string) => {
    if (!user) return;
    setRevokeLoading(shareId);
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'revoke', shareId, userId: user.id },
      });

      if (!error && data?.success) {
        // Update local state
        setReportShares(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(rid => {
            updated[rid] = updated[rid].map(s =>
              s.id === shareId ? { ...s, revoked: true } : s
            );
          });
          return updated;
        });
        // If this was the currently shown share, close the panel
        if (shareResult?.shareId === shareId) {
          setShareReportId(null);
          setShareResult(null);
        }
      }
    } catch (e) {
      console.error('Error revoking share:', e);
    }
    setRevokeLoading(null);
  };

  const closeSharePanel = () => {
    setShareReportId(null);
    setShareResult(null);
    setShareError(null);
    setCopiedLink(false);
  };

  // ─── Get active share count for a report ───
  const getActiveShareCount = (reportId: string): number => {
    const shares = reportShares[reportId] || [];
    return shares.filter(s => !s.revoked && new Date(s.expires_at) > new Date()).length;

  };

  // ─── Flattened shares list for Gedeelde links view ───
  const allSharesFlat = useMemo((): FlatShare[] => {
    const flat: FlatShare[] = [];
    const reportMap = new Map(reports.map(r => [r.id, r]));
    Object.entries(reportShares).forEach(([reportId, shares]) => {
      const report = reportMap.get(reportId);
      if (!report) return;
      shares.forEach(share => {
        flat.push({
          ...share,
          report_id: reportId,
          report_title: report.title || 'Tag Rapport',
          report_created_at: report.created_at,
          report_tag_count: report.unique_tag_count,
          report_sessions_count: report.sessions_count,
        });
      });
    });
    flat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return flat;
  }, [reportShares, reports]);

  // ─── Filtered shares for Gedeelde links view ───
  const filteredShares = useMemo(() => {
    const now = new Date();
    switch (shareFilter) {
      case 'active':
        return allSharesFlat.filter(s => !s.revoked && new Date(s.expires_at) > now);
      case 'revoked':
        return allSharesFlat.filter(s => s.revoked);
      case 'expired':
        return allSharesFlat.filter(s => !s.revoked && new Date(s.expires_at) <= now);
      default:
        return allSharesFlat;
    }
  }, [allSharesFlat, shareFilter]);

  // ─── Share counts for filter badges ───
  const shareCounts = useMemo(() => {
    const now = new Date();
    return {
      all: allSharesFlat.length,
      active: allSharesFlat.filter(s => !s.revoked && new Date(s.expires_at) > now).length,
      revoked: allSharesFlat.filter(s => s.revoked).length,
      expired: allSharesFlat.filter(s => !s.revoked && new Date(s.expires_at) <= now).length,
    };
  }, [allSharesFlat]);

  // ─── Copy share link from Gedeelde links view ───
  const handleCopyShareLink = (token: string) => {
    const shareUrl = `${window.location.origin}/share?token=${token}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedShareToken(token);
      setTimeout(() => setCopiedShareToken(null), 3000);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedShareToken(token);
      setTimeout(() => setCopiedShareToken(null), 3000);
    });
  };

  // ─── Get share status label and color ───
  const getShareStatus = (share: FlatShare): { label: string; color: string; bgColor: string; borderColor: string } => {
    if (share.revoked) return { label: 'Ingetrokken', color: 'text-rose-600/70', bgColor: 'bg-rose-50', borderColor: 'border-rose-200/20' };
    if (new Date(share.expires_at) <= new Date()) return { label: 'Verlopen', color: 'text-amber-600/70', bgColor: 'bg-amber-50', borderColor: 'border-amber-200/20' };
    return { label: 'Actief', color: 'text-emerald-600/70', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200/20' };
  };


  // ─── Comparison data ───
  const comparison = useMemo(() => {
    if (!compareA || !compareB) return null;
    const reportA = reports.find(r => r.id === compareA);
    const reportB = reports.find(r => r.id === compareB);
    if (!reportA || !reportB) return null;
    const older = new Date(reportA.created_at) < new Date(reportB.created_at) ? reportA : reportB;
    const newer = older === reportA ? reportB : reportA;
    return { older, newer, result: compareReports(older.report_data, newer.report_data) };
  }, [compareA, compareB, reports]);

  const toggleCompare = (reportId: string) => {
    if (compareA === reportId) setCompareA(null);
    else if (compareB === reportId) setCompareB(null);
    else if (!compareA) setCompareA(reportId);
    else if (!compareB) setCompareB(reportId);
    else { setCompareA(compareB); setCompareB(reportId); }
  };

  // ─── Sub-components ───
  const DiffBadge: React.FC<{ value: number; suffix?: string }> = ({ value, suffix = '' }) => {
    if (value === 0) return <span className="text-[10px] text-anthracite-soft/40 font-sans">=</span>;
    const isPositive = value > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-sans font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
        {isPositive ? '+' : ''}{value}{suffix}
      </span>
    );
  };

  const TrendArrow: React.FC<{ direction: 'up' | 'down' | 'stable'; size?: number }> = ({ direction, size = 10 }) => {
    if (direction === 'up') return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
        <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
      </svg>
    );
    if (direction === 'down') return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
        <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
      </svg>
    );
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 rounded-full bg-violet-200/50 animate-breathe" />
      </div>
    );
  }

  // ─── Empty state ───
  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-2xl bg-violet-100/40 border border-violet-200/25 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400/60">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <h3 className="font-serif text-lg text-anthracite mb-1">Nog geen rapporten</h3>
        <p className="text-sm text-anthracite-soft/50 font-sans max-w-xs mx-auto leading-relaxed">
          Genereer een tag rapport vanuit je sessieoverzicht om het hier terug te vinden. Rapporten worden automatisch opgeslagen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-gentle-fade">
      {/* ─── Header with view toggle ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg text-anthracite">Mijn Rapporten</h3>
          <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">
            {reports.length} rapport{reports.length !== 1 ? 'en' : ''} opgeslagen
          </p>
        </div>
        <div className="flex items-center gap-1 bg-sand-dark/8 rounded-lg p-0.5">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all duration-200 ${
              view === 'list' ? 'bg-warm-white text-anthracite shadow-sm' : 'text-anthracite-soft/50 hover:text-anthracite-soft'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Overzicht
          </button>
          <button
            onClick={() => setView('compare')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all duration-200 ${
              view === 'compare' ? 'bg-warm-white text-anthracite shadow-sm' : 'text-anthracite-soft/50 hover:text-anthracite-soft'
            }`}
            disabled={reports.length < 2}
            title={reports.length < 2 ? 'Minimaal 2 rapporten nodig om te vergelijken' : 'Vergelijk twee rapporten'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Vergelijken
          </button>
          <button
            onClick={() => setView('shares')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans transition-all duration-200 relative ${
              view === 'shares' ? 'bg-warm-white text-anthracite shadow-sm' : 'text-anthracite-soft/50 hover:text-anthracite-soft'
            }`}
            title="Beheer alle gedeelde links"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Gedeelde links
            {/* Notification badge: prioritize unread count, fallback to active count */}
            {unreadCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-sans font-bold flex items-center justify-center shadow-sm animate-pulse">
                {unreadCount}
              </span>
            ) : shareCounts.active > 0 ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[8px] font-sans font-bold flex items-center justify-center">
                {shareCounts.active}
              </span>
            ) : null}
          </button>

        </div>
      </div>


      {/* ─── SHARE PANEL (overlay) ─── */}
      {shareReportId && (
        <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200/30 animate-gentle-fade">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <h4 className="text-sm font-sans font-medium text-anthracite">Deel met coach</h4>
            </div>
            <button onClick={closeSharePanel} className="p-1.5 rounded-lg hover:bg-indigo-100/50 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {shareLoading && (
            <div className="flex items-center gap-2 py-3">
              <div className="w-4 h-4 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
              <span className="text-xs text-anthracite-soft/60 font-sans">Deellink aanmaken...</span>
            </div>
          )}

          {shareError && (
            <div className="px-3 py-2 rounded-lg bg-rose-50/60 border border-rose-200/30 mb-3">
              <p className="text-xs text-rose-600 font-sans">{shareError}</p>
            </div>
          )}

          {shareResult && (
            <div className="space-y-3">
              {shareResult.isExisting && (
                <p className="text-[10px] text-indigo-500/70 font-sans">Er bestaat al een actieve deellink voor dit rapport.</p>
              )}

              {/* Copy link area */}
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-lg bg-white border border-indigo-200/30 text-xs font-mono text-anthracite-soft/70 truncate select-all">
                  {window.location.origin}/share?token={shareResult.token}
                </div>
                <button
                  onClick={handleCopyLink}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-sans font-medium transition-all duration-200 ${
                    copiedLink
                      ? 'bg-emerald-500 text-white'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {copiedLink ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Gekopieerd
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Kopieer link
                    </>
                  )}
                </button>
              </div>

              {/* Expiry info */}
              <div className="flex items-center gap-2 text-[10px] text-anthracite-soft/50 font-sans">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Verloopt over {daysUntil(shareResult.expiresAt)} dagen ({formatShortDate(shareResult.expiresAt)})</span>
              </div>

              {/* Info text */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100/30">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400/60 flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-[10px] text-anthracite-soft/50 font-sans leading-relaxed">
                  Je coach kan dit rapport bekijken zonder in te loggen. De link is 30 dagen geldig. Je kunt de toegang op elk moment intrekken.
                </p>
              </div>
            </div>
          )}

          {/* Active shares for this report */}
          {(() => {
            const shares = (reportShares[shareReportId] || []).filter(s => !s.revoked && new Date(s.expires_at) > new Date());
            if (shares.length === 0) return null;
            return (
              <div className="mt-3 pt-3 border-t border-indigo-200/20">
                <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-2">Actieve deellinks</p>
                <div className="space-y-1.5">
                  {shares.map(share => (
                    <div key={share.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/60 border border-indigo-100/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-anthracite-soft/50 font-sans truncate">
                          ...{share.share_token.slice(-8)}
                        </span>
                        {share.accessed_at && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/20 text-emerald-600/70 font-sans flex-shrink-0">
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                            Bekeken
                          </span>
                        )}
                        <span className="text-[9px] text-anthracite-soft/30 font-sans flex-shrink-0">
                          {daysUntil(share.expires_at)}d resterend
                        </span>
                      </div>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        disabled={revokeLoading === share.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-sans text-rose-500/70 hover:text-rose-600 hover:bg-rose-50/50 transition-colors disabled:opacity-50"
                      >
                        {revokeLoading === share.id ? (
                          <div className="w-3 h-3 rounded-full border border-rose-300 border-t-rose-500 animate-spin" />
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                        Intrekken
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── LIST VIEW ─── */}
      {view === 'list' && (
        <div className="space-y-3">
          {reports.map((report) => {
            const activeShares = getActiveShareCount(report.id);
            const isAutoReport = report.title?.startsWith('Auto-rapport');

            return (
              <div
                key={report.id}
                className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/12 hover:border-violet-200/30 transition-all duration-200 group"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isAutoReport
                          ? 'bg-emerald-100/50 border border-emerald-200/25'
                          : 'bg-violet-100/50 border border-violet-200/25'
                      }`}>
                        {isAutoReport ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500/70">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/70">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-sans font-medium text-anthracite truncate">
                            {report.title || 'Tag Rapport'}
                          </h4>
                          {isAutoReport && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-100/50 border border-emerald-200/20 text-emerald-600/70 font-sans flex-shrink-0">
                              AUTO
                            </span>
                          )}
                          {activeShares > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-100/50 border border-indigo-200/20 text-indigo-600/70 font-sans flex-shrink-0">
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                              </svg>
                              Gedeeld
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-anthracite-soft/40 font-sans">
                          {timeAgo(report.created_at)} — {formatShortDate(report.created_at)}
                        </p>
                      </div>
                    </div>

                    {/* Stats pills */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-50/50 border border-violet-200/20 text-violet-600/70 font-sans">
                        <TagIcon size={8} className="opacity-50" />
                        {report.unique_tag_count} tags
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-sand-dark/6 border border-sand-dark/10 text-anthracite-soft/50 font-sans">
                        {report.total_tag_usages}x gebruikt
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-sand-dark/6 border border-sand-dark/10 text-anthracite-soft/50 font-sans">
                        {report.sessions_count} sessies
                      </span>
                      {(report.rising_tags || []).length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50/50 border border-emerald-200/20 text-emerald-600/70 font-sans">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                          </svg>
                          {report.rising_tags.length} stijgend
                        </span>
                      )}
                      {(report.falling_tags || []).length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-50/50 border border-rose-200/20 text-rose-500/70 font-sans">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                          </svg>
                          {report.falling_tags.length} dalend
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Share button */}
                    <button
                      onClick={() => handleShare(report.id)}
                      className={`p-2 rounded-lg transition-colors group/btn ${
                        shareReportId === report.id
                          ? 'bg-indigo-100/60 text-indigo-600'
                          : 'hover:bg-indigo-50/60'
                      }`}
                      title="Deel met coach"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={shareReportId === report.id ? 'text-indigo-600' : 'text-anthracite-soft/40 group-hover/btn:text-indigo-600 transition-colors'}>
                        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRedownloadPDF(report)}
                      className="p-2 rounded-lg hover:bg-violet-50/60 transition-colors group/btn"
                      title="Openen als afdrukbaar rapport"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40 group-hover/btn:text-violet-600 transition-colors">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRedownloadText(report)}
                      className="p-2 rounded-lg hover:bg-sand-dark/8 transition-colors group/btn"
                      title="Download als tekstbestand"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40 group-hover/btn:text-anthracite transition-colors">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(report.id)}
                      className="p-2 rounded-lg hover:bg-rose-50/60 transition-colors group/btn"
                      title="Rapport verwijderen"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30 group-hover/btn:text-rose-500 transition-colors">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Delete confirmation */}
                {deleteConfirm === report.id && (
                  <div className="mt-3 pt-3 border-t border-sand-dark/10 flex items-center justify-between animate-gentle-fade">
                    <p className="text-xs text-rose-600/70 font-sans">Dit rapport permanent verwijderen?</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 rounded-lg text-xs font-sans text-anthracite-soft hover:text-anthracite transition-colors">
                        Annuleren
                      </button>
                      <button
                        onClick={() => handleDelete(report.id)}
                        disabled={deleteLoading}
                        className="px-3 py-1.5 rounded-lg text-xs font-sans bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
                      >
                        {deleteLoading ? 'Verwijderen...' : 'Verwijderen'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── COMPARE VIEW ─── */}
      {view === 'compare' && (
        <div className="space-y-4 animate-gentle-fade">
          <div className="px-4 py-3 rounded-xl bg-violet-50/30 border border-violet-100/30">
            <div className="flex items-start gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/40 flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p className="text-xs text-anthracite-soft/60 font-sans leading-relaxed">
                Selecteer twee rapporten om te vergelijken. Het oudere rapport wordt als referentiepunt gebruikt.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {reports.map((report) => {
              const isSelectedA = compareA === report.id;
              const isSelectedB = compareB === report.id;
              const isSelected = isSelectedA || isSelectedB;
              const selectionLabel = isSelectedA ? 'A' : isSelectedB ? 'B' : null;

              return (
                <button
                  key={report.id}
                  onClick={() => toggleCompare(report.id)}
                  className={`text-left p-3.5 rounded-xl border transition-all duration-200 ${
                    isSelected
                      ? 'bg-violet-50/60 border-violet-300/40 shadow-sm ring-1 ring-violet-200/30'
                      : 'bg-warm-white/60 border-sand-dark/12 hover:border-violet-200/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {isSelected && (
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold font-sans ${
                        isSelectedA ? 'bg-violet-500 text-white' : 'bg-indigo-500 text-white'
                      }`}>{selectionLabel}</span>
                    )}
                    <span className="text-xs font-sans font-medium text-anthracite truncate">{report.title || 'Tag Rapport'}</span>
                    <span className="text-[10px] text-anthracite-soft/35 font-sans ml-auto flex-shrink-0">{formatShortDate(report.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-anthracite-soft/45 font-sans">
                    <span>{report.unique_tag_count} tags</span>
                    <span className="text-anthracite-soft/20">|</span>
                    <span>{report.sessions_count} sessies</span>
                    <span className="text-anthracite-soft/20">|</span>
                    <span>{report.total_tag_usages}x</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ─── Comparison Results ─── */}
          {comparison && (
            <div className="mt-4 space-y-4 animate-gentle-fade">
              <div className="flex items-center gap-3 px-1">
                <div className="flex-1 text-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500 text-white text-[10px] font-sans font-medium">A</span>
                  <p className="text-[10px] text-anthracite-soft/50 font-sans mt-1">{formatShortDate(comparison.older.created_at)}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/25 flex-shrink-0">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
                <div className="flex-1 text-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500 text-white text-[10px] font-sans font-medium">B</span>
                  <p className="text-[10px] text-anthracite-soft/50 font-sans mt-1">{formatShortDate(comparison.newer.created_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { labelA: comparison.older.report_data.uniqueTagCount, labelB: comparison.newer.report_data.uniqueTagCount, diff: comparison.result.statsComparison.uniqueTagsDiff, name: 'Unieke tags' },
                  { labelA: comparison.older.report_data.totalTagUsages, labelB: comparison.newer.report_data.totalTagUsages, diff: comparison.result.statsComparison.totalUsagesDiff, name: 'Totaal gebruikt' },
                  { labelA: comparison.older.report_data.totalSessions, labelB: comparison.newer.report_data.totalSessions, diff: comparison.result.statsComparison.sessionsDiff, name: 'Sessies' },
                ].map(({ labelA, labelB, diff, name }) => (
                  <div key={name} className="p-3 rounded-xl bg-warm-white/60 border border-sand-dark/10 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg font-serif text-anthracite">{labelA}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/25">
                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="text-lg font-serif text-anthracite">{labelB}</span>
                    </div>
                    <DiffBadge value={diff} />
                    <p className="text-[9px] text-anthracite-soft/35 font-sans mt-0.5 uppercase tracking-wider">{name}</p>
                  </div>
                ))}
              </div>

              {comparison.result.newTags.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-50/30 border border-emerald-200/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className="text-xs font-sans font-medium text-emerald-700/70">Nieuwe tags in B</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {comparison.result.newTags.map(({ tag, count }) => (
                      <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100/50 border border-emerald-200/30 text-emerald-700/70 font-sans">
                        <TagIcon size={8} className="opacity-50" />{tag} <span className="opacity-50">{count}x</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {comparison.result.removedTags.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-50/30 border border-rose-200/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className="text-xs font-sans font-medium text-rose-600/70">Verdwenen tags in B</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {comparison.result.removedTags.map(({ tag, count }) => (
                      <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-100/50 border border-rose-200/30 text-rose-600/70 font-sans">
                        <TagIcon size={8} className="opacity-50" />{tag} <span className="opacity-50">{count}x</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {comparison.result.commonTags.length > 0 && (
                <div className="p-3.5 rounded-xl bg-warm-white/60 border border-sand-dark/12">
                  <div className="flex items-center gap-1.5 mb-3">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/50">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                    </svg>
                    <span className="text-xs font-sans font-medium text-anthracite">Frequentieveranderingen</span>
                  </div>
                  <div className="space-y-1.5">
                    {comparison.result.commonTags.slice(0, 12).map(({ tag, countA, countB, change }) => {
                      const maxCount = Math.max(countA, countB);
                      const pctA = (countA / maxCount) * 100;
                      const pctB = (countB / maxCount) * 100;
                      return (
                        <div key={tag} className="flex items-center gap-2">
                          <span className="text-[10px] text-anthracite-soft/70 font-sans w-20 truncate text-right flex-shrink-0">{tag}</span>
                          <div className="flex-1 flex items-center gap-1">
                            <div className="flex-1 h-3 bg-sand-dark/6 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-300/50 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctA, 4)}%` }} />
                            </div>
                            <div className="flex-1 h-3 bg-sand-dark/6 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-300/50 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctB, 4)}%` }} />
                            </div>
                          </div>
                          <div className="w-16 flex items-center justify-end gap-1 flex-shrink-0">
                            <span className="text-[9px] text-anthracite-soft/40 font-sans">{countA}</span>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/20">
                              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                            </svg>
                            <span className="text-[9px] text-anthracite-soft/40 font-sans">{countB}</span>
                            <DiffBadge value={change} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {comparison.result.trendChanges.length > 0 && (
                <div className="p-3.5 rounded-xl bg-violet-50/20 border border-violet-100/25">
                  <div className="flex items-center gap-1.5 mb-3">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/50">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <span className="text-xs font-sans font-medium text-anthracite">Trendveranderingen</span>
                  </div>
                  <div className="space-y-1.5">
                    {comparison.result.trendChanges.map(({ tag, directionA, directionB }) => (
                      <div key={tag} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warm-white/60">
                        <TagIcon size={9} className="text-violet-400/50 flex-shrink-0" />
                        <span className="text-xs text-anthracite-soft/70 font-sans flex-1">{tag}</span>
                        <div className="flex items-center gap-1.5">
                          <TrendArrow direction={directionA} size={10} />
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/20">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                          </svg>
                          <TrendArrow direction={directionB} size={10} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-violet-50/30 border border-violet-100/30">
                <div className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/40 flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <p className="text-xs text-anthracite-soft/60 font-sans leading-relaxed">
                    {comparison.result.newTags.length > 0 && comparison.result.removedTags.length > 0 ? (
                      <>Tussen deze twee rapporten zijn <span className="font-medium text-emerald-700/80">{comparison.result.newTags.length} nieuwe tag{comparison.result.newTags.length !== 1 ? 's' : ''}</span> verschenen en <span className="font-medium text-rose-600/80">{comparison.result.removedTags.length} tag{comparison.result.removedTags.length !== 1 ? 's' : ''}</span> verdwenen. Dit laat zien hoe je therapeutische focus verschuift over tijd.</>
                    ) : comparison.result.newTags.length > 0 ? (
                      <>Er zijn <span className="font-medium text-emerald-700/80">{comparison.result.newTags.length} nieuwe tag{comparison.result.newTags.length !== 1 ? 's' : ''}</span> bijgekomen. Dit kan wijzen op een verbreding van je zelfbewustzijn en nieuwe thema's die je verkent.</>
                    ) : comparison.result.removedTags.length > 0 ? (
                      <>Er zijn <span className="font-medium text-rose-600/80">{comparison.result.removedTags.length} tag{comparison.result.removedTags.length !== 1 ? 's' : ''}</span> verdwenen uit het nieuwere rapport. Dit kan betekenen dat je vooruitgang hebt geboekt op die gebieden.</>
                    ) : (
                      <>Dezelfde tags komen voor in beide rapporten. Bekijk de frequentieveranderingen om te zien welke thema's meer of minder aandacht krijgen.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!comparison && (compareA || compareB) && (
            <div className="text-center py-6">
              <p className="text-xs text-anthracite-soft/40 font-sans">
                Selecteer nog {!compareA && !compareB ? '2 rapporten' : '1 rapport'} om te vergelijken
              </p>
            </div>
          )}

          {!comparison && !compareA && !compareB && (
            <div className="text-center py-6">
              <p className="text-xs text-anthracite-soft/40 font-sans">
                Klik op twee rapporten hierboven om ze te vergelijken
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── GEDEELDE LINKS VIEW ─── */}
      {view === 'shares' && (
        <div className="space-y-4 animate-gentle-fade">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-2">
            {([
              { key: 'all' as ShareFilter, label: 'Totaal', count: shareCounts.all, color: 'text-anthracite', bg: 'bg-sand-dark/6', border: 'border-sand-dark/10' },
              { key: 'active' as ShareFilter, label: 'Actief', count: shareCounts.active, color: 'text-emerald-600', bg: 'bg-emerald-50/50', border: 'border-emerald-200/20' },
              { key: 'revoked' as ShareFilter, label: 'Ingetrokken', count: shareCounts.revoked, color: 'text-rose-500', bg: 'bg-rose-50/50', border: 'border-rose-200/20' },
              { key: 'expired' as ShareFilter, label: 'Verlopen', count: shareCounts.expired, color: 'text-amber-600', bg: 'bg-amber-50/50', border: 'border-amber-200/20' },
            ]).map(({ key, label, count, color, bg, border }) => (
              <button
                key={key}
                onClick={() => setShareFilter(key)}
                className={`p-2.5 rounded-xl border text-center transition-all duration-200 ${
                  shareFilter === key
                    ? `${bg} ${border} ring-1 ring-offset-0 ${key === 'active' ? 'ring-emerald-200/40' : key === 'revoked' ? 'ring-rose-200/40' : key === 'expired' ? 'ring-amber-200/40' : 'ring-sand-dark/15'} shadow-sm`
                    : 'bg-warm-white/40 border-sand-dark/8 hover:border-sand-dark/15'
                }`}
              >
                <span className={`text-lg font-serif ${shareFilter === key ? color : 'text-anthracite-soft/60'}`}>{count}</span>
                <p className={`text-[9px] font-sans mt-0.5 uppercase tracking-wider ${shareFilter === key ? `${color} opacity-70` : 'text-anthracite-soft/35'}`}>{label}</p>
              </button>
            ))}
          </div>

          {/* Info banner */}
          <div className="px-4 py-3 rounded-xl bg-indigo-50/30 border border-indigo-100/25">
            <div className="flex items-start gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400/50 flex-shrink-0 mt-0.5">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <p className="text-xs text-anthracite-soft/55 font-sans leading-relaxed">
                Overzicht van alle deellinks die je hebt aangemaakt. Beheer de toegang tot je rapporten vanuit één plek.
              </p>
            </div>
          </div>

          {/* ─── Notification Feed ─── */}
          {notifications.length > 0 && (
            <div className="rounded-xl border border-emerald-200/25 bg-emerald-50/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-200/15">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500/60">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="text-xs font-sans font-medium text-anthracite">Meldingen</span>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-sans font-bold">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={() => {
                      notifications.forEach(n => dismissNotification(n.id));
                    }}
                    className="text-[10px] font-sans text-anthracite-soft/40 hover:text-anthracite-soft/60 transition-colors"
                  >
                    Alles wissen
                  </button>
                )}
              </div>
              <div className="divide-y divide-emerald-200/10 max-h-[200px] overflow-y-auto">
                {notifications.slice(0, 10).map((notif) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                      notif.read ? 'bg-transparent' : 'bg-emerald-50/40'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      notif.read ? 'bg-emerald-100/30' : 'bg-emerald-100/60'
                    }`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={notif.read ? 'text-emerald-400/40' : 'text-emerald-500/70'}>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-sans leading-relaxed ${notif.read ? 'text-anthracite-soft/50' : 'text-anthracite'}`}>
                        <span className="font-medium">Rapport bekeken</span>
                        {' — '}
                        <span className={notif.read ? 'text-anthracite-soft/40' : 'text-anthracite-soft/70'}>
                          "{notif.reportTitle}"
                        </span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-anthracite-soft/35 font-sans">
                          {timeAgo(notif.accessedAt)}
                        </span>
                        {!notif.read && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600/80 font-sans font-medium">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            Nieuw
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => dismissNotification(notif.id)}
                      className="p-1 rounded-md hover:bg-emerald-100/40 transition-colors flex-shrink-0"
                      title="Melding verwijderen"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/25 hover:text-anthracite-soft/50">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {notifications.length > 10 && (
                <div className="px-4 py-2 border-t border-emerald-200/15 text-center">
                  <span className="text-[10px] text-anthracite-soft/35 font-sans">
                    +{notifications.length - 10} eerdere meldingen
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ─── Share Expiration Manager ─── */}
          <ShareExpirationManager
            shares={allSharesFlat}
            onSharesUpdated={() => loadAllShares(reports.map(r => r.id))}
          />

          {/* Share analytics */}
          <ShareAnalytics shares={allSharesFlat} />



          {/* Share cards */}

          {filteredShares.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50/40 border border-indigo-200/20 flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300/60">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <p className="text-sm text-anthracite-soft/50 font-sans">
                {shareFilter === 'all' ? 'Nog geen deellinks aangemaakt' :
                 shareFilter === 'active' ? 'Geen actieve deellinks' :
                 shareFilter === 'revoked' ? 'Geen ingetrokken deellinks' :
                 'Geen verlopen deellinks'}
              </p>
              <p className="text-xs text-anthracite-soft/35 font-sans mt-1">
                {shareFilter === 'all' ? 'Deel een rapport met je coach vanuit het overzicht.' : 'Probeer een ander filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredShares.map((share) => {
                const status = getShareStatus(share);
                const remaining = daysUntil(share.expires_at);
                const isActive = !share.revoked && remaining > 0;
                const isCopied = copiedShareToken === share.share_token;

                return (
                  <div
                    key={share.id}
                    className={`p-4 rounded-xl border transition-all duration-200 ${
                      share.revoked
                        ? 'bg-rose-50/20 border-rose-200/15 opacity-70'
                        : remaining <= 0
                        ? 'bg-amber-50/20 border-amber-200/15 opacity-70'
                        : 'bg-warm-white/60 border-sand-dark/12 hover:border-indigo-200/30'
                    }`}
                  >
                    {/* Top row: report info + status */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100/40 border border-indigo-200/20 flex items-center justify-center flex-shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500/60">
                            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-sans font-medium text-anthracite truncate">{share.report_title}</h4>
                          <p className="text-[10px] text-anthracite-soft/40 font-sans">
                            Rapport van {formatShortDate(share.report_created_at)} — {share.report_tag_count} tags, {share.report_sessions_count} sessies
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${status.bgColor} border ${status.borderColor} ${status.color} font-sans font-medium flex-shrink-0`}>
                        {status.label === 'Actief' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {status.label}
                      </span>
                    </div>

                    {/* Details row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 pl-[42px]">
                      <div className="flex items-center gap-1.5 text-[10px] text-anthracite-soft/45 font-sans">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        Aangemaakt {timeAgo(share.created_at)}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-sans">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={remaining > 7 ? 'text-anthracite-soft/45' : remaining > 0 ? 'text-amber-500/70' : 'text-rose-400/70'}>
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className={remaining > 7 ? 'text-anthracite-soft/45' : remaining > 0 ? 'text-amber-600/70' : 'text-rose-500/70'}>
                          {share.revoked ? 'Toegang ingetrokken' : remaining > 0 ? `Verloopt over ${remaining} ${remaining === 1 ? 'dag' : 'dagen'}` : `Verlopen ${timeAgo(share.expires_at)}`}
                        </span>
                      </div>

                      {/* Accessed status */}
                      <div className="flex items-center gap-1.5 text-[10px] font-sans">
                        {share.accessed_at ? (
                          <>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500/60">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                            <span className="text-emerald-600/60">Bekeken op {formatDate(share.accessed_at)}</span>
                          </>
                        ) : (
                          <>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            <span className="text-anthracite-soft/35">Nog niet bekeken</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-2 pl-[42px]">
                      {isActive && (
                        <>
                          <button
                            onClick={() => handleCopyShareLink(share.share_token)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans font-medium transition-all duration-200 ${
                              isCopied
                                ? 'bg-emerald-500 text-white'
                                : 'bg-indigo-50/60 border border-indigo-200/25 text-indigo-600/80 hover:bg-indigo-100/60'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Gekopieerd
                              </>
                            ) : (
                              <>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                Kopieer link
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleRevoke(share.id)}
                            disabled={revokeLoading === share.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans text-rose-500/60 hover:text-rose-600 hover:bg-rose-50/50 border border-transparent hover:border-rose-200/20 transition-all duration-200 disabled:opacity-50"
                          >
                            {revokeLoading === share.id ? (
                              <div className="w-3 h-3 rounded-full border border-rose-300 border-t-rose-500 animate-spin" />
                            ) : (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                            )}
                            Intrekken
                          </button>
                        </>
                      )}

                      {/* Token preview */}
                      <span className="text-[9px] text-anthracite-soft/25 font-mono ml-auto">
                        ...{share.share_token.slice(-10)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MijnRapporten;
