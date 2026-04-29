import React, { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BODY_AREA_LABELS, COMPASS_STATE_LABELS, COMPASS_STATE_DESCRIPTIONS,
  PATTERN_MECHANISM_LABELS, MECHANISM_HUMAN_TRANSLATIONS,
  CompassState, PatternMechanism,
} from '@/lib/types';
import { DbSessionCoach, DbMessageCoach } from './CoachSessionDetail';

interface SessionPDFExportProps {
  session?: DbSessionCoach;
  messages?: DbMessageCoach[];
  // For active session export (from SessionEnd)
  activeSessionData?: {
    startedAt: Date;
    endedAt?: Date;
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
    emotionWords: string[];
    bodyAreas: string[];
    compassStateHistory: Array<{ primary: string | null; secondary: string | null; confidence: number; timestamp: Date }>;
    detectedMechanisms: Array<{ mechanism: string; context: string; timestamp: Date }>;
    currentPhase: string;
    isStable: boolean;
    crisisDetected: boolean;
    detectedStrengths: string[];
  };
  variant?: 'button' | 'icon';
  className?: string;
}

const SessionPDFExport: React.FC<SessionPDFExportProps> = ({
  session,
  messages,
  activeSessionData,
  variant = 'button',
  className = '',
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateReport = useCallback(async () => {
    setIsGenerating(true);

    try {
      // Determine data source
      let reportData: {
        startedAt: string;
        endedAt: string | null;
        duration: string;
        msgs: Array<{ role: string; content: string; time: string }>;
        emotionWords: string[];
        bodyAreas: string[];
        compassStates: Array<{ primary: string; secondary: string | null; confidence: number; time: string }>;
        mechanisms: Array<{ mechanism: string; context: string; time: string }>;
        phase: string;
        isStable: boolean;
        crisisDetected: boolean;
        strengths: string[];
      };

      if (activeSessionData) {
        const start = activeSessionData.startedAt;
        const end = activeSessionData.endedAt || new Date();
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

        reportData = {
          startedAt: start.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          endedAt: activeSessionData.endedAt ? end.toLocaleDateString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : null,
          duration: `${durationMin} minuten`,
          msgs: activeSessionData.messages.map(m => ({
            role: m.role,
            content: m.content,
            time: m.timestamp.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          })),
          emotionWords: activeSessionData.emotionWords,
          bodyAreas: activeSessionData.bodyAreas,
          compassStates: activeSessionData.compassStateHistory
            .filter(s => s.primary)
            .map(s => ({
              primary: s.primary!,
              secondary: s.secondary,
              confidence: s.confidence,
              time: s.timestamp.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
            })),
          mechanisms: activeSessionData.detectedMechanisms.map(m => ({
            mechanism: m.mechanism,
            context: m.context,
            time: m.timestamp.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          })),
          phase: activeSessionData.currentPhase,
          isStable: activeSessionData.isStable,
          crisisDetected: activeSessionData.crisisDetected,
          strengths: activeSessionData.detectedStrengths,
        };
      } else if (session && messages) {
        const start = new Date(session.started_at);
        const end = session.ended_at ? new Date(session.ended_at) : null;
        const durationMin = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;

        // Load compass state history from DB
        let compassStates: Array<{ primary: string; secondary: string | null; confidence: number; time: string }> = [];
        try {
          const { data: compassData } = await supabase
            .from('ik_compass_state_history')
            .select('*')
            .eq('session_id', session.id)
            .order('detected_at', { ascending: true });
          if (compassData) {
            compassStates = compassData.map((r: any) => ({
              primary: r.primary_state,
              secondary: r.secondary_state,
              confidence: r.confidence,
              time: new Date(r.detected_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
            }));
          }
        } catch (_) {}

        reportData = {
          startedAt: start.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          endedAt: end ? end.toLocaleDateString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : null,
          duration: durationMin !== null ? `${durationMin} minuten` : 'Lopend',
          msgs: messages.map(m => ({
            role: m.role,
            content: m.content,
            time: new Date(m.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          })),
          emotionWords: session.emotion_words || [],
          bodyAreas: session.body_areas || [],
          compassStates,
          mechanisms: [],
          phase: (session.phases || []).join(', '),
          isStable: session.is_stable,
          crisisDetected: session.crisis_detected,
          strengths: [],
        };
      } else {
        setIsGenerating(false);
        return;
      }

      // Generate HTML report
      const html = buildReportHTML(reportData);

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        // Auto-trigger print dialog after a short delay
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
    } catch (err) {
      console.error('Error generating report:', err);
    }

    setIsGenerating(false);
  }, [session, messages, activeSessionData]);

  if (variant === 'icon') {
    return (
      <button
        onClick={generateReport}
        disabled={isGenerating}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans border border-sand-dark/15 hover:border-sand-dark/30 transition-colors ${className}`}
        title="Sessie exporteren als PDF"
      >
        {isGenerating ? (
          <div className="w-3 h-3 rounded-full border-2 border-anthracite-soft/20 border-t-anthracite-soft/60 animate-spin" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        Export
      </button>
    );
  }

  return (
    <button
      onClick={generateReport}
      disabled={isGenerating}
      className={`px-5 py-2.5 rounded-xl text-sm font-sans transition-all duration-200 border border-sand-dark/20 hover:border-gold-light/40 text-anthracite-soft hover:text-anthracite bg-cream/60 hover:bg-cream ${className}`}
    >
      {isGenerating ? (
        <span className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-anthracite-soft/20 border-t-anthracite-soft/60 animate-spin" />
          Rapport genereren...
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Sessie exporteren
        </span>
      )}
    </button>
  );
};

function buildReportHTML(data: {
  startedAt: string;
  endedAt: string | null;
  duration: string;
  msgs: Array<{ role: string; content: string; time: string }>;
  emotionWords: string[];
  bodyAreas: string[];
  compassStates: Array<{ primary: string; secondary: string | null; confidence: number; time: string }>;
  mechanisms: Array<{ mechanism: string; context: string; time: string }>;
  phase: string;
  isStable: boolean;
  crisisDetected: boolean;
  strengths: string[];
}): string {
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const userMsgCount = data.msgs.filter(m => m.role === 'user').length;
  const aiMsgCount = data.msgs.filter(m => m.role === 'assistant').length;

  // Build compass state timeline HTML
  const compassHTML = data.compassStates.length > 0 ? `
    <div class="section">
      <h2>Kompas-staat Verloop</h2>
      <table>
        <thead>
          <tr>
            <th>Tijd</th>
            <th>Primaire staat</th>
            <th>Secundaire staat</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${data.compassStates.map(s => `
            <tr>
              <td>${escapeHtml(s.time)}</td>
              <td>${escapeHtml(COMPASS_STATE_LABELS[s.primary as CompassState] || s.primary)}</td>
              <td>${s.secondary ? escapeHtml(COMPASS_STATE_LABELS[s.secondary as CompassState] || s.secondary) : '—'}</td>
              <td>${Math.round(s.confidence * 100)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  // Build mechanisms HTML
  const mechanismsHTML = data.mechanisms.length > 0 ? `
    <div class="section">
      <h2>Gedetecteerde Mechanismen</h2>
      <table>
        <thead>
          <tr>
            <th>Mechanisme</th>
            <th>Menselijke vertaling</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          ${data.mechanisms.map(m => `
            <tr>
              <td>${escapeHtml(PATTERN_MECHANISM_LABELS[m.mechanism as PatternMechanism] || m.mechanism)}</td>
              <td><em>${escapeHtml(MECHANISM_HUMAN_TRANSLATIONS[m.mechanism as PatternMechanism] || '—')}</em></td>
              <td>${escapeHtml(m.context.substring(0, 100))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  // Build messages HTML
  const messagesHTML = data.msgs.map(m => `
    <div class="message ${m.role === 'user' ? 'user' : 'assistant'}">
      <div class="message-header">
        <span class="role">${m.role === 'user' ? 'Gebruiker' : 'InnerKompas'}</span>
        <span class="time">${escapeHtml(m.time)}</span>
      </div>
      <div class="message-content">${escapeHtml(m.content)}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>Inner Kompas — Sessierapport</title>
  <style>
    @page { margin: 2cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Georgia', 'Times New Roman', serif; color: #2d2d2d; line-height: 1.6; background: #fff; padding: 2rem; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 2px solid #d4a574; }
    .header h1 { font-size: 1.5rem; color: #2d2d2d; margin-bottom: 0.25rem; letter-spacing: 0.05em; }
    .header .subtitle { font-size: 0.85rem; color: #888; font-style: italic; }
    .header .date { font-size: 0.8rem; color: #666; margin-top: 0.5rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .meta-item { text-align: center; padding: 0.75rem; border: 1px solid #e8e0d8; border-radius: 8px; background: #faf8f5; }
    .meta-item .label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #999; }
    .meta-item .value { font-size: 1rem; color: #2d2d2d; margin-top: 0.25rem; }
    .section { margin-bottom: 2rem; }
    .section h2 { font-size: 1rem; color: #2d2d2d; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e8e0d8; }
    .tags { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .tag { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-family: sans-serif; }
    .tag.emotion { background: #fef3e2; color: #b8860b; border: 1px solid #f0d9a8; }
    .tag.body { background: #f0ebe4; color: #666; border: 1px solid #d8d0c8; }
    .tag.strength { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; font-family: sans-serif; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #faf8f5; color: #888; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .message { margin-bottom: 1rem; page-break-inside: avoid; }
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
    .message-header .role { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-family: sans-serif; }
    .message-header .time { font-size: 0.65rem; color: #bbb; font-family: sans-serif; }
    .message-content { padding: 0.75rem 1rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.6; }
    .message.user .message-content { background: #f5f3f0; border: 1px solid #e8e0d8; }
    .message.assistant .message-content { background: #fef9f0; border: 1px solid #f0e4d0; }
    .summary { padding: 1.25rem; border-radius: 12px; background: linear-gradient(135deg, #faf8f5, #fef9f0); border: 1px solid #e8dcc8; }
    .summary h3 { font-size: 0.85rem; margin-bottom: 0.5rem; }
    .summary p { font-size: 0.8rem; color: #555; font-family: sans-serif; line-height: 1.7; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e8e0d8; text-align: center; font-size: 0.7rem; color: #bbb; }
    .status-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-family: sans-serif; }
    .status-badge.stable { background: #e8f5e9; color: #2e7d32; }
    .status-badge.crisis { background: #ffebee; color: #c62828; }
    .status-badge.active { background: #fff3e0; color: #e65100; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Inner Kompas</h1>
    <div class="subtitle">Sessierapport</div>
    <div class="date">${escapeHtml(data.startedAt)}</div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <div class="label">Duur</div>
      <div class="value">${escapeHtml(data.duration)}</div>
    </div>
    <div class="meta-item">
      <div class="label">Berichten</div>
      <div class="value">${userMsgCount} / ${aiMsgCount}</div>
    </div>
    <div class="meta-item">
      <div class="label">Fasen</div>
      <div class="value">${escapeHtml(data.phase || '—')}</div>
    </div>
    <div class="meta-item">
      <div class="label">Status</div>
      <div class="value">
        ${data.crisisDetected
          ? '<span class="status-badge crisis">Crisis</span>'
          : data.isStable
            ? '<span class="status-badge stable">Stabiel</span>'
            : '<span class="status-badge active">Actief</span>'
        }
      </div>
    </div>
  </div>

  ${data.emotionWords.length > 0 ? `
    <div class="section">
      <h2>Gedetecteerde Emoties</h2>
      <div class="tags">
        ${data.emotionWords.map(w => `<span class="tag emotion">${escapeHtml(w)}</span>`).join('')}
      </div>
    </div>
  ` : ''}

  ${data.bodyAreas.length > 0 ? `
    <div class="section">
      <h2>Lichaamsgebieden</h2>
      <div class="tags">
        ${data.bodyAreas.map(a => `<span class="tag body">${escapeHtml((BODY_AREA_LABELS as any)[a] || a)}</span>`).join('')}
      </div>
    </div>
  ` : ''}

  ${data.strengths.length > 0 ? `
    <div class="section">
      <h2>Gedetecteerde Krachten</h2>
      <div class="tags">
        ${data.strengths.map(s => `<span class="tag strength">${escapeHtml(s)}</span>`).join('')}
      </div>
    </div>
  ` : ''}

  ${compassHTML}
  ${mechanismsHTML}

  <div class="section">
    <h2>Gesprek</h2>
    ${messagesHTML}
  </div>

  <div class="footer">
    <p>Inner Kompas — Vertrouwelijk sessierapport</p>
    <p>Gegenereerd op ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
  </div>
</body>
</html>`;
}

export default SessionPDFExport;
