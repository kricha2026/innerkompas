/**
 * Export session data as downloadable JSON or CSV files.
 * Includes timestamps, emotion words, body areas, phases, summaries, and messages.
 */

import { supabase } from '@/lib/supabase';
import { BODY_AREA_LABELS } from '@/lib/types';



export interface ExportSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  phases: string[];
  emotion_words: string[];
  body_areas: string[];
  is_stable: boolean;
  crisis_detected: boolean;
  summary?: string | null;
  user_notes?: string | null;
  custom_tags?: string[];
}



export interface ExportMessage {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  message_order: number;
  created_at?: string;
  body_area_selected?: string | null;
}

export interface FullExportData {
  exportedAt: string;
  userEmail: string;
  displayName: string;
  totalSessions: number;
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    phases: string[];
    emotionWords: string[];
    bodyAreas: string[];
    bodyAreaLabels: string[];
    isStable: boolean;
    crisisDetected: boolean;
    summary: string | null;
    userNotes: string | null;
    customTags: string[];
    messages: Array<{
      order: number;
      role: string;
      content: string;
      bodyAreaSelected: string | null;
    }>;
  }>;

  statistics: {
    totalSessions: number;
    completedSessions: number;
    averageDurationMinutes: number;
    uniqueEmotions: string[];
    emotionFrequency: Record<string, number>;
    uniqueBodyAreas: string[];
    bodyAreaFrequency: Record<string, number>;
    phaseFrequency: Record<string, number>;
  };
}

// ─── Fetch all session data with messages ───

