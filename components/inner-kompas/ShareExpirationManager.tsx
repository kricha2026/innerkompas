import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

interface ShareExpirationManagerProps {
  shares: FlatShare[];
  onSharesUpdated: () => void;
}

type ExpiryPreset = '24h' | '7d' | '30d' | '90d' | 'custom';
type BatchAction = 'extend' | 'revoke';

const EXPIRY_PRESETS: { value: ExpiryPreset; label: string; hours: number; description: string }[] = [
  { value: '24h', label: '24 uur', hours: 24, description: 'Korte toegang' },
  { value: '7d', label: '7 dagen', hours: 168, description: 'Eén week' },
  { value: '30d', label: '30 dagen', hours: 720, description: 'Standaard' },
  { value: '90d', label: '90 dagen', hours: 2160, description: 'Verlengd' },
];

// ─── Helpers ───
function formatCountdown(expiresAt: string): { text: string; urgency: 'normal' | 'warning' | 'critical' | 'expired' } {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) return { text: 'Verlopen', urgency: 'expired' };

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  let text: string;
  if (days > 7) {
    text = `${days} dagen`;
  } else if (days > 0) {
    text = `${days}d ${remainingHours}u`;
  } else if (hours > 0) {
    text = `${hours}u ${minutes}m`;
  } else {
    text = `${minutes}m`;
  }

  let urgency: 'normal' | 'warning' | 'critical' | 'expired';
  if (hours < 2) urgency = 'critical';
  else if (hours < 24) urgency = 'warning';
  else urgency = 'normal';

  return { text, urgency };
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMin < 60) return `${diffMin} min geleden`;
  if (diffHrs < 24) return `${diffHrs} uur geleden`;
  if (diffDays === 1) return 'Gisteren';
  return `${diffDays} dagen geleden`;
}

// ─── SVG Icons ───
const ClockIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const CheckIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const RefreshIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const ArchiveIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

