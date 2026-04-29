import React, { useState, useEffect } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getGuestId } from '@/lib/guestId';
import { BODY_AREA_LABELS } from '@/lib/types';
import { fetchFullExportData, exportAsJSON, exportAsCSV, exportMessagesAsCSV } from '@/lib/exportSessionData';
import MijnRapporten from '@/components/inner-kompas/MijnRapporten';
import NotificationPreferences from '@/components/inner-kompas/NotificationPreferences';


interface DbSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  phases: string[];
  emotion_words: string[];
  body_areas: string[];
  is_stable: boolean;
  crisis_detected: boolean;
}

type ProfileTab = 'overview' | 'password' | 'rapporten';
type ExportFormat = 'json' | 'csv-sessions' | 'csv-messages';


const ROLE_LABELS: Record<string, string> = {
  user: 'Gebruiker',
  coach: 'Coach',
  admin: 'Beheerder',
};

const EXPORT_FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  {
    value: 'json',
    label: 'JSON (volledig)',
    description: 'Alle sessiedata inclusief berichten, statistieken en metadata in gestructureerd formaat.',
  },
  {
    value: 'csv-sessions',
    label: 'CSV (sessies)',
    description: 'Overzicht van alle sessies met emoties, lichaamsgebieden, fasen en samenvattingen.',
  },
  {
    value: 'csv-messages',
    label: 'CSV (berichten)',
    description: 'Alle gespreksberichten per sessie — je volledige gespreksgeschiedenis.',
  },
];

