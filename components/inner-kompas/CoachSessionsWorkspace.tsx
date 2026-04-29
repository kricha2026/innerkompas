import React, { useState, useEffect } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import CoachPersonDetail from './CoachPersonDetail';
import CoachSessionView from './CoachSessionView';


// ─── Types ───
interface ClientPerson {
  user_id: string;
  display_name: string;
  email: string | null;
  session_count: number;
  last_session_date: string | null;
  short_status: string;
  has_ai_status: boolean;
}

interface DbSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  phases: string[];
  emotion_words: string[];
  body_areas: string[];
  is_stable: boolean;
  crisis_detected: boolean;
  summary: string | null;
  user_display_name: string | null;
  user_id: string;
  coach_notes: string | null;
  live_mode: boolean;
}

// ─── Known phantom/test user IDs ───
const PHANTOM_USER_ID = '00000000-0000-0000-0000-000000000001';

function isPhantomUser(uid: string): boolean {
  return uid === PHANTOM_USER_ID || /^0{8}-0{4}-0{4}-0{4}-0{12}/.test(uid);
}

function resolveDisplayName(uid: string, sessionDisplayName: string | null, profileName: string | null, profileEmail: string | null): string {
  if (isPhantomUser(uid)) return 'Anonieme sessies (test)';
  if (sessionDisplayName) return sessionDisplayName;
  if (profileName) return profileName;
  if (profileEmail) return profileEmail.split('@')[0];
  return uid.substring(0, 8) + '…';
}

type WorkspaceView = 'person-list' | 'person-detail' | 'session-detail';