// ─── Main Component ───
const ShareExpirationManager: React.FC<ShareExpirationManagerProps> = ({ shares, onSharesUpdated }) => {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchExtendHours, setBatchExtendHours] = useState(720);
  const [showExpiredArchive, setShowExpiredArchive] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState<string | null>(null);
  const [reactivateHours, setReactivateHours] = useState(720);
  const [extendLoading, setExtendLoading] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState('');
  const [, setTick] = useState(0);

  // Default expiry preference
  const [defaultExpiry, setDefaultExpiry] = useState<number>(720);
  const [defaultExpiryLoading, setDefaultExpiryLoading] = useState(false);
  const [defaultExpirySaved, setDefaultExpirySaved] = useState(false);
  const [showDefaultExpiry, setShowDefaultExpiry] = useState(false);
  const [customHours, setCustomHours] = useState<number>(720);

  // Load default expiry preference
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('ik_notification_preferences')
        .select('default_share_expiry_hours')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.default_share_expiry_hours) {
        setDefaultExpiry(data.default_share_expiry_hours);
        setCustomHours(data.default_share_expiry_hours);
      }
    })();
  }, [user?.id]);

  // Tick every 60s for countdown updates
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // ─── Categorized shares ───
  const { activeShares, expiringShares, expiredShares, revokedShares } = useMemo(() => {
    const now = new Date();
    const active: FlatShare[] = [];
    const expiring: FlatShare[] = [];
    const expired: FlatShare[] = [];
    const revoked: FlatShare[] = [];

    shares.forEach(s => {
      if (s.revoked) {
        revoked.push(s);
      } else if (new Date(s.expires_at) <= now) {
        expired.push(s);
      } else {
        const hoursLeft = (new Date(s.expires_at).getTime() - now.getTime()) / 3600000;
        if (hoursLeft <= 48) {
          expiring.push(s);
        }
        active.push(s);
      }
    });

    return { activeShares: active, expiringShares: expiring, expiredShares: expired, revokedShares: revoked };
  }, [shares]);

  // ─── Selection handlers ───
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllActive = () => {
    setSelectedIds(new Set(activeShares.map(s => s.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBatchAction(null);
  };

  // ─── Batch extend ───
  const handleBatchExtend = async () => {
    if (!user || selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'batch-extend', shareIds: [...selectedIds], userId: user.id, extendByHours: batchExtendHours },
      });
      if (!error && data?.success) {
        setBatchSuccess(`${data.extended?.length || selectedIds.size} links verlengd`);
        setTimeout(() => setBatchSuccess(''), 3000);
        clearSelection();
        onSharesUpdated();
      }
    } catch (e) {
      console.error('Batch extend error:', e);
    }
    setBatchLoading(false);
  };

  // ─── Batch revoke ───
  const handleBatchRevoke = async () => {
    if (!user || selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'batch-revoke', shareIds: [...selectedIds], userId: user.id },
      });
      if (!error && data?.success) {
        setBatchSuccess(`${selectedIds.size} links ingetrokken`);
        setTimeout(() => setBatchSuccess(''), 3000);
        clearSelection();
        onSharesUpdated();
      }
    } catch (e) {
      console.error('Batch revoke error:', e);
    }
    setBatchLoading(false);
  };

  // ─── Single extend ───
  const handleExtend = async (shareId: string, hours: number) => {
    if (!user) return;
    setExtendLoading(shareId);
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'extend', shareId, userId: user.id, extendByHours: hours },
      });
      if (!error && data?.success) {
        onSharesUpdated();
      }
    } catch (e) {
      console.error('Extend error:', e);
    }
    setExtendLoading(null);
  };

  // ─── Reactivate ───
  const handleReactivate = async (shareId: string) => {
    if (!user) return;
    setReactivateLoading(shareId);
    try {
      const { data, error } = await supabase.functions.invoke('inner-kompas-share', {
        body: { action: 'reactivate', shareId, userId: user.id, expiresInHours: reactivateHours },
      });
      if (!error && data?.success) {
        onSharesUpdated();
      }
    } catch (e) {
      console.error('Reactivate error:', e);
    }
    setReactivateLoading(null);
  };

  // ─── Save default expiry ───
  const handleSaveDefaultExpiry = async (hours: number) => {
    if (!user) return;
    setDefaultExpiryLoading(true);
    try {
      const { data: existing } = await supabase
        .from('ik_notification_preferences')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('ik_notification_preferences')
          .update({ default_share_expiry_hours: hours, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('ik_notification_preferences')
          .insert({ user_id: user.id, default_share_expiry_hours: hours });
      }

      setDefaultExpiry(hours);
      setDefaultExpirySaved(true);
      setTimeout(() => setDefaultExpirySaved(false), 2500);
    } catch (e) {
      console.error('Save default expiry error:', e);
    }
    setDefaultExpiryLoading(false);
  };

  const getPresetForHours = (hours: number): ExpiryPreset => {
    const preset = EXPIRY_PRESETS.find(p => p.hours === hours);
    return preset?.value || 'custom';
  };

  return (
    <div className="space-y-4">
      {/* ═══ DEFAULT EXPIRY SETTINGS ═══ */}
      <div className="rounded-xl border border-violet-100/30 overflow-hidden">
        <button
          onClick={() => setShowDefaultExpiry(!showDefaultExpiry)}
          className="w-full flex items-center justify-between px-4 py-3 bg-violet-50/30 hover:bg-violet-50/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-100/60 border border-violet-200/25 flex items-center justify-center">
              <ClockIcon size={13} className="text-violet-500/70" />
            </div>
            <div className="text-left">
              <h4 className="text-sm font-sans font-medium text-anthracite">Standaard verlooptijd</h4>
              <p className="text-[10px] text-anthracite-soft/40 font-sans">
                Nieuwe deellinks verlopen na {defaultExpiry < 24 ? `${defaultExpiry} uur` : `${Math.round(defaultExpiry / 24)} dagen`}
              </p>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-anthracite-soft/30 transition-transform duration-200 ${showDefaultExpiry ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showDefaultExpiry && (
          <div className="px-4 py-4 bg-warm-white/30 border-t border-violet-100/20 animate-gentle-fade">
            <p className="text-xs text-anthracite-soft/50 font-sans mb-3">
              Kies hoe lang nieuwe deellinks standaard geldig zijn. Je kunt dit per link altijd aanpassen.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {EXPIRY_PRESETS.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => {
                    setCustomHours(preset.hours);
                    handleSaveDefaultExpiry(preset.hours);
                  }}
                  disabled={defaultExpiryLoading}
                  className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                    getPresetForHours(defaultExpiry) === preset.value
                      ? 'bg-violet-50/60 border-violet-300/40 ring-1 ring-violet-200/30'
                      : 'bg-warm-white/60 border-sand-dark/10 hover:border-violet-200/30'
                  }`}
                >
                  <span className={`text-sm font-serif ${getPresetForHours(defaultExpiry) === preset.value ? 'text-violet-700' : 'text-anthracite-soft/60'}`}>
                    {preset.label}
                  </span>
                  <p className={`text-[9px] font-sans mt-0.5 ${getPresetForHours(defaultExpiry) === preset.value ? 'text-violet-500/70' : 'text-anthracite-soft/35'}`}>
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>

            {/* Custom hours input */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-anthracite-soft/50 font-sans">Aangepast:</label>
              <input
                type="number"
                min={1}
                max={8760}
                value={customHours}
                onChange={e => setCustomHours(Number(e.target.value))}
                className="w-20 px-2 py-1.5 rounded-lg bg-warm-white border border-sand-dark/15 text-xs text-anthracite font-sans focus:outline-none focus:border-violet-300/50"
              />
              <span className="text-[10px] text-anthracite-soft/40 font-sans">uur</span>
              <button
                onClick={() => handleSaveDefaultExpiry(customHours)}
                disabled={defaultExpiryLoading || customHours === defaultExpiry}
                className="px-3 py-1.5 rounded-lg text-[11px] font-sans bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {defaultExpiryLoading ? (
                  <div className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                ) : 'Opslaan'}
              </button>
              {defaultExpirySaved && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-sans animate-gentle-fade">
                  <CheckIcon size={10} /> Opgeslagen
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ EXPIRING SOON ALERTS ═══ */}
      {expiringShares.length > 0 && (
        <div className="rounded-xl border border-amber-200/30 bg-amber-50/30 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2.5 border-b border-amber-200/20">
            <div className="w-6 h-6 rounded-lg bg-amber-100/60 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600/70">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-sans font-medium text-amber-800">Binnenkort verlopend</h4>
              <p className="text-[10px] text-amber-600/60 font-sans">{expiringShares.length} link{expiringShares.length !== 1 ? 's' : ''} verlo{expiringShares.length === 1 ? 'opt' : 'pen'} binnen 48 uur</p>
            </div>
          </div>
          <div className="divide-y divide-amber-200/15">
            {expiringShares.map(share => {
              const countdown = formatCountdown(share.expires_at);
              return (
                <div key={share.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Countdown timer */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-medium ${
                      countdown.urgency === 'critical'
                        ? 'bg-rose-100/60 text-rose-600 border border-rose-200/30 animate-pulse'
                        : 'bg-amber-100/60 text-amber-700 border border-amber-200/30'
                    }`}>
                      <ClockIcon size={10} className={countdown.urgency === 'critical' ? 'text-rose-500' : 'text-amber-600'} />
                      {countdown.text}
                    </div>
                    <span className="text-xs text-anthracite font-sans truncate">{share.report_title}</span>
                  </div>
                  <button
                    onClick={() => handleExtend(share.id, 168)}
                    disabled={extendLoading === share.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-sans bg-amber-100/60 border border-amber-200/30 text-amber-700 hover:bg-amber-200/60 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {extendLoading === share.id ? (
                      <div className="w-3 h-3 rounded-full border border-amber-400 border-t-amber-600 animate-spin" />
                    ) : (
                      <RefreshIcon size={10} className="text-amber-600" />
                    )}
                    +7 dagen
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ BATCH ACTIONS TOOLBAR ═══ */}
      {activeShares.length > 0 && (
        <div className="rounded-xl border border-indigo-100/25 bg-indigo-50/20 p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={selectedIds.size === activeShares.length ? clearSelection : selectAllActive}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-sans bg-warm-white/80 border border-indigo-200/25 text-indigo-600/80 hover:bg-indigo-50/60 transition-colors"
              >
                {selectedIds.size === activeShares.length ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Deselecteer alles
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    Selecteer alles ({activeShares.length})
                  </>
                )}
              </button>

              {selectedIds.size > 0 && (
                <span className="text-[10px] text-indigo-500/70 font-sans font-medium">
                  {selectedIds.size} geselecteerd
                </span>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                {/* Extend selected */}
                <div className="flex items-center gap-1">
                  <select
                    value={batchExtendHours}
                    onChange={e => setBatchExtendHours(Number(e.target.value))}
                    className="px-2 py-1.5 rounded-lg bg-warm-white border border-indigo-200/25 text-[11px] text-anthracite font-sans focus:outline-none focus:border-indigo-300/50"
                  >
                    <option value={24}>+24 uur</option>
                    <option value={168}>+7 dagen</option>
                    <option value={720}>+30 dagen</option>
                    <option value={2160}>+90 dagen</option>
                  </select>
                  <button
                    onClick={handleBatchExtend}
                    disabled={batchLoading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-sans bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-50"
                  >
                    {batchLoading && batchAction !== 'revoke' ? (
                      <div className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                    ) : (
                      <RefreshIcon size={10} className="text-white" />
                    )}
                    Verleng
                  </button>
                </div>

                {/* Revoke selected */}
                <button
                  onClick={handleBatchRevoke}
                  disabled={batchLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-sans bg-rose-50 border border-rose-200/30 text-rose-600 hover:bg-rose-100/60 transition-colors disabled:opacity-50"
                >
                  {batchLoading && batchAction === 'revoke' ? (
                    <div className="w-3 h-3 rounded-full border border-rose-300 border-t-rose-500 animate-spin" />
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}
                  Intrekken
                </button>

                <button onClick={clearSelection} className="p-1.5 rounded-lg hover:bg-indigo-100/40 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {batchSuccess && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 font-sans animate-gentle-fade">
              <CheckIcon size={11} className="text-emerald-500" />
              {batchSuccess}
            </div>
          )}

          {/* Selection checkboxes for active shares */}
          {selectedIds.size > 0 && (
            <div className="mt-3 space-y-1 max-h-[160px] overflow-y-auto">
              {activeShares.map(share => {
                const countdown = formatCountdown(share.expires_at);
                const isSelected = selectedIds.has(share.id);
                return (
                  <label
                    key={share.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/60' : 'hover:bg-sand-dark/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(share.id)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                      isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-sand-dark/25'
                    }`}>
                      {isSelected && <CheckIcon size={10} className="text-white" />}
                    </div>
                    <span className="text-xs text-anthracite font-sans truncate flex-1">{share.report_title}</span>
                    <span className={`text-[10px] font-mono ${
                      countdown.urgency === 'critical' ? 'text-rose-500' :
                      countdown.urgency === 'warning' ? 'text-amber-600' :
                      'text-anthracite-soft/40'
                    }`}>
                      {countdown.text}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ EXPIRED LINKS ARCHIVE ═══ */}
      {(expiredShares.length > 0 || revokedShares.length > 0) && (
        <div className="rounded-xl border border-sand-dark/12 overflow-hidden">
          <button
            onClick={() => setShowExpiredArchive(!showExpiredArchive)}
            className="w-full flex items-center justify-between px-4 py-3 bg-sand-dark/4 hover:bg-sand-dark/8 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sand-dark/8 border border-sand-dark/10 flex items-center justify-center">
                <ArchiveIcon size={13} className="text-anthracite-soft/40" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-sans font-medium text-anthracite">Archief</h4>
                <p className="text-[10px] text-anthracite-soft/40 font-sans">
                  {expiredShares.length} verlopen, {revokedShares.length} ingetrokken
                </p>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-anthracite-soft/30 transition-transform duration-200 ${showExpiredArchive ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showExpiredArchive && (
            <div className="border-t border-sand-dark/10 animate-gentle-fade">
              {/* Reactivation period selector */}
              <div className="px-4 py-3 bg-sand-dark/3 border-b border-sand-dark/8">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-anthracite-soft/50 font-sans">Heractiveer met verlooptijd:</span>
                  <select
                    value={reactivateHours}
                    onChange={e => setReactivateHours(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg bg-warm-white border border-sand-dark/15 text-[11px] text-anthracite font-sans focus:outline-none"
                  >
                    <option value={24}>24 uur</option>
                    <option value={168}>7 dagen</option>
                    <option value={720}>30 dagen</option>
                    <option value={2160}>90 dagen</option>
                  </select>
                </div>
              </div>

              {/* Expired shares */}
              {expiredShares.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-amber-50/20">
                    <span className="text-[9px] text-amber-600/60 font-sans uppercase tracking-wider font-medium">Verlopen ({expiredShares.length})</span>
                  </div>
                  <div className="divide-y divide-sand-dark/8">
                    {expiredShares.map(share => (
                      <div key={share.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-anthracite font-sans truncate">{share.report_title}</span>
                            {share.accessed_at && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/20 text-emerald-600/70 font-sans flex-shrink-0">
                                Bekeken
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-anthracite-soft/35 font-sans mt-0.5">
                            Verlopen {timeAgo(share.expires_at)} — Aangemaakt {formatShortDate(share.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleReactivate(share.id)}
                          disabled={reactivateLoading === share.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans bg-emerald-50 border border-emerald-200/25 text-emerald-700 hover:bg-emerald-100/60 transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          {reactivateLoading === share.id ? (
                            <div className="w-3 h-3 rounded-full border border-emerald-300 border-t-emerald-500 animate-spin" />
                          ) : (
                            <RefreshIcon size={10} className="text-emerald-600" />
                          )}
                          Heractiveer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Revoked shares */}
              {revokedShares.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-rose-50/20">
                    <span className="text-[9px] text-rose-500/60 font-sans uppercase tracking-wider font-medium">Ingetrokken ({revokedShares.length})</span>
                  </div>
                  <div className="divide-y divide-sand-dark/8">
                    {revokedShares.map(share => (
                      <div key={share.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-anthracite-soft/60 font-sans truncate">{share.report_title}</span>
                            {share.accessed_at && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/20 text-emerald-600/70 font-sans flex-shrink-0">
                                Was bekeken
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-anthracite-soft/30 font-sans mt-0.5">
                            Ingetrokken — Aangemaakt {formatShortDate(share.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleReactivate(share.id)}
                          disabled={reactivateLoading === share.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-sans bg-indigo-50 border border-indigo-200/25 text-indigo-600 hover:bg-indigo-100/60 transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          {reactivateLoading === share.id ? (
                            <div className="w-3 h-3 rounded-full border border-indigo-300 border-t-indigo-500 animate-spin" />
                          ) : (
                            <RefreshIcon size={10} className="text-indigo-500" />
                          )}
                          Heractiveer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShareExpirationManager;