export async function fetchFullExportData(
  userId: string,
  userEmail: string,
  displayName: string
): Promise<FullExportData> {
  // Fetch sessions
  const { data: sessions } = await supabase
    .from('ik_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  const sessionList: ExportSession[] = sessions || [];

  // Fetch messages for all sessions
  const sessionIds = sessionList.map(s => s.id);
  let allMessages: ExportMessage[] = [];

  if (sessionIds.length > 0) {
    // Fetch in batches of 20 to avoid query limits
    for (let i = 0; i < sessionIds.length; i += 20) {
      const batch = sessionIds.slice(i, i + 20);
      const { data: msgs } = await supabase
        .from('ik_session_messages')
        .select('session_id, role, content, message_order, created_at, body_area_selected')
        .in('session_id', batch)
        .order('message_order', { ascending: true });
      if (msgs) allMessages = [...allMessages, ...msgs];
    }
  }

  // Group messages by session
  const messagesBySession: Record<string, ExportMessage[]> = {};
  allMessages.forEach(m => {
    if (!messagesBySession[m.session_id]) messagesBySession[m.session_id] = [];
    messagesBySession[m.session_id].push(m);
  });

  // Compute statistics
  const emotionFreq: Record<string, number> = {};
  const bodyFreq: Record<string, number> = {};
  const phaseFreq: Record<string, number> = {};
  const allEmotions = new Set<string>();
  const allBodyAreas = new Set<string>();

  sessionList.forEach(s => {
    (s.emotion_words || []).forEach(w => {
      emotionFreq[w] = (emotionFreq[w] || 0) + 1;
      allEmotions.add(w);
    });
    (s.body_areas || []).forEach(a => {
      bodyFreq[a] = (bodyFreq[a] || 0) + 1;
      allBodyAreas.add(a);
    });
    (s.phases || []).forEach(p => {
      phaseFreq[p] = (phaseFreq[p] || 0) + 1;
    });
  });

  const completedSessions = sessionList.filter(s => s.ended_at);
  const durations = completedSessions.map(s =>
    (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000
  );
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Build full export
  const exportData: FullExportData = {
    exportedAt: new Date().toISOString(),
    userEmail,
    displayName,
    totalSessions: sessionList.length,
    sessions: sessionList.map(s => {
      const msgs = (messagesBySession[s.id] || []).sort((a, b) => a.message_order - b.message_order);
      const duration = s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null;

      return {
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationMinutes: duration,
        phases: s.phases || [],
        emotionWords: s.emotion_words || [],
        bodyAreas: s.body_areas || [],
        bodyAreaLabels: (s.body_areas || []).map(a => (BODY_AREA_LABELS as Record<string, string>)[a] || a),
        isStable: s.is_stable,
        crisisDetected: s.crisis_detected,
        summary: (s as any).summary || null,
        userNotes: s.user_notes || null,
        customTags: s.custom_tags || [],
        messages: msgs.map(m => ({
          order: m.message_order,
          role: m.role,
          content: m.content,
          bodyAreaSelected: m.body_area_selected || null,
        })),
      };


    }),
    statistics: {
      totalSessions: sessionList.length,
      completedSessions: completedSessions.length,
      averageDurationMinutes: avgDuration,
      uniqueEmotions: [...allEmotions].sort(),
      emotionFrequency: emotionFreq,
      uniqueBodyAreas: [...allBodyAreas].sort(),
      bodyAreaFrequency: bodyFreq,
      phaseFrequency: phaseFreq,
    },
  };

  return exportData;
}

// ─── Export as JSON ───

export function exportAsJSON(data: FullExportData, displayName: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, generateFilename(displayName, 'json'));
}

// ─── Export as CSV ───

export function exportAsCSV(data: FullExportData, displayName: string): void {
  const lines: string[] = [];

  // Header

  lines.push([
    'Sessie ID',
    'Gestart op',
    'Beëindigd op',
    'Duur (min)',
    'Fasen',
    'Emotiewoorden',
    'Lichaamsgebieden',
    'Lichaamsgebieden (NL)',
    'Tags',
    'Stabiel',
    'Crisis gedetecteerd',
    'Samenvatting',
    'Persoonlijke notitie',
    'Aantal berichten',
  ].map(escapeCSV).join(','));

  // Session rows
  data.sessions.forEach(s => {
    lines.push([
      s.id,
      formatDateForCSV(s.startedAt),
      s.endedAt ? formatDateForCSV(s.endedAt) : '',
      s.durationMinutes !== null ? String(s.durationMinutes) : '',
      s.phases.join('; '),
      s.emotionWords.join('; '),
      s.bodyAreas.join('; '),
      s.bodyAreaLabels.join('; '),
      (s.customTags || []).join('; '),
      s.isStable ? 'Ja' : 'Nee',
      s.crisisDetected ? 'Ja' : 'Nee',
      s.summary || '',
      s.userNotes || '',
      String(s.messages.length),
    ].map(escapeCSV).join(','));
  });



  // Add empty row separator
  lines.push('');
  lines.push('');

  // Statistics section
  lines.push(escapeCSV('─── Statistieken ───'));
  lines.push(`${escapeCSV('Totaal sessies')},${data.statistics.totalSessions}`);
  lines.push(`${escapeCSV('Afgeronde sessies')},${data.statistics.completedSessions}`);
  lines.push(`${escapeCSV('Gemiddelde duur (min)')},${data.statistics.averageDurationMinutes}`);
  lines.push(`${escapeCSV('Unieke emoties')},${data.statistics.uniqueEmotions.length}`);
  lines.push(`${escapeCSV('Unieke lichaamsgebieden')},${data.statistics.uniqueBodyAreas.length}`);

  // Emotion frequency
  lines.push('');
  lines.push(`${escapeCSV('Emotie')},${escapeCSV('Frequentie')}`);
  Object.entries(data.statistics.emotionFrequency)
    .sort((a, b) => b[1] - a[1])
    .forEach(([emotion, count]) => {
      lines.push(`${escapeCSV(emotion)},${count}`);
    });

  // Body area frequency
  lines.push('');
  lines.push(`${escapeCSV('Lichaamsgebied')},${escapeCSV('Frequentie')}`);
  Object.entries(data.statistics.bodyAreaFrequency)
    .sort((a, b) => b[1] - a[1])
    .forEach(([area, count]) => {
      const label = (BODY_AREA_LABELS as Record<string, string>)[area] || area;
      lines.push(`${escapeCSV(label)},${count}`);
    });

  // Add BOM for Excel UTF-8 compatibility
  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, generateFilename(displayName, 'csv'));
}

// ─── Export messages as separate CSV ───

export function exportMessagesAsCSV(data: FullExportData, displayName: string): void {
  const lines: string[] = [];

  // Header
  lines.push([
    'Sessie ID',
    'Sessie gestart',
    'Bericht nr.',
    'Rol',
    'Inhoud',
    'Lichaamsgebied geselecteerd',
  ].map(escapeCSV).join(','));

  // Message rows
  data.sessions.forEach(s => {
    s.messages.forEach(m => {
      lines.push([
        s.id,
        formatDateForCSV(s.startedAt),
        String(m.order),
        m.role === 'user' ? 'Jij' : 'InnerKompas',
        m.content,
        m.bodyAreaSelected ? ((BODY_AREA_LABELS as Record<string, string>)[m.bodyAreaSelected] || m.bodyAreaSelected) : '',
      ].map(escapeCSV).join(','));
    });
  });

  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, generateFilename(displayName, 'csv', 'berichten'));
}

// ─── Helpers ───

function escapeCSV(value: string): string {
  if (!value) return '""';
  // If contains comma, newline, or quote — wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"') || value.includes(';')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateForCSV(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('nl-NL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function generateFilename(displayName: string, extension: string, suffix?: string): string {
  const safeName = (displayName || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['innerkompas', safeName, suffix, date].filter(Boolean);
  return `${parts.join('-')}.${extension}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