const CoachSessionsWorkspace: React.FC = () => {
  const { setCurrentView } = useSession();
  const { user: authUser } = useAuth();

  const [view, setView] = useState<WorkspaceView>('person-list');
  const [loading, setLoading] = useState(true);
  const [persons, setPersons] = useState<ClientPerson[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected state
  const [selectedPerson, setSelectedPerson] = useState<ClientPerson | null>(null);
  const [selectedSession, setSelectedSession] = useState<DbSession | null>(null);

  // ─── Load persons (clients) ───
  useEffect(() => {
    loadPersons();
  }, []);

  const loadPersons = async () => {
    setLoading(true);
    try {
      // Load sessions
      const { data: sessions } = await supabase
        .from('ik_sessions')
        .select('user_id, user_display_name, started_at, summary, emotion_words, coach_notes')
        .order('started_at', { ascending: false });

      // Load user profiles for email + display_name lookup
      const { data: profiles } = await supabase
        .from('ik_user_profiles')
        .select('user_id, display_name, email, role');

      const profileMap = new Map<string, { display_name: string | null; email: string | null; role: string }>();
      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.user_id, {
            display_name: p.display_name || null,
            email: p.email || null,
            role: p.role || 'user',
          });
        }
      }

      // Load AI-generated statuses from ik_client_status
      const { data: clientStatuses } = await supabase
        .from('ik_client_status')
        .select('user_id, short_status, last_analysis_at');

      const statusMap = new Map<string, { short_status: string; last_analysis_at: string | null }>();
      if (clientStatuses) {
        for (const cs of clientStatuses) {
          statusMap.set(cs.user_id, {
            short_status: cs.short_status || '',
            last_analysis_at: cs.last_analysis_at || null,
          });
        }
      }

      if (sessions) {
        const personMap = new Map<string, ClientPerson>();
        for (const s of sessions) {
          const uid = s.user_id;
          const prof = profileMap.get(uid);
          if (!personMap.has(uid)) {
            personMap.set(uid, {
              user_id: uid,
              display_name: resolveDisplayName(uid, s.user_display_name, prof?.display_name || null, prof?.email || null),
              email: prof?.email || null,
              session_count: 0,
              last_session_date: null,
              short_status: '',
              has_ai_status: false,
            });
          }
          const p = personMap.get(uid)!;
          p.session_count++;
          if (!p.last_session_date || s.started_at > p.last_session_date) {
            p.last_session_date = s.started_at;
          }
          // Update display name from the most recent session that has one
          if (s.user_display_name && s.started_at === p.last_session_date) {
            p.display_name = resolveDisplayName(uid, s.user_display_name, prof?.display_name || null, prof?.email || null);
          }
        }

        // Apply AI-generated status or fallback to simple client-side status
        for (const [uid, person] of personMap) {
          const aiStatus = statusMap.get(uid);
          if (aiStatus && aiStatus.short_status) {
            person.short_status = aiStatus.short_status;
            person.has_ai_status = true;
          } else {
            // Fallback: simple client-side status for persons without AI analysis yet
            const userSessions = sessions.filter(s => s.user_id === uid);
            person.short_status = generateSimpleStatus(userSessions);
            person.has_ai_status = false;
          }
        }

        // Sort: real users first (by last session date), phantom users at the bottom
        setPersons(Array.from(personMap.values()).sort((a, b) => {
          const aPhantom = isPhantomUser(a.user_id) ? 1 : 0;
          const bPhantom = isPhantomUser(b.user_id) ? 1 : 0;
          if (aPhantom !== bPhantom) return aPhantom - bPhantom;
          if (!a.last_session_date) return 1;
          if (!b.last_session_date) return -1;
          return b.last_session_date.localeCompare(a.last_session_date);
        }));
      }
    } catch (e) {
      console.error('Error loading persons:', e);
    }
    setLoading(false);
  };


  // Simple fallback status (used only when AI status hasn't been generated yet)
  const generateSimpleStatus = (sessions: any[]): string => {
    if (sessions.length === 0) return 'Geen sessies';
    if (sessions.length === 1) return 'Eerste sessie afgerond.';
    return `${sessions.length} sessies afgerond. Analyse wordt gegenereerd...`;
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

  // ─── Navigation ───
  const openPerson = (person: ClientPerson) => {
    setSelectedPerson(person);
    setView('person-detail');
  };

  const openSession = (session: DbSession) => {
    setSelectedSession(session);
    setView('session-detail');
  };

  const goBack = () => {
    if (view === 'session-detail') {
      setView('person-detail');
      setSelectedSession(null);
    } else if (view === 'person-detail') {
      setView('person-list');
      setSelectedPerson(null);
      // Refresh persons to pick up any updated AI status
      loadPersons();
    }
  };

  const handleSessionNotesChanged = (sessionId: string, notes: string) => {
    if (selectedSession && selectedSession.id === sessionId) {
      setSelectedSession(prev => prev ? { ...prev, coach_notes: notes } : null);
    }
  };

  // ─── Filtered persons ───
  const filteredPersons = searchQuery.trim()
    ? persons.filter(p =>
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.short_status.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : persons;

  // ═══════════════════════════════════════════════════════════════
  // ─── RENDER: Session Detail ───
  // ═══════════════════════════════════════════════════════════════
  if (view === 'session-detail' && selectedSession && selectedPerson) {
    return (
      <CoachSessionView
        session={selectedSession}
        personName={selectedPerson.display_name}
        onBack={goBack}
        onSessionNotesChanged={handleSessionNotesChanged}
      />
    );

  }

  // ═══════════════════════════════════════════════════════════════
  // ─── RENDER: Person Detail ───
  // ═══════════════════════════════════════════════════════════════
  if (view === 'person-detail' && selectedPerson) {
    return (
      <CoachPersonDetail
        person={selectedPerson}
        onBack={goBack}
        onOpenSession={openSession}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── RENDER: Person List ───
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-content-mobile">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-sand-dark/10 bg-cream/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-anthracite">Sessies</h1>
              <p className="text-sm text-anthracite-soft/50 font-sans mt-1">
                {persons.length} {persons.length === 1 ? 'persoon' : 'personen'} · Coach werkruimte
              </p>
            </div>
            <button
              onClick={loadPersons}
              className="p-2.5 rounded-xl hover:bg-sand-dark/10 transition-colors text-anthracite-soft/40 hover:text-anthracite-soft touch-target"
              title="Vernieuwen"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>

          {/* Search */}
          {persons.length > 3 && (
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-anthracite-soft/25">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Zoek op naam of status..."
                className="w-full pl-10 pr-4 py-3 sm:py-2.5 rounded-xl bg-warm-white border border-sand-dark/15 text-base sm:text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-sand-dark/10 text-anthracite-soft/30 hover:text-anthracite-soft/60 transition-colors touch-target"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Person list */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-safe">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
          </div>
        ) : filteredPersons.length === 0 ? (
          <div className="text-center py-16">
            {searchQuery ? (
              <>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/15">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <p className="text-sm text-anthracite-soft/40 font-sans">Geen resultaten voor "{searchQuery}"</p>
              </>
            ) : (
              <>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-anthracite-soft/15">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <p className="text-sm text-anthracite-soft/40 font-sans">Nog geen sessies beschikbaar.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredPersons.map(person => (
              <button
                key={person.user_id}
                onClick={() => openPerson(person)}
                className="w-full text-left p-4 sm:p-5 rounded-2xl bg-cream/60 border border-sand-dark/15 hover:border-gold-light/30 hover:bg-cream/80 active:bg-cream/90 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gold-light/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-sans font-medium text-anthracite">
                        {person.display_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <h3 className="font-sans font-medium text-anthracite text-sm sm:text-base truncate">{person.display_name}</h3>
                        <span className="text-xs text-anthracite-soft/40 font-sans flex-shrink-0">
                          {person.session_count} sessie{person.session_count !== 1 ? 's' : ''}
                        </span>
                        {person.has_ai_status && (
                          <span className="flex-shrink-0" title="AI-analyse beschikbaar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold-muted/40">
                              <path d="M12 2L2 7l10 5 10-5-10-5z" />
                              <path d="M2 17l10 5 10-5" />
                              <path d="M2 12l10 5 10-5" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-anthracite-soft/50 font-sans mt-0.5">
                        {person.last_session_date && (
                          <>Laatst: {formatDate(person.last_session_date)}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-anthracite-soft/20 group-hover:text-anthracite-soft/40 transition-colors flex-shrink-0 ml-2 sm:ml-3">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
                {person.short_status && (
                  <p className="text-sm text-anthracite-soft/60 font-sans leading-relaxed mt-2 pl-[52px] sm:pl-14">
                    {person.short_status}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoachSessionsWorkspace;