const UserProfile: React.FC = () => {
  const { setCurrentView } = useSession();
  const { user, profile, isAuthenticated, updateDisplayName, changePassword, setShowAuthModal } = useAuth();

  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  // ─── Display name editing ───
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(profile?.display_name || '');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState('');

  // ─── Password change ───
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  // ─── Session statistics ───
  const [sessions, setSessions] = useState<DbSession[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Export ───
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState('');
  const [showExportPanel, setShowExportPanel] = useState(false);

  const activeUserId = user?.id || getGuestId();

  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
    } else {
      setStatsLoading(false);
    }
  }, [activeUserId, isAuthenticated]);

  useEffect(() => {
    setNameValue(profile?.display_name || '');
  }, [profile?.display_name]);

  const loadSessions = async () => {
    setStatsLoading(true);
    try {
      const { data } = await supabase
        .from('ik_sessions')
        .select('*')
        .eq('user_id', activeUserId)
        .order('started_at', { ascending: false });
      if (data) setSessions(data);
    } catch (e) {
      console.error(e);
    }
    setStatsLoading(false);
  };

  // ─── Compute statistics ───
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(s => s.ended_at).length;

  // Emotion frequency
  const emotionFreq: Record<string, number> = {};
  sessions.forEach(s => {
    (s.emotion_words || []).forEach(w => {
      emotionFreq[w] = (emotionFreq[w] || 0) + 1;
    });
  });
  const topEmotions = Object.entries(emotionFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxEmotionCount = topEmotions.length > 0 ? topEmotions[0][1] : 1;

  // Body area frequency
  const bodyFreq: Record<string, number> = {};
  sessions.forEach(s => {
    (s.body_areas || []).forEach(a => {
      bodyFreq[a] = (bodyFreq[a] || 0) + 1;
    });
  });
  const topBodyAreas = Object.entries(bodyFreq).sort((a, b) => b[1] - a[1]).slice(0, 9);
  const maxBodyCount = topBodyAreas.length > 0 ? topBodyAreas[0][1] : 1;

  // Phase frequency
  const phaseFreq: Record<string, number> = {};
  sessions.forEach(s => {
    (s.phases || []).forEach(p => {
      phaseFreq[p] = (phaseFreq[p] || 0) + 1;
    });
  });
  const PHASE_LABELS: Record<string, string> = {
    regulation: 'Regulatie',
    holding: 'Vasthouden',
    kern: 'Kern',
  };

  // Average session duration
  const durations = sessions
    .filter(s => s.ended_at)
    .map(s => new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime());
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const avgMinutes = Math.round(avgDuration / 60000);

  // ─── Handlers ───
  const handleSaveName = async () => {
    setNameError('');
    setNameSuccess(false);
    setNameLoading(true);
    const result = await updateDisplayName(nameValue);
    if (result.error) {
      setNameError(result.error);
    } else {
      setNameSuccess(true);
      setEditingName(false);
      setTimeout(() => setNameSuccess(false), 3000);
    }
    setNameLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);

    if (newPw !== confirmPw) {
      setPwError('Wachtwoorden komen niet overeen.');
      return;
    }

    setPwLoading(true);
    const result = await changePassword(currentPw, newPw);
    if (result.error) {
      setPwError(result.error);
    } else {
      setPwSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 4000);
    }
    setPwLoading(false);
  };

  // ─── Export handler ───
  const handleExport = async () => {
    if (!user || !profile) return;

    setExportError('');
    setExportSuccess(false);
    setExportLoading(true);

    try {
      const data = await fetchFullExportData(
        activeUserId,
        user.email,
        profile.display_name || user.email.split('@')[0]
      );

      const displayName = profile.display_name || user.email.split('@')[0];

      switch (exportFormat) {
        case 'json':
          exportAsJSON(data, displayName);
          break;
        case 'csv-sessions':
          exportAsCSV(data, displayName);
          break;
        case 'csv-messages':
          exportMessagesAsCSV(data, displayName);
          break;
      }

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (e) {
      console.error('Export error:', e);
      setExportError('Er is een fout opgetreden bij het exporteren. Probeer het opnieuw.');
      setTimeout(() => setExportError(''), 6000);
    }

    setExportLoading(false);
  };

  const getInitials = () => {
    if (profile?.display_name) {
      const parts = profile.display_name.split(' ');
      return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) return user.email[0].toUpperCase();
    return '?';
  };

  // ─── Not authenticated state ───

  if (!isAuthenticated) {
    return (
      <div className="min-h-content-mobile flex items-center justify-center px-4 sm:px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-sand-dark/15 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl text-anthracite mb-2">Profiel</h2>
          <p className="text-sm text-anthracite-soft font-sans mb-6">
            Log in om je profiel en sessiestatistieken te bekijken.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-6 py-2.5 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors touch-target"
            >
              Inloggen
            </button>
            <button
              onClick={() => setCurrentView('home')}
              className="px-6 py-2.5 rounded-xl border border-sand-dark/20 text-sm text-anthracite-soft hover:text-anthracite font-sans transition-colors touch-target"
            >
              Terug
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-content-mobile px-4 sm:px-6 py-6 sm:py-8 max-w-3xl mx-auto pb-safe">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gold-light/50 flex items-center justify-center border-2 border-gold/20 flex-shrink-0">
            <span className="text-lg sm:text-xl font-sans font-semibold text-anthracite">{getInitials()}</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-serif text-xl sm:text-2xl text-anthracite truncate">{profile?.display_name || 'Profiel'}</h1>
            <p className="text-sm text-anthracite-soft font-sans truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => setCurrentView('home')}
          className="hidden sm:block px-4 py-2 rounded-xl text-sm text-anthracite-soft hover:text-anthracite font-sans transition-colors border border-sand-dark/20 hover:border-sand-dark/40"
        >
          Terug
        </button>
      </div>

      {/* Tab navigation */}

      <div className="flex border-b border-sand-dark/15 mb-8">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-3 text-sm font-sans transition-colors duration-200 border-b-2 ${
            activeTab === 'overview'
              ? 'text-anthracite border-gold'
              : 'text-anthracite-soft/50 border-transparent hover:text-anthracite-soft/70'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Overzicht
          </span>
        </button>
        <button
          onClick={() => setActiveTab('rapporten')}
          className={`px-5 py-3 text-sm font-sans transition-colors duration-200 border-b-2 ${
            activeTab === 'rapporten'
              ? 'text-anthracite border-gold'
              : 'text-anthracite-soft/50 border-transparent hover:text-anthracite-soft/70'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Rapporten
          </span>
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`px-5 py-3 text-sm font-sans transition-colors duration-200 border-b-2 ${
            activeTab === 'password'
              ? 'text-anthracite border-gold'
              : 'text-anthracite-soft/50 border-transparent hover:text-anthracite-soft/70'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Wachtwoord
          </span>
        </button>
      </div>


      {activeTab === 'overview' && (
        <div className="space-y-8 animate-gentle-fade">
          {/* ─── Account info card ─── */}
          <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
            <h3 className="font-serif text-lg text-anthracite mb-5">Accountgegevens</h3>

            {/* Display name */}
            <div className="mb-5">
              <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                Weergavenaam
              </label>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-warm-white border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50 transition-colors"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameValue(profile?.display_name || ''); } }}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={nameLoading}
                    className="px-4 py-2 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors disabled:opacity-50"
                  >
                    {nameLoading ? 'Opslaan...' : 'Opslaan'}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameValue(profile?.display_name || ''); setNameError(''); }}
                    className="px-3 py-2 rounded-xl text-sm text-anthracite-soft hover:text-anthracite font-sans transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-anthracite font-sans">{profile?.display_name || '—'}</span>
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1.5 rounded-lg hover:bg-sand-dark/15 transition-colors"
                    title="Naam bewerken"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/50">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  {nameSuccess && (
                    <span className="text-xs text-green-600 font-sans animate-gentle-fade">Opgeslagen</span>
                  )}
                </div>
              )}
              {nameError && (
                <p className="text-xs text-red-500 font-sans mt-1">{nameError}</p>
              )}
            </div>

            {/* Email */}
            <div className="mb-5">
              <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                E-mailadres
              </label>
              <span className="text-sm text-anthracite font-sans">{user?.email}</span>
            </div>

            {/* Role */}
            <div>
              <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                Rol
              </label>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-sans ${
                  profile?.role === 'coach' || profile?.role === 'admin'
                    ? 'bg-gold-light/30 text-anthracite border border-gold/20'
                    : 'bg-sand-dark/10 text-anthracite-soft border border-sand-dark/15'
                }`}>
                  {profile?.role === 'coach' || profile?.role === 'admin' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                  {ROLE_LABELS[profile?.role || 'user'] || profile?.role}
                </span>
              </div>
            </div>
          </div>

          {/* ─── Session statistics ─── */}
          <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-serif text-lg text-anthracite">Sessiestatistieken</h3>
              {/* Export toggle button — only show when there are sessions */}
              {!statsLoading && totalSessions > 0 && (
                <button
                  onClick={() => setShowExportPanel(!showExportPanel)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-sans transition-all duration-200 ${
                    showExportPanel
                      ? 'bg-anthracite text-sand-light'
                      : 'bg-warm-white/60 border border-sand-dark/15 text-anthracite-soft hover:text-anthracite hover:border-sand-dark/30'
                  }`}
                  title="Sessiedata exporteren"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Exporteren
                </button>
              )}
            </div>
            <p className="text-xs text-anthracite-soft/50 font-sans mb-5">
              Een overzicht van al je sessies
            </p>

            {statsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full bg-gold-light/30 animate-breathe" />
              </div>
            ) : totalSessions === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-anthracite-soft/40 font-sans mb-3">Nog geen sessies.</p>
                <button
                  onClick={() => setCurrentView('home')}
                  className="px-5 py-2 rounded-xl bg-cream border border-gold-light/30 hover:border-gold/30 text-sm text-anthracite font-sans transition-all"
                >
                  Begin je eerste sessie
                </button>
              </div>
            ) : (
              <>
                {/* ─── Export panel (collapsible) ─── */}
                {showExportPanel && (
                  <div className="mb-6 p-5 rounded-xl bg-warm-white/80 border border-sand-dark/12 animate-gentle-fade">
                    <div className="flex items-center gap-2 mb-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/60">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <h4 className="text-sm font-sans font-medium text-anthracite">Sessiedata exporteren</h4>
                    </div>
                    <p className="text-xs text-anthracite-soft/50 font-sans mb-4 leading-relaxed">
                      Download een kopie van je sessiegeschiedenis. Dit bevat tijdstempels, emotiewoorden, lichaamsgebieden, fasen, samenvattingen en gespreksberichten — zodat je een persoonlijk archief hebt van je therapeutische reis.
                    </p>

                    {/* Format selection */}
                    <div className="space-y-2 mb-4">
                      {EXPORT_FORMAT_OPTIONS.map(option => (
                        <label
                          key={option.value}
                          className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                            exportFormat === option.value
                              ? 'bg-gold-light/20 border border-gold/20'
                              : 'bg-transparent border border-transparent hover:bg-sand-dark/5'
                          }`}
                        >
                          <div className="mt-0.5">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                              exportFormat === option.value
                                ? 'border-anthracite'
                                : 'border-sand-dark/30'
                            }`}>
                              {exportFormat === option.value && (
                                <div className="w-2 h-2 rounded-full bg-anthracite" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1">
                            <input
                              type="radio"
                              name="exportFormat"
                              value={option.value}
                              checked={exportFormat === option.value}
                              onChange={() => setExportFormat(option.value)}
                              className="sr-only"
                            />
                            <span className="text-sm text-anthracite font-sans font-medium">{option.label}</span>
                            <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5 leading-relaxed">{option.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Export button + feedback */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleExport}
                        disabled={exportLoading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {exportLoading ? (
                          <>
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-sand-light/30 border-t-sand-light animate-spin" />
                            Exporteren...
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download {exportFormat === 'json' ? 'JSON' : 'CSV'}
                          </>
                        )}
                      </button>

                      {exportSuccess && (
                        <span className="flex items-center gap-1.5 text-xs text-green-600 font-sans animate-gentle-fade">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Gedownload
                        </span>
                      )}

                      {exportError && (
                        <span className="flex items-center gap-1.5 text-xs text-red-500 font-sans animate-gentle-fade">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          {exportError}
                        </span>
                      )}
                    </div>

                    {/* Privacy note */}
                    <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-sand-dark/5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40 mt-0.5 flex-shrink-0">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <p className="text-[11px] text-anthracite-soft/40 font-sans leading-relaxed">
                        Het geëxporteerde bestand bevat persoonlijke gegevens. Bewaar het op een veilige plek en deel het alleen met mensen die je vertrouwt.
                      </p>
                    </div>
                  </div>
                )}

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/10 text-center">
                    <p className="text-2xl font-serif text-anthracite">{totalSessions}</p>
                    <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">Totaal sessies</p>
                  </div>
                  <div className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/10 text-center">
                    <p className="text-2xl font-serif text-anthracite">{completedSessions}</p>
                    <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">Afgerond</p>
                  </div>
                  <div className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/10 text-center">
                    <p className="text-2xl font-serif text-anthracite">{avgMinutes > 0 ? `${avgMinutes}m` : '—'}</p>
                    <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">Gem. duur</p>
                  </div>
                  <div className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/10 text-center">
                    <p className="text-2xl font-serif text-anthracite">{Object.keys(emotionFreq).length}</p>
                    <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">Unieke emoties</p>
                  </div>
                </div>

                {/* Top emotions */}
                {topEmotions.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs text-anthracite-soft/50 font-sans uppercase tracking-wider mb-3">
                      Meest voorkomende emoties
                    </h4>
                    <div className="space-y-2">
                      {topEmotions.map(([word, count]) => (
                        <div key={word} className="flex items-center gap-3">
                          <span className="text-xs text-anthracite-soft font-sans w-24 text-right truncate">{word}</span>
                          <div className="flex-1 h-4 bg-sand-dark/8 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gold/35 rounded-full transition-all duration-500"
                              style={{ width: `${(count / maxEmotionCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-anthracite-soft/40 font-sans w-8 text-right">{count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top body areas */}
                {topBodyAreas.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs text-anthracite-soft/50 font-sans uppercase tracking-wider mb-3">
                      Meest actieve lichaamsgebieden
                    </h4>
                    <div className="space-y-2">
                      {topBodyAreas.map(([area, count]) => (
                        <div key={area} className="flex items-center gap-3">
                          <span className="text-xs text-anthracite-soft font-sans w-24 text-right">
                            {(BODY_AREA_LABELS as any)[area] || area}
                          </span>
                          <div className="flex-1 h-4 bg-sand-dark/8 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-anthracite-soft/20 rounded-full transition-all duration-500"
                              style={{ width: `${(count / maxBodyCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-anthracite-soft/40 font-sans w-8 text-right">{count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Phase distribution */}
                {Object.keys(phaseFreq).length > 0 && (
                  <div>
                    <h4 className="text-xs text-anthracite-soft/50 font-sans uppercase tracking-wider mb-3">
                      Fasen doorlopen
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(phaseFreq).sort((a, b) => b[1] - a[1]).map(([phase, count]) => (
                        <span key={phase} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sand-dark/10 border border-sand-dark/10">
                          <span className="text-xs text-anthracite font-sans">{PHASE_LABELS[phase] || phase}</span>
                          <span className="text-xs text-anthracite-soft/40 font-sans">{count}x</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Notification preferences ─── */}
          <NotificationPreferences />
        </div>

      )}

      {activeTab === 'rapporten' && (
        <div className="animate-gentle-fade">
          <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
            <MijnRapporten />
          </div>
        </div>
      )}


      {activeTab === 'password' && (
        <div className="animate-gentle-fade">
          <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15 max-w-md">
            <h3 className="font-serif text-lg text-anthracite mb-1">Wachtwoord wijzigen</h3>
            <p className="text-xs text-anthracite-soft/50 font-sans mb-5">
              Voer je huidige wachtwoord in en kies een nieuw wachtwoord.
            </p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                  Huidig wachtwoord
                </label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-warm-white border border-sand-dark/20 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors"
                  placeholder="Je huidige wachtwoord"
                />
              </div>

              <div>
                <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                  Nieuw wachtwoord
                </label>
                <input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2.5 rounded-xl bg-warm-white border border-sand-dark/20 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors"
                  placeholder="Minimaal 6 tekens"
                />
              </div>

              <div>
                <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">
                  Bevestig nieuw wachtwoord
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2.5 rounded-xl bg-warm-white border border-sand-dark/20 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 transition-colors"
                  placeholder="Herhaal je nieuwe wachtwoord"
                />
              </div>

              {pwError && (
                <div className="px-3 py-2 rounded-xl bg-red-50/60 border border-red-200/40">
                  <p className="text-xs text-red-600 font-sans">{pwError}</p>
                </div>
              )}

              {pwSuccess && (
                <div className="px-3 py-2 rounded-xl bg-green-50/60 border border-green-200/40">
                  <p className="text-xs text-green-700 font-sans flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Wachtwoord succesvol gewijzigd.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                className="w-full py-2.5 rounded-xl bg-anthracite text-sand-light text-sm font-sans hover:bg-anthracite-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-sand-light/30 border-t-sand-light animate-spin" />
                    Wijzigen...
                  </span>
                ) : 'Wachtwoord wijzigen'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-sand-dark/15 text-center">
        <p className="text-xs text-anthracite-soft/30 font-sans">
          Je gegevens worden veilig opgeslagen en zijn alleen voor jou zichtbaar.
        </p>
      </div>
    </div>
  );
};

export default UserProfile;
