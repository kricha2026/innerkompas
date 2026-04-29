/**
 * ─── PRIOR SESSION STATS ───
 *
 * Purpose: authoritatively detect whether the CURRENT authenticated user is a
 * RETURNING user with actual prior history, regardless of whether the
 * `ik_personal_profiles.session_count` column has drifted from reality.
 *
 * REGRESSION CONTEXT (v3.7.5 continuity bug):
 * The `ik_personal_profiles.session_count` column is only incremented when
 * `endSession()` runs cleanly (user clicks "end" AND mergeSessionIntoProfile +
 * saveProfile complete). In practice almost every user closes the tab instead,
 * so `session_count` stays at 0 even for users with many dozens of prior
 * sessions. Downstream this caused the live chat to emit
 * "We beginnen net samen — ik leer je in dit gesprek kennen" to continuity
 * questions ("weet je nog wie ik ben?") from clearly returning users, because
 * the model received `personalProfile.sessionCount = 0, hasHistory: false`.
 *
 * This helper bypasses the drifted counter and reads reality straight from
 * `ik_sessions` (started_at). It is used ONLY to decide "is this a returning
 * user" — it does NOT overwrite the stored profile row. The profile
 * maintenance loop still owns that.
 *
 * Shape is intentionally small — this is pure signal, no heavy context.
 */

import { supabase } from '@/lib/supabase';

export interface PriorSessionStats {
  /** Total number of ik_sessions rows belonging to this user (any state). */
  totalSessions: number;
  /**
   * True when the user has prior history that justifies a returning-user
   * posture in the live chat. Defined as `totalSessions >= 1`, i.e. there
   * is at least one prior session row belonging to this user besides the
   * current one.
   */
  hasPriorHistory: boolean;
  /** ISO timestamp of the most recent prior session's started_at (or null). */
  lastSessionStartedAt: string | null;
}

const EMPTY_STATS: PriorSessionStats = {
  totalSessions: 0,
  hasPriorHistory: false,
  lastSessionStartedAt: null,
};

/**
 * Load the prior-session signal for a given user. Never throws —
 * returns EMPTY_STATS on any error so session start is never blocked.
 *
 * `excludeSessionId` lets the caller skip the just-created current session
 * when it's already been inserted before this helper runs.
 */
export async function loadPriorSessionStats(
  userId: string,
  excludeSessionId?: string | null,
): Promise<PriorSessionStats> {
  if (!userId) return EMPTY_STATS;
  try {
    let sessionQuery = supabase
      .from('ik_sessions')
      .select('id, started_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1);

    if (excludeSessionId) {
      sessionQuery = sessionQuery.neq('id', excludeSessionId);
    }

    const { data: recent, count: totalCount, error: recentErr } = await sessionQuery;
    if (recentErr) {
      console.warn('[PRIOR SESSIONS] Fout bij tellen sessies:', recentErr);
      return EMPTY_STATS;
    }

    const totalSessions = typeof totalCount === 'number' ? totalCount : (recent?.length || 0);
    const lastSessionStartedAt = recent && recent.length > 0 ? recent[0].started_at : null;
    const hasPriorHistory = totalSessions > 0;

    console.log(
      `%c[PRIOR SESSIONS] Gebruiker ${userId.substring(0, 8)}…%c — total=${totalSessions}, returning=${hasPriorHistory}, laatst=${lastSessionStartedAt ? lastSessionStartedAt.substring(0, 10) : '—'}`,
      'color: #805ad5; font-weight: bold;',
      'color: #718096;',
    );

    return {
      totalSessions,
      hasPriorHistory,
      lastSessionStartedAt,
    };
  } catch (e) {
    console.warn('[PRIOR SESSIONS] Onverwachte fout:', e);
    return EMPTY_STATS;
  }
}
