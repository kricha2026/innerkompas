/**
 * Generate a printable tag rapport (HTML) that opens in a new window.
 * Users can print to PDF or save as HTML.
 * All data is passed in — no Supabase dependency.
 */

export interface TagReportData {
  // Basic stats
  uniqueTagCount: number;
  totalTagUsages: number;
  avgTagsPerSession: string;
  sessionsWithTags: number;
  totalSessions: number;

  // Tag frequency (sorted desc)
  tagFrequency: Array<[string, number]>;

  // Co-occurrence pairs
  coOccurrence: Array<{
    pair: string;
    tags: string[];
    count: number;
  }>;

  // Timeline data
  sortedMonths: string[];
  tagTimeline: Record<string, Record<string, number>>;

  // Trend data
  tagTrends: Record<string, {
    direction: 'up' | 'down' | 'stable';
    change: number;
    recentCount: number;
    earlierCount: number;
  }>;

  // Rising / falling tags
  risingTags: string[];
  fallingTags: string[];
}

// ─── Color palette for the report ───
const REPORT_COLORS = {
  primary: '#7c3aed',      // violet-600
  primaryLight: '#ede9fe',  // violet-100
  primaryMid: '#c4b5fd',    // violet-300
  rising: '#059669',        // emerald-600
  risingBg: '#ecfdf5',      // emerald-50
  falling: '#e11d48',       // rose-600
  fallingBg: '#fff1f2',     // rose-50
  text: '#1a1a2e',          // anthracite
  textMuted: '#6b7280',     // gray-500
  textLight: '#9ca3af',     // gray-400
  border: '#e5e7eb',        // gray-200
  bg: '#fefdfb',            // warm-white
  cream: '#faf8f5',
  barBg: '#f3f0eb',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(): string {
  return new Date().toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Generate tag cloud section HTML ───
function generateTagCloudHTML(data: TagReportData): string {
  const maxFreq = data.tagFrequency.length > 0 ? data.tagFrequency[0][1] : 1;

  const tags = data.tagFrequency.map(([tag, count]) => {
    const ratio = count / maxFreq;
    let fontSize = '0.75rem';
    let fontWeight = '400';
    let padding = '4px 10px';
    let opacity = '0.7';

    if (ratio >= 0.8) { fontSize = '1.25rem'; fontWeight = '600'; padding = '6px 16px'; opacity = '1'; }
    else if (ratio >= 0.6) { fontSize = '1.05rem'; fontWeight = '500'; padding = '5px 14px'; opacity = '0.9'; }
    else if (ratio >= 0.4) { fontSize = '0.9rem'; fontWeight = '500'; padding = '4px 12px'; opacity = '0.85'; }
    else if (ratio >= 0.2) { fontSize = '0.8rem'; fontWeight = '400'; padding = '4px 10px'; opacity = '0.75'; }

    return `<span style="
      display: inline-flex; align-items: center; gap: 4px;
      font-size: ${fontSize}; font-weight: ${fontWeight};
      padding: ${padding}; margin: 3px;
      background: ${REPORT_COLORS.primaryLight};
      border: 1px solid ${REPORT_COLORS.primaryMid}40;
      border-radius: 20px;
      color: ${REPORT_COLORS.primary};
      opacity: ${opacity};
    ">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
      ${escapeHtml(tag)} <span style="font-size:0.65rem;opacity:0.6;font-weight:400">${count}x</span>
    </span>`;
  }).join('\n');

  return `
    <div class="section">
      <h2>Tagwolk</h2>
      <p class="subtitle">Visueel overzicht — grotere tags komen vaker voor</p>
      <div style="
        display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
        gap: 4px; padding: 20px 10px; min-height: 80px;
        background: ${REPORT_COLORS.cream}; border-radius: 12px;
        border: 1px solid ${REPORT_COLORS.border};
      ">
        ${tags}
      </div>
    </div>
  `;
}

// ─── Generate bar chart section HTML ───
function generateBarChartHTML(data: TagReportData): string {
  const maxFreq = data.tagFrequency.length > 0 ? data.tagFrequency[0][1] : 1;

  const bars = data.tagFrequency.map(([tag, count]) => {
    const percentage = (count / maxFreq) * 100;
    const sessionPct = Math.round((count / data.totalSessions) * 100);

    return `
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
        <div style="width:100px; flex-shrink:0; display:flex; align-items:center; gap:4px;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${REPORT_COLORS.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4;flex-shrink:0">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <span style="font-size:0.8rem; color:${REPORT_COLORS.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(tag)}</span>
        </div>
        <div style="flex:1; height:24px; background:${REPORT_COLORS.barBg}; border-radius:8px; overflow:hidden; position:relative;">
          <div style="
            height:100%; width:${Math.max(percentage, 6)}%;
            background: linear-gradient(90deg, ${REPORT_COLORS.primaryMid}60, ${REPORT_COLORS.primaryMid}40);
            border-radius:8px;
            display:flex; align-items:center;
          ">
            ${percentage > 30 ? `<span style="font-size:0.65rem; color:${REPORT_COLORS.primary}; margin-left:10px; font-weight:500">${count}x</span>` : ''}
          </div>
          ${percentage <= 30 ? `<span style="position:absolute; right:8px; top:50%; transform:translateY(-50%); font-size:0.65rem; color:${REPORT_COLORS.textLight}">${count}x</span>` : ''}
        </div>
        <span style="font-size:0.65rem; color:${REPORT_COLORS.textLight}; width:36px; text-align:right; flex-shrink:0;">${sessionPct}%</span>
      </div>
    `;
  }).join('\n');

  return `
    <div class="section">
      <h2>Tag-frequentie</h2>
      <p class="subtitle">Hoe vaak elke tag is gebruikt — percentage geeft het aandeel van alle sessies aan</p>
      <div style="padding:12px 0;">
        ${bars}
      </div>
    </div>
  `;
}

// ─── Generate co-occurrence section HTML ───
function generateCoOccurrenceHTML(data: TagReportData): string {
  if (data.coOccurrence.length === 0) return '';

  const maxPairCount = data.coOccurrence[0]?.count || 1;

  const pairs = data.coOccurrence.map(({ tags, count }) => {
    const strength = count / maxPairCount;
    const dots = Array.from({ length: 4 }, (_, i) => {
      const filled = strength >= 0.75 ? 4 : strength >= 0.5 ? 3 : strength >= 0.25 ? 2 : 1;
      return `<span style="
        display:inline-block; width:6px; height:6px; border-radius:50%;
        background:${i < filled ? REPORT_COLORS.primary : REPORT_COLORS.border};
        margin-right:2px;
      "></span>`;
    }).join('');

    return `
      <div style="
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 14px; margin-bottom:6px;
        background:white; border:1px solid ${REPORT_COLORS.border};
        border-radius:10px;
      ">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="
            font-size:0.75rem; padding:2px 8px; border-radius:12px;
            background:${REPORT_COLORS.primaryLight}; color:${REPORT_COLORS.primary};
            border:1px solid ${REPORT_COLORS.primaryMid}30;
          ">${escapeHtml(tags[0])}</span>
          <span style="font-size:0.7rem; color:${REPORT_COLORS.textLight};">+</span>
          <span style="
            font-size:0.75rem; padding:2px 8px; border-radius:12px;
            background:${REPORT_COLORS.primaryLight}; color:${REPORT_COLORS.primary};
            border:1px solid ${REPORT_COLORS.primaryMid}30;
          ">${escapeHtml(tags[1])}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <div style="display:flex; align-items:center;">${dots}</div>
          <span style="font-size:0.65rem; color:${REPORT_COLORS.textLight}; width:24px; text-align:right;">${count}x</span>
        </div>
      </div>
    `;
  }).join('\n');

  return `
    <div class="section">
      <h2>Veelvoorkomende combinaties</h2>
      <p class="subtitle">Tags die samen voorkomen in dezelfde sessie — sterke combinaties wijzen op terugkerende thema's</p>
      <div style="
        display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));
        gap:6px; padding:8px 0;
      ">
        ${pairs}
      </div>
    </div>
  `;
}

// ─── Generate timeline / monthly breakdown HTML ───
function generateTimelineHTML(data: TagReportData): string {
  if (data.sortedMonths.length < 2) return '';

  // Get top 8 tags for the table
  const topTags = data.tagFrequency.slice(0, 8).map(([tag]) => tag);

  const headerCells = topTags.map(tag =>
    `<th style="
      padding:6px 8px; font-size:0.7rem; font-weight:500;
      color:${REPORT_COLORS.primary}; text-align:center;
      border-bottom:2px solid ${REPORT_COLORS.primaryMid}30;
      white-space:nowrap; max-width:80px; overflow:hidden; text-overflow:ellipsis;
    ">${escapeHtml(tag)}</th>`
  ).join('');

  const rows = data.sortedMonths.map(month => {
    const cells = topTags.map(tag => {
      const count = data.tagTimeline[tag]?.[month] || 0;
      const maxForTag = Math.max(...data.sortedMonths.map(m => data.tagTimeline[tag]?.[m] || 0), 1);
      const intensity = count / maxForTag;
      const bg = count > 0
        ? `rgba(124, 58, 237, ${0.08 + intensity * 0.35})`
        : 'transparent';

      return `<td style="
        padding:6px 8px; text-align:center; font-size:0.75rem;
        color:${count > 0 ? REPORT_COLORS.primary : REPORT_COLORS.textLight};
        font-weight:${count > 0 ? '500' : '400'};
        background:${bg}; border-radius:4px;
      ">${count > 0 ? count : '-'}</td>`;
    }).join('');

    return `
      <tr>
        <td style="
          padding:6px 10px; font-size:0.75rem; font-weight:500;
          color:${REPORT_COLORS.textMuted}; white-space:nowrap;
          border-right:1px solid ${REPORT_COLORS.border};
        ">${escapeHtml(month)}</td>
        ${cells}
      </tr>
    `;
  }).join('\n');

  return `
    <div class="section page-break-before">
      <h2>Maandelijks overzicht</h2>
      <p class="subtitle">Hoe vaak elke tag per maand is gebruikt — donkere cellen wijzen op hogere frequentie</p>
      <div style="overflow-x:auto; margin-top:8px;">
        <table style="width:100%; border-collapse:separate; border-spacing:2px;">
          <thead>
            <tr>
              <th style="
                padding:6px 10px; font-size:0.7rem; font-weight:500;
                color:${REPORT_COLORS.textMuted}; text-align:left;
                border-bottom:2px solid ${REPORT_COLORS.border};
                border-right:1px solid ${REPORT_COLORS.border};
              ">Maand</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Generate trend analysis HTML ───
function generateTrendHTML(data: TagReportData): string {
  if (data.risingTags.length === 0 && data.fallingTags.length === 0) return '';

  const risingItems = data.risingTags.slice(0, 6).map(tag => {
    const trend = data.tagTrends[tag];
    return `
      <div style="
        display:inline-flex; align-items:center; gap:4px;
        font-size:0.75rem; padding:4px 10px; margin:2px;
        background:${REPORT_COLORS.risingBg}; color:${REPORT_COLORS.rising};
        border:1px solid ${REPORT_COLORS.rising}25;
        border-radius:16px;
      ">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"/>
          <polyline points="5 12 12 5 19 12"/>
        </svg>
        ${escapeHtml(tag)}
        ${trend ? `<span style="font-size:0.6rem;opacity:0.7">+${trend.change.toFixed(1)}/mnd</span>` : ''}
      </div>
    `;
  }).join('');

  const fallingItems = data.fallingTags.slice(0, 6).map(tag => {
    const trend = data.tagTrends[tag];
    return `
      <div style="
        display:inline-flex; align-items:center; gap:4px;
        font-size:0.75rem; padding:4px 10px; margin:2px;
        background:${REPORT_COLORS.fallingBg}; color:${REPORT_COLORS.falling};
        border:1px solid ${REPORT_COLORS.falling}25;
        border-radius:16px;
      ">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <polyline points="19 12 12 19 5 12"/>
        </svg>
        ${escapeHtml(tag)}
        ${trend ? `<span style="font-size:0.6rem;opacity:0.7">${trend.change.toFixed(1)}/mnd</span>` : ''}
      </div>
    `;
  }).join('');

  // Build insight text
  let insightText = '';
  if (data.risingTags.length > 0 && data.fallingTags.length > 0) {
    insightText = `Recent is er meer aandacht voor <strong>${escapeHtml(data.risingTags.slice(0, 2).join(' en '))}</strong>, terwijl <strong>${escapeHtml(data.fallingTags.slice(0, 2).join(' en '))}</strong> minder voorkomen. Dit kan duiden op een verschuiving in therapeutische focus.`;
  } else if (data.risingTags.length > 0) {
    insightText = `De tag${data.risingTags.length > 1 ? 's' : ''} <strong>${escapeHtml(data.risingTags.slice(0, 3).join(', '))}</strong> ${data.risingTags.length > 1 ? 'komen' : 'komt'} steeds vaker voor in recente sessies. Dit kan wijzen op een groeiend bewustzijn van ${data.risingTags.length > 1 ? 'deze thema\'s' : 'dit thema'}.`;
  } else {
    insightText = `De tag${data.fallingTags.length > 1 ? 's' : ''} <strong>${escapeHtml(data.fallingTags.slice(0, 3).join(', '))}</strong> ${data.fallingTags.length > 1 ? 'komen' : 'komt'} minder vaak voor dan eerder. Dit kan betekenen dat er vooruitgang is geboekt op ${data.fallingTags.length > 1 ? 'deze gebieden' : 'dit gebied'}.`;
  }

  return `
    <div class="section">
      <h2>Trendanalyse</h2>
      <p class="subtitle">Vergelijking eerste helft vs. tweede helft van alle sessies</p>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0;">
        ${data.risingTags.length > 0 ? `
          <div style="padding:14px; background:${REPORT_COLORS.risingBg}; border:1px solid ${REPORT_COLORS.rising}20; border-radius:12px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${REPORT_COLORS.rising}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
              <span style="font-size:0.8rem; font-weight:600; color:${REPORT_COLORS.rising};">Stijgend</span>
            </div>
            <div style="display:flex; flex-wrap:wrap;">${risingItems}</div>
          </div>
        ` : ''}
        ${data.fallingTags.length > 0 ? `
          <div style="padding:14px; background:${REPORT_COLORS.fallingBg}; border:1px solid ${REPORT_COLORS.falling}20; border-radius:12px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${REPORT_COLORS.falling}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <polyline points="19 12 12 19 5 12"/>
              </svg>
              <span style="font-size:0.8rem; font-weight:600; color:${REPORT_COLORS.falling};">Dalend</span>
            </div>
            <div style="display:flex; flex-wrap:wrap;">${fallingItems}</div>
          </div>
        ` : ''}
      </div>

      <div style="
        padding:14px; margin-top:8px;
        background:${REPORT_COLORS.primaryLight}50;
        border:1px solid ${REPORT_COLORS.primaryMid}30;
        border-radius:12px;
      ">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${REPORT_COLORS.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;opacity:0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p style="font-size:0.8rem; color:${REPORT_COLORS.textMuted}; line-height:1.6; margin:0;">
            ${insightText}
          </p>
        </div>
      </div>
    </div>
  `;
}

// ─── Generate full report HTML ───
export function generateTagReportHTML(data: TagReportData): string {
  const date = formatDate();

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tag Rapport — InnerKompas</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: ${REPORT_COLORS.bg};
      color: ${REPORT_COLORS.text};
      line-height: 1.6;
      padding: 0;
    }

    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 48px;
    }

    .header {
      text-align: center;
      padding-bottom: 32px;
      margin-bottom: 32px;
      border-bottom: 2px solid ${REPORT_COLORS.primaryMid}30;
    }

    .header-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px; height: 56px;
      background: ${REPORT_COLORS.primaryLight};
      border: 1px solid ${REPORT_COLORS.primaryMid}40;
      border-radius: 16px;
      margin-bottom: 16px;
    }

    .header h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 1.75rem;
      font-weight: 600;
      color: ${REPORT_COLORS.text};
      margin-bottom: 4px;
    }

    .header .brand {
      font-size: 0.8rem;
      color: ${REPORT_COLORS.primary};
      font-weight: 500;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .header .date {
      font-size: 0.75rem;
      color: ${REPORT_COLORS.textLight};
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 32px;
    }

    .summary-card {
      text-align: center;
      padding: 16px 8px;
      background: white;
      border: 1px solid ${REPORT_COLORS.border};
      border-radius: 12px;
    }

    .summary-card .value {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 1.5rem;
      font-weight: 600;
      color: ${REPORT_COLORS.primary};
    }

    .summary-card .label {
      font-size: 0.65rem;
      color: ${REPORT_COLORS.textLight};
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 4px;
    }

    .section {
      margin-bottom: 32px;
    }

    .section h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 1.15rem;
      font-weight: 600;
      color: ${REPORT_COLORS.text};
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section .subtitle {
      font-size: 0.75rem;
      color: ${REPORT_COLORS.textLight};
      margin-bottom: 16px;
    }

    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid ${REPORT_COLORS.border};
      text-align: center;
    }

    .footer p {
      font-size: 0.7rem;
      color: ${REPORT_COLORS.textLight};
      line-height: 1.8;
    }

    .footer .disclaimer {
      font-size: 0.65rem;
      color: ${REPORT_COLORS.textLight};
      font-style: italic;
      margin-top: 8px;
      padding: 12px;
      background: ${REPORT_COLORS.cream};
      border-radius: 8px;
      border: 1px solid ${REPORT_COLORS.border};
    }

    .print-controls {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }

    .print-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      font-size: 0.8rem;
      font-weight: 500;
      font-family: 'Inter', sans-serif;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .print-btn-primary {
      background: ${REPORT_COLORS.primary};
      color: white;
    }

    .print-btn-primary:hover {
      background: #6d28d9;
      box-shadow: 0 4px 12px rgba(124,58,237,0.3);
    }

    .print-btn-secondary {
      background: white;
      color: ${REPORT_COLORS.text};
      border: 1px solid ${REPORT_COLORS.border};
    }

    .print-btn-secondary:hover {
      background: ${REPORT_COLORS.cream};
    }

    @media print {
      .print-controls { display: none !important; }
      body { background: white; }
      .page { padding: 20px 32px; }
      .page-break-before { page-break-before: always; }
    }
  </style>
</head>
<body>
  <!-- Print controls -->
  <div class="print-controls">
    <button class="print-btn print-btn-primary" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Afdrukken / PDF
    </button>
    <button class="print-btn print-btn-secondary" onclick="window.close()">
      Sluiten
    </button>
  </div>

  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${REPORT_COLORS.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </div>
      <div class="brand">InnerKompas</div>
      <h1>Tag Rapport</h1>
      <div class="date">Gegenereerd op ${date}</div>
    </div>

    <!-- Summary stats -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="value">${data.uniqueTagCount}</div>
        <div class="label">Unieke tags</div>
      </div>
      <div class="summary-card">
        <div class="value">${data.totalTagUsages}</div>
        <div class="label">Totaal gebruikt</div>
      </div>
      <div class="summary-card">
        <div class="value">${data.avgTagsPerSession}</div>
        <div class="label">Gem. per sessie</div>
      </div>
      <div class="summary-card">
        <div class="value">${data.sessionsWithTags}/${data.totalSessions}</div>
        <div class="label">Sessies met tags</div>
      </div>
    </div>

    <!-- Tag Cloud -->
    ${generateTagCloudHTML(data)}

    <!-- Bar Chart -->
    ${generateBarChartHTML(data)}

    <!-- Co-occurrence -->
    ${generateCoOccurrenceHTML(data)}

    <!-- Trends -->
    ${generateTrendHTML(data)}

    <!-- Timeline -->
    ${generateTimelineHTML(data)}

    <!-- Footer -->
    <div class="footer">
      <p>
        Dit rapport is automatisch gegenereerd door InnerKompas.<br>
        Het biedt een overzicht van tag-patronen over ${data.totalSessions} sessie${data.totalSessions !== 1 ? 's' : ''}.
      </p>
      <div class="disclaimer">
        Dit rapport is bedoeld als hulpmiddel voor zelfreflectie en gesprekken met je therapeut of coach.
        Het vervangt geen professioneel advies. De trends en patronen zijn gebaseerd op hoe je zelf je sessies hebt getagd
        en kunnen veranderen naarmate je meer sessies toevoegt.
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Open report in new window ───
export function openTagReport(data: TagReportData): void {
  const html = generateTagReportHTML(data);
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
}

// ─── Download as plain text file ───
export function downloadTagReportAsText(data: TagReportData): void {
  const lines: string[] = [];
  const divider = '─'.repeat(60);
  const date = formatDate();

  lines.push('');
  lines.push('  TAG RAPPORT — InnerKompas');
  lines.push(`  Gegenereerd op ${date}`);
  lines.push('');
  lines.push(divider);
  lines.push('');

  // Summary
  lines.push('  SAMENVATTING');
  lines.push('');
  lines.push(`  Unieke tags:        ${data.uniqueTagCount}`);
  lines.push(`  Totaal gebruikt:    ${data.totalTagUsages}`);
  lines.push(`  Gem. per sessie:    ${data.avgTagsPerSession}`);
  lines.push(`  Sessies met tags:   ${data.sessionsWithTags} / ${data.totalSessions}`);
  lines.push('');
  lines.push(divider);
  lines.push('');

  // Tag frequency
  lines.push('  TAG-FREQUENTIE');
  lines.push('');
  const maxTagLen = Math.max(...data.tagFrequency.map(([t]) => t.length), 10);
  data.tagFrequency.forEach(([tag, count]) => {
    const pct = Math.round((count / data.totalSessions) * 100);
    const bar = '\u2588'.repeat(Math.max(1, Math.round((count / (data.tagFrequency[0]?.[1] || 1)) * 20)));
    lines.push(`  ${tag.padEnd(maxTagLen)}  ${String(count).padStart(3)}x  ${bar}  (${pct}%)`);
  });
  lines.push('');
  lines.push(divider);
  lines.push('');

  // Co-occurrence
  if (data.coOccurrence.length > 0) {
    lines.push('  VEELVOORKOMENDE COMBINATIES');
    lines.push('');
    data.coOccurrence.forEach(({ tags, count }) => {
      lines.push(`  ${tags[0]} + ${tags[1]}  (${count}x)`);
    });
    lines.push('');
    lines.push(divider);
    lines.push('');
  }

  // Trends
  if (data.risingTags.length > 0 || data.fallingTags.length > 0) {
    lines.push('  TRENDANALYSE');
    lines.push('  (vergelijking eerste helft vs. tweede helft van sessies)');
    lines.push('');
    if (data.risingTags.length > 0) {
      lines.push('  Stijgend:');
      data.risingTags.forEach(tag => {
        const trend = data.tagTrends[tag];
        lines.push(`    ↑ ${tag}${trend ? ` (+${trend.change.toFixed(1)}/mnd)` : ''}`);
      });
      lines.push('');
    }
    if (data.fallingTags.length > 0) {
      lines.push('  Dalend:');
      data.fallingTags.forEach(tag => {
        const trend = data.tagTrends[tag];
        lines.push(`    ↓ ${tag}${trend ? ` (${trend.change.toFixed(1)}/mnd)` : ''}`);
      });
      lines.push('');
    }
    lines.push(divider);
    lines.push('');
  }

  // Monthly breakdown
  if (data.sortedMonths.length >= 2) {
    lines.push('  MAANDELIJKS OVERZICHT');
    lines.push('');
    const topTags = data.tagFrequency.slice(0, 6).map(([t]) => t);
    const colWidth = Math.max(...topTags.map(t => t.length), 6) + 2;

    // Header row
    lines.push('  ' + 'Maand'.padEnd(12) + topTags.map(t => t.padStart(colWidth)).join(''));
    lines.push('  ' + '─'.repeat(12 + topTags.length * colWidth));

    data.sortedMonths.forEach(month => {
      const cells = topTags.map(tag => {
        const count = data.tagTimeline[tag]?.[month] || 0;
        return (count > 0 ? String(count) : '-').padStart(colWidth);
      }).join('');
      lines.push('  ' + month.padEnd(12) + cells);
    });
    lines.push('');
    lines.push(divider);
    lines.push('');
  }

  // Disclaimer
  lines.push('  Dit rapport is bedoeld als hulpmiddel voor zelfreflectie en');
  lines.push('  gesprekken met je therapeut of coach. Het vervangt geen');
  lines.push('  professioneel advies.');
  lines.push('');

  const text = lines.join('\n');
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `innerkompas-tag-rapport-${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
