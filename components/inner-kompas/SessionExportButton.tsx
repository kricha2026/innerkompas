import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getGuestId } from '@/lib/guestId';
import { fetchFullExportData, FullExportData } from '@/lib/exportSessionData';
import { BODY_AREA_LABELS } from '@/lib/types';

const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
};

interface SessionExportButtonProps {
  sessionCount: number;
}

const SessionExportButton: React.FC<SessionExportButtonProps> = ({ sessionCount }) => {
  const { user: authUser, profile } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const activeUserId = authUser?.id || getGuestId();
  const userEmail = authUser?.email || 'onbekend';
  const displayName = profile?.display_name || 'Gebruiker';

  const handleExportText = async () => {
    setExporting(true);
    setShowMenu(false);
    try {
      const data = await fetchFullExportData(activeUserId, userEmail, displayName);
      generateTextReport(data, displayName);
    } catch (e) {
      console.error('Export error:', e);
    }
    setExporting(false);
  };

  const handleExportJSON = async () => {
    setExporting(true);
    setShowMenu(false);
    try {
      const data = await fetchFullExportData(activeUserId, userEmail, displayName);
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      downloadBlob(blob, `innerkompas-${safeName(displayName)}-${dateStr()}.json`);
    } catch (e) {
      console.error('Export error:', e);
    }
    setExporting(false);
  };

  if (sessionCount === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={exporting}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans transition-all duration-200 border border-gold-light/30 hover:border-gold/40 bg-cream/60 hover:bg-gold-light/10 text-anthracite disabled:opacity-50"
      >
        {exporting ? (
          <>
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Exporteren...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exporteer alles
          </>
        )}
      </button>

      {showMenu && !exporting && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-56 rounded-xl bg-warm-white border border-sand-dark/15 shadow-lg overflow-hidden animate-gentle-fade">
            <button
              onClick={handleExportText}
              className="w-full text-left px-4 py-3 text-sm font-sans text-anthracite hover:bg-gold-light/10 transition-colors flex items-center gap-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <div>
                <p className="font-medium">Tekstrapport (.txt)</p>
                <p className="text-xs text-anthracite-soft/50">Leesbaar gestructureerd document</p>
              </div>
            </button>
            <button
              onClick={handleExportJSON}
              className="w-full text-left px-4 py-3 text-sm font-sans text-anthracite hover:bg-gold-light/10 transition-colors flex items-center gap-3 border-t border-sand-dark/10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <div>
                <p className="font-medium">JSON-bestand (.json)</p>
                <p className="text-xs text-anthracite-soft/50">Gestructureerde data</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

function generateTextReport(data: FullExportData, displayName: string): void {
  const lines: string[] = [];
  const divider = '═'.repeat(72);
  const subDivider = '─'.repeat(72);

  // Header
  lines.push(divider);
  lines.push('  INNERKOMPAS — VOLLEDIG SESSIERAPPORT');
  lines.push(divider);
  lines.push('');
  lines.push(`  Naam:           ${data.displayName}`);
  lines.push(`  E-mail:         ${data.userEmail}`);
  lines.push(`  Geëxporteerd:   ${formatDateNL(data.exportedAt)}`);
  lines.push(`  Totaal sessies: ${data.totalSessions}`);
  lines.push('');

  // Statistics
  lines.push(divider);
  lines.push('  STATISTIEKEN');
  lines.push(divider);
  lines.push('');
  lines.push(`  Afgeronde sessies:     ${data.statistics.completedSessions}`);
  lines.push(`  Gemiddelde duur:       ${data.statistics.averageDurationMinutes} minuten`);
  lines.push(`  Unieke emoties:        ${data.statistics.uniqueEmotions.length}`);
  lines.push(`  Unieke lichaamsgebieden: ${data.statistics.uniqueBodyAreas.length}`);
  lines.push('');

  if (Object.keys(data.statistics.emotionFrequency).length > 0) {
    lines.push('  Meest voorkomende emoties:');
    Object.entries(data.statistics.emotionFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([emotion, count]) => {
        lines.push(`    ${emotion.padEnd(25)} ${count}x`);
      });
    lines.push('');
  }

  if (Object.keys(data.statistics.bodyAreaFrequency).length > 0) {
    lines.push('  Meest voorkomende lichaamsgebieden:');
    Object.entries(data.statistics.bodyAreaFrequency)
      .sort((a, b) => b[1] - a[1])
      .forEach(([area, count]) => {
        const label = (BODY_AREA_LABELS as Record<string, string>)[area] || area;
        lines.push(`    ${label.padEnd(25)} ${count}x`);
      });
    lines.push('');
  }

  if (Object.keys(data.statistics.phaseFrequency).length > 0) {
    lines.push('  Fase-verdeling:');
    Object.entries(data.statistics.phaseFrequency)
      .sort((a, b) => b[1] - a[1])
      .forEach(([phase, count]) => {
        const label = PHASE_LABELS[phase] || phase;
        lines.push(`    ${label.padEnd(25)} ${count}x`);
      });
    lines.push('');
  }

  // Sessions
  lines.push(divider);
  lines.push('  SESSIES');
  lines.push(divider);

  data.sessions.forEach((s, idx) => {
    lines.push('');
    lines.push(subDivider);
    lines.push(`  SESSIE ${idx + 1} — ${formatDateNL(s.startedAt)}`);
    lines.push(subDivider);
    lines.push('');
    lines.push(`  Gestart:          ${formatDateNL(s.startedAt)}`);
    lines.push(`  Beëindigd:        ${s.endedAt ? formatDateNL(s.endedAt) : 'Niet afgesloten'}`);
    lines.push(`  Duur:             ${s.durationMinutes !== null ? `${s.durationMinutes} minuten` : 'Onbekend'}`);
    lines.push(`  Fasen:            ${s.phases.map(p => PHASE_LABELS[p] || p).join(', ') || 'Geen'}`);
    lines.push(`  Stabiel bereikt:  ${s.isStable ? 'Ja' : 'Nee'}`);
    lines.push(`  Crisis:           ${s.crisisDetected ? 'Ja — crisis gedetecteerd' : 'Nee'}`);

    if (s.emotionWords.length > 0) {
      lines.push(`  Emotiewoorden:    ${s.emotionWords.join(', ')}`);
    }

    if (s.bodyAreas.length > 0) {
      lines.push(`  Lichaamsgebieden: ${s.bodyAreaLabels.join(', ')}`);
    }

    if ((s.customTags || []).length > 0) {
      lines.push(`  Tags:             ${s.customTags.join(', ')}`);
    }

    if (s.summary) {
      lines.push('');
      lines.push('  Samenvatting:');
      wrapText(s.summary, 68).forEach(line => lines.push(`    ${line}`));
    }

    if (s.userNotes) {
      lines.push('');
      lines.push('  Persoonlijke notitie:');
      wrapText(s.userNotes, 68).forEach(line => lines.push(`    ${line}`));
    }

    // Transcript
    if (s.messages.length > 0) {
      lines.push('');
      lines.push('  ── Gesprekstranscript ──');
      lines.push('');
      s.messages.forEach(m => {
        const role = m.role === 'user' ? 'JIJ' : 'INNERKOMPAS';
        const prefix = `  [${role}]`;
        lines.push(prefix);
        wrapText(m.content, 66).forEach(line => lines.push(`    ${line}`));
        if (m.bodyAreaSelected) {
          const areaLabel = (BODY_AREA_LABELS as Record<string, string>)[m.bodyAreaSelected] || m.bodyAreaSelected;
          lines.push(`    (Lichaamsgebied: ${areaLabel})`);
        }
        lines.push('');
      });
    }
  });

  // Footer
  lines.push('');
  lines.push(divider);
  lines.push('  EINDE RAPPORT');
  lines.push(`  Gegenereerd door InnerKompas op ${formatDateNL(new Date().toISOString())}`);
  lines.push(divider);

  const textContent = lines.join('\n');
  const blob = new Blob(['\uFEFF' + textContent], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `innerkompas-rapport-${safeName(displayName)}-${dateStr()}.txt`);
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if (currentLine.length + word.length + 1 > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatDateNL(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('nl-NL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function safeName(name: string): string {
  return (name || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
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

export default SessionExportButton;
