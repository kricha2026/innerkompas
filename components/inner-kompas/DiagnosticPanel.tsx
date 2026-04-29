import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface DbSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  phases: string[];
  user_display_name: string | null;
  user_id: string;
}

/**
 * ─── DIAGNOSTIC PANEL ───
 * Hidden panel for verifying session isolation and message persistence.
 * Toggle with Ctrl+Shift+D or via tester mode.
 *
 * Shows:
 * 1. Current activeUserId and guest/authenticated status
 * 2. dbSessionId (state) and dbSessionIdRef.current (ref)
 * 3. Message count in DB for current session
 * 4. All sessions in DB for current user
 */
const DiagnosticPanel: React.FC = () => {
  const {
    activeUserId,
    isGuest,
    dbSessionId,
    getDbSessionIdRef,
    session,
  } = useSession();
  const { user: authUser, profile } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [dbMessageCount, setDbMessageCount] = useState<number | null>(null);
  const [dbSessions, setDbSessions] = useState<DbSessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refValue, setRefValue] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ─── Keyboard shortcut: Ctrl+Shift+D ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Refresh data when panel opens or session changes ───
  const refreshData = useCallback(async () => {
    setRefValue(getDbSessionIdRef());
    setLastRefresh(new Date());

    // 1. Count messages for current session
    const currentSessionId = getDbSessionIdRef() || dbSessionId;
    if (currentSessionId) {
      setLoadingMessages(true);
      try {
        const { count, error } = await supabase
          .from('ik_session_messages')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', currentSessionId);
        if (!error && count !== null) {
          setDbMessageCount(count);
        } else {
          setDbMessageCount(null);
        }
      } catch {
        setDbMessageCount(null);
      }
      setLoadingMessages(false);
    } else {
      setDbMessageCount(null);
    }

    // 2. Load all sessions for current user
    setLoadingSessions(true);
    try {
      const { data, error } = await supabase
        .from('ik_sessions')
        .select('id, started_at, ended_at, phases, user_display_name, user_id')
        .eq('user_id', activeUserId || '')

        .order('started_at', { ascending: false })
        .limit(20);
      if (!error && data) {
        setDbSessions(data);
      }
    } catch {
      // ignore
    }
    setLoadingSessions(false);
  }, [activeUserId, dbSessionId, getDbSessionIdRef]);

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen, dbSessionId, refreshData]);

  if (!isOpen) return null;

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const inMemoryMsgCount = session?.messages?.length ?? 0;
  const stateMatchesRef = dbSessionId === refValue;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[420px] max-h-[80vh] overflow-hidden rounded-2xl bg-gray-900/95 text-gray-100 shadow-2xl border border-gray-700/50 backdrop-blur-sm font-mono text-xs flex flex-col">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="font-bold text-amber-400 text-sm">Session Diagnostics</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            className="p-1 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
            title="Refresh"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 1. User Identity */}
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">User Identity</h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">activeUserId</span>
              <span className="text-cyan-400 select-all">
  {activeUserId ? `${activeUserId.substring(0, 8)}…` : 'guest'}
</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Type</span>
              <span className={isGuest ? 'text-amber-400' : 'text-emerald-400'}>
                {isGuest ? 'GUEST (per-device)' : `AUTH (${authUser?.email || '?'})`}
              </span>
            </div>
            {profile && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Display name</span>
                <span className="text-gray-200">{profile.display_name}</span>
              </div>
            )}
            {profile && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Role</span>
                <span className={profile.role === 'coach' ? 'text-purple-400' : 'text-gray-300'}>{profile.role}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Session IDs */}
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Session IDs</h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">dbSessionId (state)</span>
              <span className={dbSessionId ? 'text-cyan-400 select-all' : 'text-red-400'}>
                {dbSessionId ? `${dbSessionId.substring(0, 8)}...` : 'null'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">dbSessionIdRef (ref)</span>
              <span className={refValue ? 'text-cyan-400 select-all' : 'text-red-400'}>
                {refValue ? `${refValue.substring(0, 8)}...` : 'null'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">State = Ref?</span>
              <span className={stateMatchesRef ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                {stateMatchesRef ? 'YES' : 'MISMATCH'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Message Counts */}
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Messages (Current Session)</h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">In-memory (React state)</span>
              <span className="text-gray-200">{inMemoryMsgCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">In DB (ik_session_messages)</span>
              {loadingMessages ? (
                <span className="text-gray-500">loading...</span>
              ) : dbMessageCount !== null ? (
                <span className={dbMessageCount === 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{dbMessageCount}</span>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
            {dbMessageCount !== null && inMemoryMsgCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Persistence rate</span>
                <span className={dbMessageCount >= inMemoryMsgCount ? 'text-emerald-400' : dbMessageCount > 0 ? 'text-amber-400' : 'text-red-400 font-bold'}>
                  {dbMessageCount}/{inMemoryMsgCount} ({Math.round((dbMessageCount / inMemoryMsgCount) * 100)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. All Sessions for User */}
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Sessions for this user ({dbSessions.length})
          </h3>
          {loadingSessions ? (
            <p className="text-gray-500">Loading...</p>
          ) : dbSessions.length === 0 ? (
            <p className="text-gray-500">No sessions found in DB for user {activeUserId ? activeUserId.substring(0, 8) : 'unknown'}...</p>

          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {dbSessions.map(s => {
                const isCurrent = s.id === dbSessionId || s.id === refValue;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                      isCurrent ? 'bg-cyan-900/30 border border-cyan-700/30' : 'bg-gray-800/50'
                    }`}
                  >
                    {isCurrent && (
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0 animate-pulse" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300 select-all">{s.id.substring(0, 8)}</span>
                        <span className="text-gray-500">{formatDate(s.started_at)} {formatTime(s.started_at)}</span>
                        {s.ended_at && <span className="text-emerald-600 text-[9px]">ended</span>}
                        {!s.ended_at && <span className="text-amber-500 text-[9px]">active</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-gray-500">
                        <span>{(s.phases || []).join(', ')}</span>
                        {s.user_display_name && <span>({s.user_display_name})</span>}
                        {s.user_id !== activeUserId && (
                          <span className="text-red-400 font-bold">WRONG USER: {s.user_id.substring(0, 8)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Footer ─── */}
      <div className="px-4 py-2 border-t border-gray-700/50 bg-gray-800/30 flex items-center justify-between">
        <span className="text-[9px] text-gray-600">
          Ctrl+Shift+D to toggle
        </span>
        {lastRefresh && (
          <span className="text-[9px] text-gray-600">
            Last refresh: {lastRefresh.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
};

export default DiagnosticPanel;
