import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type EmailDigestFrequency = 'none' | 'daily' | 'weekly';

interface NotificationPrefs {
  id?: string;
  in_app_enabled: boolean;
  email_digest_frequency: EmailDigestFrequency;
  default_share_expiry_hours: number;
}

const DEFAULT_PREFS: NotificationPrefs = {
  in_app_enabled: true,
  email_digest_frequency: 'none',
  default_share_expiry_hours: 720,
};

const DIGEST_OPTIONS: { value: EmailDigestFrequency; label: string; description: string }[] = [
  {
    value: 'none',
    label: 'Geen e-mailmeldingen',
    description: 'Je ontvangt geen e-mails over gedeelde rapporten.',
  },
  {
    value: 'daily',
    label: 'Dagelijkse samenvatting',
    description: 'Elke ochtend een overzicht van alle coach-activiteit op je gedeelde rapporten van de afgelopen 24 uur.',
  },
  {
    value: 'weekly',
    label: 'Wekelijks overzicht',
    description: 'Elke maandag een samenvatting van alle coach-activiteit van de afgelopen week.',
  },
];

const NotificationPreferences: React.FC = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalPrefs, setOriginalPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [expanded, setExpanded] = useState(true);

  const userId = user?.id || '';

  // ─── Load preferences ───
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const loadPrefs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('ik_notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('Error loading notification preferences:', error);
        }

        if (data) {
          const loaded: NotificationPrefs = {
            id: data.id,
            in_app_enabled: data.in_app_enabled ?? true,
            email_digest_frequency: data.email_digest_frequency ?? 'none',
            default_share_expiry_hours: data.default_share_expiry_hours ?? 720,
          };

          setPrefs(loaded);
          setOriginalPrefs(loaded);
        } else {
          // No preferences yet — use defaults
          setPrefs(DEFAULT_PREFS);
          setOriginalPrefs(DEFAULT_PREFS);
        }
      } catch (e) {
        console.error('Error loading notification preferences:', e);
      }
      setLoading(false);
    };

    loadPrefs();
  }, [userId]);

  // ─── Track changes ───
  useEffect(() => {
    const changed =
      prefs.in_app_enabled !== originalPrefs.in_app_enabled ||
      prefs.email_digest_frequency !== originalPrefs.email_digest_frequency ||
      prefs.default_share_expiry_hours !== originalPrefs.default_share_expiry_hours;
    setHasChanges(changed);
  }, [prefs, originalPrefs]);


  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaveError('');
    setSaveSuccess(false);
    setSaving(true);

    try {
      const payload = {

        user_id: userId,
        in_app_enabled: prefs.in_app_enabled,
        email_digest_frequency: prefs.email_digest_frequency,
        default_share_expiry_hours: prefs.default_share_expiry_hours,
        updated_at: new Date().toISOString(),
      };


      if (prefs.id) {
        // Update existing
        const { error } = await supabase
          .from('ik_notification_preferences')
          .update(payload)
          .eq('id', prefs.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('ik_notification_preferences')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw error;
        if (data) {
          setPrefs(prev => ({ ...prev, id: data.id }));
        }
      }

      setOriginalPrefs({ ...prefs });
      setSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      console.error('Error saving notification preferences:', e);
      setSaveError('Kon voorkeuren niet opslaan. Probeer het opnieuw.');
      setTimeout(() => setSaveError(''), 5000);
    }

    setSaving(false);
  }, [userId, prefs]);

  // ─── Toggle in-app ───
  const toggleInApp = () => {
    setPrefs(prev => ({ ...prev, in_app_enabled: !prev.in_app_enabled }));
  };

  // ─── Set digest frequency ───
  const setDigestFrequency = (freq: EmailDigestFrequency) => {
    setPrefs(prev => ({ ...prev, email_digest_frequency: freq }));
  };

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-sand-dark/10 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <h3 className="font-serif text-lg text-anthracite">Meldingsvoorkeuren</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 rounded-full bg-gold-light/30 animate-breathe" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-cream/60 border border-sand-dark/15">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="font-serif text-lg text-anthracite">Meldingsvoorkeuren</h3>
            <p className="text-xs text-anthracite-soft/50 font-sans">
              Hoe wil je op de hoogte gehouden worden van coach-activiteit?
            </p>
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-anthracite-soft/30 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-6 space-y-6 animate-gentle-fade">
          {/* ─── In-app notifications toggle ─── */}
          <div className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-sans font-medium text-anthracite">In-app meldingen</h4>
                  <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5 leading-relaxed">
                    Ontvang direct een melding in de app wanneer je coach een gedeeld rapport bekijkt. 
                    Je ziet een badge op het Gedeelde links tabblad en een pop-up melding.
                  </p>
                  {prefs.in_app_enabled && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[11px] text-emerald-600 font-sans">Actief — meldingen worden elke 30 seconden gecontroleerd</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={toggleInApp}
                className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold-light/50 ${
                  prefs.in_app_enabled ? 'bg-emerald-400' : 'bg-sand-dark/20'
                }`}
                role="switch"
                aria-checked={prefs.in_app_enabled}
                aria-label="In-app meldingen aan/uit"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    prefs.in_app_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ─── Email digest frequency ─── */}
          <div className="p-4 rounded-xl bg-warm-white/60 border border-sand-dark/10">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-sans font-medium text-anthracite">E-mail samenvatting</h4>
                <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5 leading-relaxed">
                  Ontvang een e-mail met een overzicht van alle coach-activiteit op je gedeelde rapporten.
                </p>
              </div>
            </div>

            <div className="space-y-2 ml-10">
              {DIGEST_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                    prefs.email_digest_frequency === option.value
                      ? 'bg-blue-50/60 border border-blue-200/40'
                      : 'bg-transparent border border-transparent hover:bg-sand-dark/5'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        prefs.email_digest_frequency === option.value
                          ? 'border-blue-500'
                          : 'border-sand-dark/30'
                      }`}
                    >
                      {prefs.email_digest_frequency === option.value && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input
                      type="radio"
                      name="emailDigestFrequency"
                      value={option.value}
                      checked={prefs.email_digest_frequency === option.value}
                      onChange={() => setDigestFrequency(option.value)}
                      className="sr-only"
                    />
                    <span className="text-sm text-anthracite font-sans font-medium">{option.label}</span>
                    <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5 leading-relaxed">
                      {option.description}
                    </p>
                  </div>

                  {/* Frequency icon */}
                  {option.value !== 'none' && prefs.email_digest_frequency === option.value && (
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100/60 text-[10px] text-blue-600 font-sans font-medium">
                        {option.value === 'daily' ? (
                          <>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            Dagelijks
                          </>
                        ) : (
                          <>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            Wekelijks
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </label>
              ))}
            </div>

            {/* Email info note */}
            {prefs.email_digest_frequency !== 'none' && (
              <div className="mt-3 ml-10 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50/40 border border-blue-100/30">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 mt-0.5 flex-shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-[11px] text-blue-600/70 font-sans leading-relaxed">
                  E-mails worden verstuurd naar <span className="font-medium">{user?.email}</span>. 
                  De samenvatting bevat: welke rapporten zijn bekeken, wanneer, en een overzicht van je deellink-activiteit.
                  {prefs.email_digest_frequency === 'daily' && ' Je ontvangt de e-mail elke ochtend rond 08:00.'}
                  {prefs.email_digest_frequency === 'weekly' && ' Je ontvangt de e-mail elke maandagochtend rond 08:00.'}
                </p>
              </div>
            )}
          </div>

          {/* ─── Summary of current settings ─── */}
          <div className="px-4 py-3 rounded-xl bg-sand-dark/5 border border-sand-dark/8">
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/40">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-xs text-anthracite-soft/60 font-sans font-medium">Huidige instellingen</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans ${
                prefs.in_app_enabled
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-sand-dark/8 text-anthracite-soft/40 border border-sand-dark/10'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${prefs.in_app_enabled ? 'bg-emerald-400' : 'bg-sand-dark/20'}`} />
                In-app {prefs.in_app_enabled ? 'aan' : 'uit'}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans ${
                prefs.email_digest_frequency !== 'none'
                  ? 'bg-blue-50 text-blue-700 border border-blue-100'
                  : 'bg-sand-dark/8 text-anthracite-soft/40 border border-sand-dark/10'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${prefs.email_digest_frequency !== 'none' ? 'bg-blue-400' : 'bg-sand-dark/20'}`} />
                {prefs.email_digest_frequency === 'none' && 'E-mail uit'}
                {prefs.email_digest_frequency === 'daily' && 'Dagelijkse e-mail'}
                {prefs.email_digest_frequency === 'weekly' && 'Wekelijkse e-mail'}
              </span>
            </div>
          </div>

          {/* ─── Save button + feedback ─── */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-sans transition-all duration-200 ${
                hasChanges
                  ? 'bg-anthracite text-sand-light hover:bg-anthracite-light'
                  : 'bg-sand-dark/10 text-anthracite-soft/30 cursor-not-allowed'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-sand-light/30 border-t-sand-light animate-spin" />
                  Opslaan...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Voorkeuren opslaan
                </>
              )}
            </button>

            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-sans animate-gentle-fade">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Opgeslagen
              </span>
            )}

            {saveError && (
              <span className="flex items-center gap-1.5 text-xs text-red-500 font-sans animate-gentle-fade">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {saveError}
              </span>
            )}

            {hasChanges && !saving && (
              <button
                onClick={() => {
                  setPrefs({ ...originalPrefs });
                  setHasChanges(false);
                }}
                className="text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans transition-colors"
              >
                Annuleren
              </button>
            )}
          </div>

          {/* ─── Privacy note ─── */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-sand-dark/5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-anthracite-soft/30 mt-0.5 flex-shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-[11px] text-anthracite-soft/35 font-sans leading-relaxed">
              Je meldingsvoorkeuren worden veilig opgeslagen. E-mailsamenvattingen bevatten alleen metadata 
              (welk rapport, wanneer bekeken) — nooit de inhoud van je sessies of rapporten.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPreferences;
