import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// ─── Types ───
export interface ShareNotification {
  id: string;
  shareId: string;
  shareToken: string;
  reportId: string;
  reportTitle: string;
  accessedAt: string;
  createdAt: string; // when the notification was created
  read: boolean;
}

interface ShareNotificationContextType {
  notifications: ShareNotification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (notificationId: string) => void;
  clearAll: () => void;
  /** Call this when the user opens the Gedeelde links view */
  onSharesViewOpened: () => void;
  /** Manually trigger a poll (e.g., after creating a new share) */
  refreshShares: () => void;
}

const ShareNotificationContext = createContext<ShareNotificationContextType | undefined>(undefined);

// ─── localStorage keys ───
const STORAGE_KEY_NOTIFICATIONS = 'ik_share_notifications';
const STORAGE_KEY_KNOWN_ACCESSES = 'ik_share_known_accesses';

// ─── Polling interval ───
const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ─── Helpers ───
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e);
  }
  return fallback;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e);
  }
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  if (diffHrs < 24) return `${diffHrs} uur geleden`;
  if (diffDays === 1) return 'gisteren';
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

// ─── Provider ───
export function ShareNotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<ShareNotification[]>(() =>
    loadFromStorage<ShareNotification[]>(STORAGE_KEY_NOTIFICATIONS, [])
  );
  // Known accesses: a map of shareId → accessed_at timestamp (or null)
  const knownAccessesRef = useRef<Record<string, string | null>>(
    loadFromStorage<Record<string, string | null>>(STORAGE_KEY_KNOWN_ACCESSES, {})
  );
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  // ─── Persist notifications to localStorage whenever they change ───
  useEffect(() => {
    saveToStorage(STORAGE_KEY_NOTIFICATIONS, notifications);
  }, [notifications]);

  // ─── Filter notifications for current user ───
  const userNotifications = notifications.filter(n => {
    // If we have a user, only show their notifications
    // Notifications are created with the user context, so all stored ones belong to the current user
    return true;
  });

  const unreadCount = userNotifications.filter(n => !n.read).length;

  // ─── Poll for new share accesses ───
  const pollForNewAccesses = useCallback(async () => {
    if (!user || isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      // Fetch all shares for this user that have been accessed
      const { data: shares, error } = await supabase
        .from('ik_report_shares')
        .select('id, share_token, report_id, accessed_at, created_at')
        .eq('created_by', user.id)
        .not('accessed_at', 'is', null);

      if (error || !shares) {
        isPollingRef.current = false;
        return;
      }

      const knownAccesses = knownAccessesRef.current;
      const newNotifications: ShareNotification[] = [];

      for (const share of shares) {
        const knownAccessedAt = knownAccesses[share.id];

        // New access detected: either we didn't know about this share, or it was previously null
        if (knownAccessedAt === undefined || knownAccessedAt === null) {
          // This is a newly accessed share!
          // Check if we already have a notification for this share
          const existingNotification = notifications.find(n => n.shareId === share.id);
          if (!existingNotification) {
            // Fetch the report title
            let reportTitle = 'Tag Rapport';
            try {
              const { data: report } = await supabase
                .from('ik_tag_reports')
                .select('title')
                .eq('id', share.report_id)
                .maybeSingle();
              if (report?.title) reportTitle = report.title;
            } catch {
              // Fallback to default title
            }

            const notification: ShareNotification = {
              id: `notif-${share.id}-${Date.now()}`,
              shareId: share.id,
              shareToken: share.share_token,
              reportId: share.report_id,
              reportTitle,
              accessedAt: share.accessed_at,
              createdAt: new Date().toISOString(),
              read: false,
            };

            newNotifications.push(notification);
          }
        } else if (knownAccessedAt !== share.accessed_at) {
          // The accessed_at timestamp changed (re-access) — we could track this too
          // For now, we only notify on first access
        }

        // Update known state
        knownAccesses[share.id] = share.accessed_at;
      }

      // Also update known accesses for shares that are NOT accessed yet
      // (so we can detect when they become accessed)
      const { data: allShares } = await supabase
        .from('ik_report_shares')
        .select('id, accessed_at')
        .eq('created_by', user.id);

      if (allShares) {
        for (const share of allShares) {
          if (knownAccesses[share.id] === undefined) {
            knownAccesses[share.id] = share.accessed_at;
          }
        }
      }

      // Save updated known accesses
      knownAccessesRef.current = knownAccesses;
      saveToStorage(STORAGE_KEY_KNOWN_ACCESSES, knownAccesses);

      // Add new notifications
      if (newNotifications.length > 0) {
        setNotifications(prev => {
          const updated = [...newNotifications, ...prev];
          // Keep max 50 notifications
          return updated.slice(0, 50);
        });

        // Show toast for each new notification
        for (const notif of newNotifications) {
          toast({
            title: 'Rapport bekeken',
            description: `Je coach heeft "${notif.reportTitle}" bekeken (${formatTimeAgo(notif.accessedAt)})`,
          });
        }
      }
    } catch (e) {
      console.error('Error polling for share accesses:', e);
    }

    isPollingRef.current = false;
  }, [user, notifications]);

  // ─── Start/stop polling based on auth state ───
  useEffect(() => {
    if (isAuthenticated && user) {
      // Initial poll
      pollForNewAccesses();

      // Set up interval
      pollTimerRef.current = setInterval(pollForNewAccesses, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ───
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const onSharesViewOpened = useCallback(() => {
    // Mark all notifications as read when the user opens the Gedeelde links view
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const refreshShares = useCallback(() => {
    pollForNewAccesses();
  }, [pollForNewAccesses]);

  return (
    <ShareNotificationContext.Provider
      value={{
        notifications: userNotifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        clearAll,
        onSharesViewOpened,
        refreshShares,
      }}
    >
      {children}
    </ShareNotificationContext.Provider>
  );
}

export function useShareNotifications() {
  const context = useContext(ShareNotificationContext);
  if (!context) {
    throw new Error('useShareNotifications must be used within a ShareNotificationProvider');
  }
  return context;
}
