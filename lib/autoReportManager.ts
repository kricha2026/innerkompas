/**
 * Auto-report generation manager.
 * Checks if conditions are met for automatic report generation and saves them.
 */

import { supabase } from '@/lib/supabase';
import { type TagReportData } from '@/lib/generateTagReport';

export type AutoReportFrequency = 'weekly' | 'biweekly' | 'monthly';

const FREQUENCY_MS: Record<AutoReportFrequency, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const MILESTONE_SESSION_COUNTS = [5, 10, 20, 30, 50, 75, 100, 150, 200];

export interface AutoReportSettings {
  enabled: boolean;
  frequency: AutoReportFrequency;
  lastAutoReportAt: string | null;
  lastAutoReportSessionCount: number;
}

export interface AutoReportCheckResult {
  shouldGenerate: boolean;
  reason: 'frequency' | 'milestone' | null;
  milestoneCount?: number;
}

/**
 * Load auto-report settings from user profile
 */
export async function loadAutoReportSettings(userId: string): Promise<AutoReportSettings> {
  try {
    const { data } = await supabase
      .from('ik_user_profiles')
      .select('auto_report_enabled, auto_report_frequency, last_auto_report_at, last_auto_report_session_count')
      .eq('user_id', userId)
      .single();

    if (data) {
      return {
        enabled: data.auto_report_enabled ?? false,
        frequency: (data.auto_report_frequency as AutoReportFrequency) || 'weekly',
        lastAutoReportAt: data.last_auto_report_at,
        lastAutoReportSessionCount: data.last_auto_report_session_count ?? 0,
      };
    }
  } catch (e) {
    console.error('Error loading auto-report settings:', e);
  }

  return {
    enabled: false,
    frequency: 'weekly',
    lastAutoReportAt: null,
    lastAutoReportSessionCount: 0,
  };
}

/**
 * Save auto-report settings to user profile
 */
export async function saveAutoReportSettings(
  userId: string,
  settings: Partial<Pick<AutoReportSettings, 'enabled' | 'frequency'>>
): Promise<boolean> {
  try {
    const updateData: Record<string, any> = {};
    if (settings.enabled !== undefined) updateData.auto_report_enabled = settings.enabled;
    if (settings.frequency !== undefined) updateData.auto_report_frequency = settings.frequency;

    const { error } = await supabase
      .from('ik_user_profiles')
      .update(updateData)
      .eq('user_id', userId);

    return !error;
  } catch (e) {
    console.error('Error saving auto-report settings:', e);
    return false;
  }
}

/**
 * Check if an auto-report should be generated
 */
export function checkAutoReportConditions(
  settings: AutoReportSettings,
  currentSessionCount: number,
): AutoReportCheckResult {
  if (!settings.enabled) {
    return { shouldGenerate: false, reason: null };
  }

  // Check milestone (session count thresholds)
  const lastCount = settings.lastAutoReportSessionCount;
  for (const milestone of MILESTONE_SESSION_COUNTS) {
    if (currentSessionCount >= milestone && lastCount < milestone) {
      return { shouldGenerate: true, reason: 'milestone', milestoneCount: milestone };
    }
  }

  // Check frequency-based generation
  const frequencyMs = FREQUENCY_MS[settings.frequency] || FREQUENCY_MS.weekly;
  if (!settings.lastAutoReportAt) {
    // Never generated before — generate if there are enough sessions
    if (currentSessionCount >= 3) {
      return { shouldGenerate: true, reason: 'frequency' };
    }
  } else {
    const lastReportTime = new Date(settings.lastAutoReportAt).getTime();
    const now = Date.now();
    if (now - lastReportTime >= frequencyMs && currentSessionCount >= 3) {
      return { shouldGenerate: true, reason: 'frequency' };
    }
  }

  return { shouldGenerate: false, reason: null };
}

/**
 * Save an auto-generated report and update the user profile
 */
export async function saveAutoReport(
  userId: string,
  reportData: TagReportData,
  reason: 'frequency' | 'milestone',
  milestoneCount?: number,
  currentSessionCount?: number,
): Promise<{ success: boolean; reportId?: string }> {
  try {
    const dateStr = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const title = reason === 'milestone'
      ? `Auto-rapport — ${milestoneCount}e sessie (${dateStr})`
      : `Auto-rapport — ${dateStr}`;

    const { data, error } = await supabase
      .from('ik_tag_reports')
      .insert({
        user_id: userId,
        title,
        report_data: reportData,
        unique_tag_count: reportData.uniqueTagCount,
        total_tag_usages: reportData.totalTagUsages,
        sessions_count: reportData.totalSessions,
        rising_tags: reportData.risingTags,
        falling_tags: reportData.fallingTags,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving auto-report:', error);
      return { success: false };
    }

    // Update user profile with last auto-report info
    await supabase
      .from('ik_user_profiles')
      .update({
        last_auto_report_at: new Date().toISOString(),
        last_auto_report_session_count: currentSessionCount || reportData.totalSessions,
      })
      .eq('user_id', userId);

    return { success: true, reportId: data?.id };
  } catch (e) {
    console.error('Error saving auto-report:', e);
    return { success: false };
  }
}

/**
 * Get frequency label in Dutch
 */
export function getFrequencyLabel(freq: AutoReportFrequency): string {
  switch (freq) {
    case 'weekly': return 'Wekelijks';
    case 'biweekly': return 'Tweewekelijks';
    case 'monthly': return 'Maandelijks';
    default: return freq;
  }
}
