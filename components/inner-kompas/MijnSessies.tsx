import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getGuestId } from '@/lib/guestId';
import { BODY_AREA_LABELS } from '@/lib/types';
import SessionFilters from './SessionFilters';
import TagStatistics from './TagStatistics';
import SessionExportButton from './SessionExportButton';
import SessionComparison from './SessionComparison';


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
  user_notes: string | null;
  custom_tags: string[];
}


interface DbStep {
  id: string;
  phase: string;
  prompt: string;
  user_response: string | null;
  selected_emotion: string | null;
  selected_body_area: string | null;
  body_intensity: number | null;
  step_order: number;
  created_at: string;
}

interface DbMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quick_replies: string[] | string | null;
  show_body_map: boolean;
  body_area_selected: string | null;
  message_order: number;
  created_at: string;
}


const PHASE_LABELS: Record<string, string> = {
  regulation: 'Regulatie',
  holding: 'Vasthouden',
  kern: 'Kern',
};

// ─── Common tag suggestions ───
const SUGGESTED_TAGS = [
  'werk', 'relatie', 'familie', 'doorbraak', 'terugval',
  'angst', 'rouw', 'zelfbeeld', 'grenzen', 'patroon',
  'lichaam', 'slaap', 'energie', 'conflict', 'groei',
];

type DetailTab = 'transcript' | 'inzichten';


const MijnSessies: React.FC = () => {
  const { setCurrentView } = useSession();
  const { user: authUser, isAuthenticated, setShowAuthModal } = useAuth();
  // Use authenticated user ID if logged in, otherwise use stable guest ID
  const activeUserId = authUser?.id || getGuestId();


  const [sessions, setSessions] = useState<DbSession[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<DbSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<DbStep[]>([]);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('transcript');

  // ─── Note editing state ───
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Tag editing state ───
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // ─── Tag statistics / filter integration state ───
  const [externalTagFilter, setExternalTagFilter] = useState<string | null>(null);
  const [activeFilterTags, setActiveFilterTags] = useState<string[]>([]);
  const filterSectionRef = useRef<HTMLDivElement>(null);

  // ─── Comparison state ───
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  // ─── Month grouping state ───
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };


  const toggleCompare = (sessionId: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else if (next.size < 3) {
        next.add(sessionId);
      }
      return next;
    });
  };

  const comparisonSessions = filteredSessions.filter(s => compareIds.has(s.id));



  // Collect all existing tags across sessions for autocomplete
  const allExistingTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    sessions.forEach(s => (s.custom_tags || []).forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [sessions]);


  useEffect(() => {
    loadSessions();
  }, [activeUserId]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ik_sessions')
        .select('*')
        .eq('user_id', activeUserId)
        .order('started_at', { ascending: false });
      if (data) {
        // Ensure custom_tags is always an array
        const normalized = data.map(s => ({
          ...s,
          custom_tags: s.custom_tags || [],
        }));
        setSessions(normalized);
        setFilteredSessions(normalized);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadSteps = async (sessionId: string) => {
    try {
      const { data } = await supabase
        .from('ik_session_steps')
        .select('*')
        .eq('session_id', sessionId)
        .order('step_order', { ascending: true });
      if (data) setSteps(data);
    } catch (e) { console.error(e); }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const { data } = await supabase
        .from('ik_session_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: true });
      if (data) setMessages(data);
    } catch (e) { console.error(e); }
  };

  const handleSelect = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setSteps([]);
      setMessages([]);
    } else {
      setSelectedId(id);
      setLoadingDetail(true);
      await Promise.all([loadSteps(id), loadMessages(id)]);
      setLoadingDetail(false);
    }
  };

  const parseQuickReplies = (raw: string[] | string | null): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  };

  // Callback for SessionFilters
  const handleFilteredChange = useCallback((filtered: DbSession[]) => {
    setFilteredSessions(filtered);
    // If selected session is no longer in filtered results, deselect it
    if (selectedId && !filtered.some(s => s.id === selectedId)) {
      setSelectedId(null);
      setSteps([]);
      setMessages([]);
    }
  }, [selectedId]);

  // ─── Note editing functions ───
  const startEditingNote = (sessionId: string, currentNote: string | null) => {
    setEditingNoteId(sessionId);
    setNoteText(currentNote || '');
    setNoteSaveStatus('idle');
    // Focus textarea after render
    setTimeout(() => noteTextareaRef.current?.focus(), 100);
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setNoteText('');
    setNoteSaveStatus('idle');
  };

  const saveNote = async (sessionId: string) => {
    setSavingNote(true);
    setNoteSaveStatus('idle');
    try {
      const trimmedNote = noteText.trim() || null;
      const { error } = await supabase
        .from('ik_sessions')
        .update({ user_notes: trimmedNote })
        .eq('id', sessionId)
        .eq('user_id', activeUserId);

      if (error) throw error;

      // Update local state
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, user_notes: trimmedNote } : s
      ));
      setFilteredSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, user_notes: trimmedNote } : s
      ));

      setNoteSaveStatus('success');
      setTimeout(() => {
        setEditingNoteId(null);
        setNoteText('');
        setNoteSaveStatus('idle');
      }, 1200);
    } catch (e) {
      console.error('Error saving note:', e);
      setNoteSaveStatus('error');
      setTimeout(() => setNoteSaveStatus('idle'), 2500);
    }
    setSavingNote(false);
  };

  const deleteNote = async (sessionId: string) => {
    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('ik_sessions')
        .update({ user_notes: null })
        .eq('id', sessionId)
        .eq('user_id', activeUserId);

      if (error) throw error;

      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, user_notes: null } : s
      ));
      setFilteredSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, user_notes: null } : s
      ));
      setEditingNoteId(null);
      setNoteText('');
    } catch (e) {
      console.error('Error deleting note:', e);
    }
    setSavingNote(false);
  };

  // ─── Tag editing functions ───
  const startEditingTags = (sessionId: string) => {
    setEditingTagsId(sessionId);
    setTagInput('');
    setShowTagSuggestions(false);
    setTimeout(() => tagInputRef.current?.focus(), 100);
  };

  const cancelEditingTags = () => {
    setEditingTagsId(null);
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const addTag = async (sessionId: string, tag: string) => {
    const normalizedTag = tag.trim().toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\- ]/g, '').slice(0, 30);
    if (!normalizedTag) return;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const currentTags = session.custom_tags || [];
    if (currentTags.includes(normalizedTag)) {
      setTagInput('');
      return; // Already exists
    }

    if (currentTags.length >= 10) return; // Max 10 tags

    const newTags = [...currentTags, normalizedTag];
    setSavingTags(true);

    try {
      const { error } = await supabase
        .from('ik_sessions')
        .update({ custom_tags: newTags })
        .eq('id', sessionId)
        .eq('user_id', activeUserId);

      if (error) throw error;

      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, custom_tags: newTags } : s
      ));
      setFilteredSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, custom_tags: newTags } : s
      ));
      setTagInput('');
    } catch (e) {
      console.error('Error adding tag:', e);
    }
    setSavingTags(false);
  };

  const removeTag = async (sessionId: string, tagToRemove: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const newTags = (session.custom_tags || []).filter(t => t !== tagToRemove);
    setSavingTags(true);

    try {
      const { error } = await supabase
        .from('ik_sessions')
        .update({ custom_tags: newTags })
        .eq('id', sessionId)
        .eq('user_id', activeUserId);

      if (error) throw error;

      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, custom_tags: newTags } : s
      ));
      setFilteredSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, custom_tags: newTags } : s
      ));
    } catch (e) {
      console.error('Error removing tag:', e);
    }
    setSavingTags(false);
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, sessionId: string) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(sessionId, tagInput);
    }
    if (e.key === 'Escape') {
      cancelEditingTags();
    }
  };

  // Get filtered tag suggestions based on current input
  const getTagSuggestions = (sessionId: string): string[] => {
    const session = sessions.find(s => s.id === sessionId);
    const currentTags = session?.custom_tags || [];
    const q = tagInput.toLowerCase().trim();

    // Combine suggested + existing tags, filter out already assigned, filter by query
    const allCandidates = [...new Set([...SUGGESTED_TAGS, ...allExistingTags])];
    return allCandidates
      .filter(t => !currentTags.includes(t))
      .filter(t => !q || t.includes(q))
      .slice(0, 8);
  };



  // ─── Tag statistics callbacks ───
  const handleTagStatisticsClick = useCallback((tag: string) => {
    setExternalTagFilter(tag);
    // Scroll to filter section
    setTimeout(() => {
      filterSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  const handleExternalTagFilterHandled = useCallback(() => {
    setExternalTagFilter(null);
  }, []);

  const handleActiveTagsChange = useCallback((tags: string[]) => {
    setActiveFilterTags(tags);
  }, []);


  // ─── Statistics (computed from ALL sessions, not filtered) ───
  const emotionFreq: Record<string, number> = {};
  sessions.forEach(s => {
    (s.emotion_words || []).forEach(w => {
      emotionFreq[w] = (emotionFreq[w] || 0) + 1;
    });
  });
  const topEmotions = Object.entries(emotionFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxEmotionCount = topEmotions.length > 0 ? topEmotions[0][1] : 1;

  const bodyFreq: Record<string, number> = {};
  sessions.forEach(s => {
    (s.body_areas || []).forEach(a => {
      bodyFreq[a] = (bodyFreq[a] || 0) + 1;
    });
  });
  const topBodyAreas = Object.entries(bodyFreq).sort((a, b) => b[1] - a[1]).slice(0, 9);
  const maxBodyCount = topBodyAreas.length > 0 ? topBodyAreas[0][1] : 1;

  // Build simple line chart data: emotions per session over time (last 10)
  const chartSessions = [...sessions].reverse().slice(-10);
  const maxEmotionsPerSession = Math.max(...chartSessions.map(s => (s.emotion_words || []).length), 1);
  const maxPhases = Math.max(...chartSessions.map(s => (s.phases || []).length), 1);

  const chartWidth = 320;
  const chartHeight = 120;
  const padding = 24;
  const plotW = chartWidth - padding * 2;
  const plotH = chartHeight - padding * 2;

  const emotionPoints = chartSessions.map((s, i) => {
    const x = padding + (chartSessions.length > 1 ? (i / (chartSessions.length - 1)) * plotW : plotW / 2);
    const y = padding + plotH - ((s.emotion_words || []).length / maxEmotionsPerSession) * plotH;
    return { x, y, session: s };
  });

  const phasePoints = chartSessions.map((s, i) => {
    const x = padding + (chartSessions.length > 1 ? (i / (chartSessions.length - 1)) * plotW : plotW / 2);
    const y = padding + plotH - ((s.phases || []).length / maxPhases) * plotH;
    return { x, y };
  });

  const emotionLinePath = emotionPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const phaseLinePath = phasePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };

  // Sessions are always loaded regardless of login status.
  // Guest users see their sessions via their stable device-based guest ID.
  // Logged-in users see sessions linked to their account.

  // ─── Month grouping helper ───
  const DUTCH_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  const groupByMonth = (sessionList: DbSession[]): { key: string; label: string; sessions: DbSession[] }[] => {
    const groups: Record<string, DbSession[]> = {};
    const order: string[] = [];
    sessionList.forEach(s => {
      const d = new Date(s.started_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(s);
    });
    return order.map(key => {
      const [year, monthIdx] = key.split('-');
      return {
        key,
        label: `${DUTCH_MONTHS[parseInt(monthIdx)]} ${year}`,
        sessions: groups[key],
      };
    });
  };

  const monthGroups = React.useMemo(() => groupByMonth(filteredSessions), [filteredSessions]);

  // ─── Warm Inner Kompas text generation (verleden tijd, jij-vorm) ───
  const generateWarmSummary = (s: DbSession): string => {
    const emotions = s.emotion_words || [];
    const bodyAreas = (s.body_areas || []).map(a => ((BODY_AREA_LABELS as any)[a] || a).toLowerCase());
    const phases = s.phases || [];
    const hasKern = phases.includes('kern');
    const isStable = s.is_stable;

    if (s.summary) return s.summary;

    const parts: string[] = [];
    if (emotions.length > 0) {
      parts.push(`Je voelde ${emotions.slice(0, 3).join(', ')}.`);
    }
    if (bodyAreas.length > 0) {
      parts.push(`Je lichaam sprak mee via je ${bodyAreas.slice(0, 2).join(' en ')}.`);
    }
    if (hasKern) {
      parts.push('Er ontstond verdieping — je ging naar wat er echt leefde.');
    } else if (isStable) {
      parts.push('Er kwam rust en er ontstond wat meer ruimte.');
    }
    return parts.join(' ') || 'Er was ruimte om te voelen wat er leefde.';
  };

  const generateWarmInsightText = (s: DbSession): { reflection: string; closing: string } => {
    const emotions = s.emotion_words || [];
    const bodyAreas = (s.body_areas || []).map(a => ((BODY_AREA_LABELS as any)[a] || a).toLowerCase());
    const phases = s.phases || [];
    const hasKern = phases.includes('kern');
    const hasRegulation = phases.includes('regulation');
    const isStable = s.is_stable;
    const hasCrisis = s.crisis_detected;

    // Build warm reflection in past tense
    const reflectionParts: string[] = [];

    if (emotions.length > 0 && bodyAreas.length > 0) {
      reflectionParts.push(
        `In deze sessie werd ${emotions.slice(0, 3).join(', ')} voelbaar, en je lichaam reageerde in je ${bodyAreas.slice(0, 2).join(' en ')}. Dat was al een vorm van afstemming.`
      );
    } else if (emotions.length > 0) {
      reflectionParts.push(
        `Er kwamen gevoelens naar boven: ${emotions.slice(0, 3).join(', ')}. Dat je dit kon voelen, was al waardevol.`
      );
    } else if (bodyAreas.length > 0) {
      reflectionParts.push(
        `Je lichaam liet iets merken via je ${bodyAreas.slice(0, 2).join(' en ')}. Dat was een teken van afstemming — je luisterde naar wat er leefde.`
      );
    }

    if (s.summary) {
      reflectionParts.push(s.summary);
    } else if (hasKern) {
      reflectionParts.push('Je ging naar de kern van wat er leefde. Dat vroeg moed en eerlijkheid naar jezelf.');
    } else if (hasRegulation) {
      reflectionParts.push('Je maakte ruimte om tot rust te komen. Dat was een krachtige eerste stap.');
    }

    // Build warm closing in past tense
    let closing: string;
    if (isStable) {
      closing = 'Je sessie eindigde in rust. Er verschoof iets, iets werd zachter. Je inner kompas werd weer wat voelbaarder.';
    } else if (hasCrisis) {
      closing = 'Dit was een intense sessie. Dat je erbij bleef, liet zien hoeveel kracht er in je zat. Wees zacht voor jezelf.';
    } else if (hasKern) {
      closing = 'Er ontstond verdieping. Je zag of voelde iets dat er al langer was. Dat was moedig.';
    } else {
      closing = 'Je maakte ruimte om te voelen wat er leefde. Alleen al dat je er was, was betekenisvol.';
    }

    return {
      reflection: reflectionParts.join(' ') || 'Je nam ruimte om bij jezelf stil te staan. Dat was al een vorm van zorg.',
      closing,
    };
  };




  return (
    <div className="min-h-content-mobile px-4 sm:px-6 py-6 sm:py-8 max-w-4xl mx-auto pb-safe">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl text-anthracite">Mijn Sessies</h1>
          <p className="text-sm text-anthracite-soft font-sans mt-1">
            {sessions.length} sessie{sessions.length !== 1 ? 's' : ''} opgeslagen
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <SessionExportButton sessionCount={sessions.length} />
          <button
            onClick={() => setCurrentView('home')}
            className="hidden sm:block px-4 py-2 rounded-xl text-sm text-anthracite-soft hover:text-anthracite font-sans transition-colors duration-200 border border-sand-dark/20 hover:border-sand-dark/40"
          >
            Terug
          </button>
        </div>
      </div>


      {/* Comparison selection bar */}
      {compareIds.size > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-sky-50/60 border border-sky-200/30 animate-gentle-fade">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500/60">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              <span className="text-sm text-anthracite font-sans">
                <span className="font-medium">{compareIds.size}</span> sessie{compareIds.size !== 1 ? 's' : ''} geselecteerd
                {compareIds.size < 2 && (
                  <span className="text-anthracite-soft/50 ml-1">(selecteer minimaal 2)</span>
                )}
                {compareIds.size >= 3 && (
                  <span className="text-anthracite-soft/50 ml-1">(maximaal 3)</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCompareIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans transition-colors border border-sand-dark/15 hover:border-sand-dark/25"
              >
                Wissen
              </button>
              <button
                onClick={() => {
                  if (compareIds.size >= 2) setShowComparison(true);
                }}
                disabled={compareIds.size < 2}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-sans font-medium transition-all duration-200 disabled:opacity-40 bg-sky-100/60 text-sky-700 border border-sky-200/40 hover:bg-sky-100/80 hover:border-sky-300/40"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Vergelijk
              </button>
            </div>
          </div>
        </div>
      )}


      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
        </div>
      ) : (
        <>


          {/* ─── Search & Filter Section ─── */}
          {sessions.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg text-anthracite">Alle sessies</h3>
                {filteredSessions.length !== sessions.length && (
                  <span className="text-xs text-anthracite-soft/40 font-sans">
                    {filteredSessions.length} resultaten
                  </span>
                )}
              </div>

              {/* ─── Tag Statistics Section ─── */}
              <TagStatistics
                sessions={sessions}
                onTagClick={handleTagStatisticsClick}
                activeFilterTags={activeFilterTags}
              />

              <div ref={filterSectionRef}>
                <SessionFilters
                  sessions={sessions}
                  onFilteredChange={handleFilteredChange}
                  externalTagFilter={externalTagFilter}
                  onExternalTagFilterHandled={handleExternalTagFilterHandled}
                  onActiveTagsChange={handleActiveTagsChange}
                />
              </div>
            </div>
          )}


          {/* Session list */}
          <div>
            {sessions.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-anthracite-soft/40 font-sans text-sm">Nog geen sessies opgeslagen.</p>
                <button
                  onClick={() => setCurrentView('home')}
                  className="mt-4 px-6 py-2.5 rounded-2xl bg-cream border border-gold-light/30 hover:border-gold/30 transition-all duration-300 text-anthracite font-sans text-sm"
                >
                  Begin je eerste sessie
                </button>
              </div>
            ) : filteredSessions.length > 0 ? (
              <div className="space-y-6">
                {monthGroups.map((group) => {
                  const isMonthExpanded = expandedMonths.has(group.key);
                  return (
                    <div key={group.key}>
                      {/* ─── Month header ─── */}
                      <button
                        onClick={() => toggleMonth(group.key)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-cream/40 border border-sand-dark/10 hover:border-gold-light/25 transition-all duration-200 group"
                      >
                        <div className="flex items-center gap-3">
                          <svg
                            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`text-anthracite-soft/40 transition-transform duration-200 ${isMonthExpanded ? 'rotate-90' : ''}`}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          <span className="font-serif text-base text-anthracite capitalize">{group.label}</span>
                        </div>
                        <span className="text-xs text-anthracite-soft/40 font-sans">
                          {group.sessions.length} sessie{group.sessions.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      {/* ─── Sessions within month ─── */}
                      {isMonthExpanded && (
                        <div className="space-y-4 mt-3 ml-2 pl-4 border-l-2 border-sand-dark/8">
                {group.sessions.map((s) => (

                  <div key={s.id} className={`rounded-2xl bg-cream/60 border transition-all duration-200 overflow-hidden ${
                    compareIds.has(s.id) ? 'border-sky-300/50 ring-1 ring-sky-200/30' : 'border-sand-dark/15 hover:border-gold-light/30'
                  }`}>
                    {/* Session header row with checkbox */}
                    <div className="flex items-start">
                      {/* Comparison checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompare(s.id);
                        }}
                        className={`flex-shrink-0 mt-5 ml-4 w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center ${
                          compareIds.has(s.id)
                            ? 'bg-sky-500 border-sky-500 text-white'
                            : 'border-sand-dark/25 hover:border-sky-400/50 bg-transparent'
                        }`}
                        title={compareIds.has(s.id) ? 'Deselecteer voor vergelijking' : 'Selecteer voor vergelijking'}
                      >
                        {compareIds.has(s.id) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                      {/* Session info button */}
                      <button
                        onClick={() => handleSelect(s.id)}
                        className="flex-1 text-left p-5"
                      >

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-anthracite font-sans font-medium">
                            {formatDate(s.started_at)}
                          </span>
                          <span className="text-xs text-anthracite-soft/40 font-sans">
                            {formatTime(s.started_at)}
                          </span>
                          {/* Completion indicator */}
                          {s.ended_at && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600/60 font-sans">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Voltooid
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {(s.phases || []).map((p, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-sand-dark/15 text-anthracite-soft">
                                {PHASE_LABELS[p] || p}
                              </span>
                            ))}
                          </div>
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`text-anthracite-soft/40 transition-transform duration-200 ${selectedId === s.id ? 'rotate-180' : ''}`}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>

                      {/* Emotion words */}
                      {(s.emotion_words || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {s.emotion_words.map((w, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gold-light/20 text-anthracite-soft">
                              {w}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Body areas */}
                      {(s.body_areas || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {s.body_areas.map((a, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-sand-dark/10 text-anthracite-soft/60">
                              {(BODY_AREA_LABELS as any)[a] || a}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ─── Tag chips (read-only in collapsed view) ─── */}
                      {(s.custom_tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {s.custom_tags.map((tag, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100/50 border border-violet-200/30 text-violet-700/70">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                <line x1="7" y1="7" x2="7.01" y2="7" />
                              </svg>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}





                      {/* Note preview in collapsed card */}
                      {s.user_notes && editingNoteId !== s.id && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-anthracite-soft/55 font-sans">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-gold-muted/50">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          <span className="line-clamp-2 italic">{s.user_notes}</span>
                        </div>
                      )}

                      {s.crisis_detected && (
                        <p className="text-xs text-red-500/60 font-sans mt-1 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          Crisis gedetecteerd
                        </p>
                      )}
                    </button>
                    </div>


                    {/* ─── Action bar: Note + Tags ─── */}
                    {editingNoteId !== s.id && editingTagsId !== s.id && (
                      <div className="px-5 pb-2 -mt-1 flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingNote(s.id, s.user_notes);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-anthracite-soft/40 hover:text-anthracite-soft/70 font-sans transition-colors duration-200 py-1"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          {s.user_notes ? 'Notitie bewerken' : 'Notitie toevoegen'}
                        </button>
                        <span className="text-anthracite-soft/15">|</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingTags(s.id);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-anthracite-soft/40 hover:text-anthracite-soft/70 font-sans transition-colors duration-200 py-1"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                            <line x1="7" y1="7" x2="7.01" y2="7" />
                          </svg>
                          {(s.custom_tags || []).length > 0 ? 'Tags bewerken' : 'Tags toevoegen'}
                        </button>
                      </div>
                    )}

                    {/* ─── Inline tag editor ─── */}
                    {editingTagsId === s.id && (
                      <div className="px-5 pb-4 pt-1 animate-gentle-fade" onClick={(e) => e.stopPropagation()}>
                        <div className="rounded-xl border border-violet-200/40 bg-warm-white/80 p-3">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/60">
                              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                              <line x1="7" y1="7" x2="7.01" y2="7" />
                            </svg>
                            <span className="text-xs text-anthracite-soft/60 font-sans font-medium">
                              Tags beheren
                            </span>
                            <span className="text-[10px] text-anthracite-soft/25 font-sans ml-auto">
                              {(s.custom_tags || []).length}/10
                            </span>
                          </div>

                          {/* Current tags with remove buttons */}
                          {(s.custom_tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {s.custom_tags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-violet-100/60 border border-violet-200/40 text-violet-800"
                                >
                                  {tag}
                                  <button
                                    onClick={() => removeTag(s.id, tag)}
                                    disabled={savingTags}
                                    className="flex-shrink-0 p-0.5 rounded-full hover:bg-violet-200/50 transition-colors disabled:opacity-40"
                                    title={`Verwijder tag "${tag}"`}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Tag input */}
                          {(s.custom_tags || []).length < 10 && (
                            <div className="relative">
                              <input
                                ref={tagInputRef}
                                type="text"
                                value={tagInput}
                                onChange={(e) => {
                                  setTagInput(e.target.value);
                                  setShowTagSuggestions(true);
                                }}
                                onFocus={() => setShowTagSuggestions(true)}
                                onBlur={() => {
                                  // Delay to allow click on suggestion
                                  setTimeout(() => setShowTagSuggestions(false), 200);
                                }}
                                onKeyDown={(e) => handleTagInputKeyDown(e, s.id)}
                                placeholder="Typ een tag en druk Enter..."
                                className="w-full px-3 py-2 rounded-lg bg-cream/60 border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-violet-300/50 transition-colors duration-200"
                                maxLength={30}
                              />

                              {/* Tag suggestions dropdown */}
                              {showTagSuggestions && (
                                <div className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg bg-warm-white border border-sand-dark/15 shadow-sm">
                                  {getTagSuggestions(s.id).length > 0 ? (
                                    getTagSuggestions(s.id).map((suggestion) => (
                                      <button
                                        key={suggestion}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          addTag(s.id, suggestion);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs font-sans text-anthracite-soft hover:bg-violet-50/50 hover:text-violet-700 transition-colors flex items-center gap-2"
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400/50 flex-shrink-0">
                                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                          <line x1="7" y1="7" x2="7.01" y2="7" />
                                        </svg>
                                        {suggestion}
                                        {allExistingTags.includes(suggestion) && !SUGGESTED_TAGS.includes(suggestion) && (
                                          <span className="text-[10px] text-anthracite-soft/25 ml-auto">eerder gebruikt</span>
                                        )}
                                      </button>
                                    ))
                                  ) : tagInput.trim() ? (
                                    <button
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        addTag(s.id, tagInput);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs font-sans text-violet-600 hover:bg-violet-50/50 transition-colors flex items-center gap-2"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                      </svg>
                                      Maak tag "{tagInput.trim().toLowerCase()}"
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Footer with hint + close */}
                          <div className="flex items-center justify-between mt-2.5">
                            <span className="text-[10px] text-anthracite-soft/25 font-sans">
                              Enter om toe te voegen, max 10 tags
                            </span>
                            <button
                              onClick={cancelEditingTags}
                              className="px-3 py-1.5 rounded-lg text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans transition-colors duration-200 border border-sand-dark/15 hover:border-sand-dark/25"
                            >
                              Sluiten
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ─── Inline note editor ─── */}
                    {editingNoteId === s.id && (
                      <div className="px-5 pb-4 pt-1 animate-gentle-fade">
                        <div className="rounded-xl border border-gold-light/30 bg-warm-white/80 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted/60">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            <span className="text-xs text-anthracite-soft/60 font-sans font-medium">
                              Persoonlijke notitie
                            </span>
                          </div>
                          <textarea
                            ref={noteTextareaRef}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelEditingNote();
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(s.id);
                            }}
                            placeholder="Schrijf hier je reflectie, inzicht of persoonlijke notitie over deze sessie..."
                            className="w-full min-h-[80px] max-h-[200px] px-3 py-2.5 rounded-lg bg-cream/60 border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/40 resize-y transition-colors duration-200 leading-relaxed"
                            maxLength={2000}
                          />
                          <div className="flex items-center justify-between mt-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-anthracite-soft/25 font-sans">
                                {noteText.length}/2000
                              </span>
                              {noteText.length > 0 && (
                                <span className="text-[10px] text-anthracite-soft/20 font-sans hidden sm:inline">
                                  Ctrl+Enter om op te slaan
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Delete note button (only if note already exists) */}
                              {s.user_notes && (
                                <button
                                  onClick={() => deleteNote(s.id)}
                                  disabled={savingNote}
                                  className="px-2.5 py-1.5 rounded-lg text-xs text-red-500/50 hover:text-red-500/80 hover:bg-red-50/50 font-sans transition-colors duration-200 disabled:opacity-40"
                                >
                                  Verwijderen
                                </button>
                              )}
                              <button
                                onClick={cancelEditingNote}
                                disabled={savingNote}
                                className="px-3 py-1.5 rounded-lg text-xs text-anthracite-soft/50 hover:text-anthracite-soft font-sans transition-colors duration-200 border border-sand-dark/15 hover:border-sand-dark/25 disabled:opacity-40"
                              >
                                Annuleren
                              </button>
                              <button
                                onClick={() => saveNote(s.id)}
                                disabled={savingNote || noteSaveStatus === 'success'}
                                className={`px-4 py-1.5 rounded-lg text-xs font-sans font-medium transition-all duration-200 disabled:opacity-60 ${
                                  noteSaveStatus === 'success'
                                    ? 'bg-emerald-100/60 text-emerald-700 border border-emerald-300/30'
                                    : noteSaveStatus === 'error'
                                    ? 'bg-red-100/60 text-red-700 border border-red-300/30'
                                    : 'bg-gold-light/20 text-anthracite border border-gold-light/30 hover:bg-gold-light/30 hover:border-gold/30'
                                }`}
                              >
                                {savingNote ? (
                                  <span className="flex items-center gap-1.5">
                                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                    </svg>
                                    Opslaan...
                                  </span>
                                ) : noteSaveStatus === 'success' ? (
                                  <span className="flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Opgeslagen
                                  </span>
                                ) : noteSaveStatus === 'error' ? (
                                  <span className="flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    Fout
                                  </span>
                                ) : (
                                  'Opslaan'
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}


                    {/* Expanded detail panel */}
                    {selectedId === s.id && (
                      <div className="border-t border-sand-dark/10 animate-gentle-fade">
                        {/* Tab bar */}
                        <div className="flex border-b border-sand-dark/10">
                          <button
                            onClick={() => setDetailTab('transcript')}
                            className={`flex-1 px-4 py-3 text-xs font-sans uppercase tracking-wider transition-colors duration-200 ${
                              detailTab === 'transcript'
                                ? 'text-anthracite border-b-2 border-gold bg-gold-light/5'
                                : 'text-anthracite-soft/50 hover:text-anthracite-soft/70'
                            }`}
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              Gesprek
                              {messages.length > 0 && (
                                <span className="text-anthracite-soft/30 ml-0.5">({messages.length})</span>
                              )}
                            </span>
                          </button>
                          <button
                            onClick={() => setDetailTab('inzichten')}
                            className={`flex-1 px-4 py-3 text-xs font-sans uppercase tracking-wider transition-colors duration-200 ${
                              detailTab === 'inzichten'
                                ? 'text-anthracite border-b-2 border-gold bg-gold-light/5'
                                : 'text-anthracite-soft/50 hover:text-anthracite-soft/70'
                            }`}
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4" />
                                <path d="M12 8h.01" />
                              </svg>
                              Inzichten
                            </span>
                          </button>

                        </div>

                        {/* Content */}
                        <div className="p-5">
                          {loadingDetail ? (
                            <div className="flex justify-center py-8">
                              <div className="w-5 h-5 rounded-full bg-gold-light/30 animate-breathe" />
                            </div>
                          ) : detailTab === 'transcript' ? (
                            messages.length === 0 ? (
                              <div className="text-center py-8">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-anthracite-soft/20">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <p className="text-xs text-anthracite-soft/40 font-sans">
                                  Geen gespreksberichten opgeslagen voor deze sessie.
                                </p>
                                <p className="text-xs text-anthracite-soft/25 font-sans mt-1">
                                  Berichten worden opgeslagen vanaf nu bij nieuwe sessies.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
                                {messages.map((msg) => {
                                  const quickReplies = parseQuickReplies(msg.quick_replies);
                                  const isUser = msg.role === 'user';

                                  return (
                                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[85%]`}>
                                        <div
                                          className={`px-4 py-3 rounded-2xl text-sm font-sans leading-relaxed ${
                                            isUser
                                              ? 'bg-anthracite/10 text-anthracite border border-anthracite/8 rounded-br-md'
                                              : 'bg-gold-light/10 text-anthracite/85 border border-gold-light/15 rounded-bl-md'
                                          }`}
                                        >
                                          {msg.content}
                                        </div>

                                        {!isUser && quickReplies.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                                            {quickReplies.map((reply, ri) => (
                                              <span
                                                key={ri}
                                                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-sans bg-sand-dark/8 text-anthracite-soft/50 border border-sand-dark/12"
                                              >
                                                {reply}
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        {!isUser && msg.show_body_map && (
                                          <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-anthracite-soft/25">
                                              <circle cx="12" cy="5" r="3" />
                                              <line x1="12" y1="8" x2="12" y2="16" />
                                              <line x1="8" y1="12" x2="16" y2="12" />
                                              <line x1="9" y1="20" x2="12" y2="16" />
                                              <line x1="15" y1="20" x2="12" y2="16" />
                                            </svg>
                                            <span className="text-xs text-anthracite-soft/25 font-sans">
                                              Lichaamskaart
                                              {msg.body_area_selected && (
                                                <> — <span className="text-anthracite-soft/40">{(BODY_AREA_LABELS as any)[msg.body_area_selected] || msg.body_area_selected}</span></>
                                              )}
                                            </span>
                                          </div>
                                        )}

                                        <p className={`text-xs text-anthracite-soft/20 font-sans mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                                          {formatMessageTime(msg.created_at)}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          ) : (
                            /* ─── Inzichten tab: warm Inner Kompas reflectie ─── */
                            (() => {
                              const insight = generateWarmInsightText(s);
                              const hasContent = (s.emotion_words || []).length > 0 || s.summary || (s.body_areas || []).length > 0;
                              return hasContent ? (
                                <div className="space-y-4">
                                  <p className="text-sm text-anthracite/80 font-sans leading-relaxed">
                                    {insight.reflection}
                                  </p>
                                  <p className="text-sm text-anthracite-soft/65 font-sans leading-relaxed italic">
                                    {insight.closing}
                                  </p>
                                </div>
                              ) : (
                                <div className="text-center py-6">
                                  <p className="text-sm text-anthracite-soft/50 font-sans italic">
                                    Je nam ruimte om bij jezelf stil te staan. Dat was al een vorm van zorg.

                                  </p>
                                </div>
                              );
                            })()

                          )}
                        </div>


                        {/* ─── Tags display in expanded detail ─── */}
                        {(s.custom_tags || []).length > 0 && editingTagsId !== s.id && (
                          <div className="mx-5 mb-3 p-3 rounded-xl bg-violet-50/30 border border-violet-200/20">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500/50">
                                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                  <line x1="7" y1="7" x2="7.01" y2="7" />
                                </svg>
                                <span className="text-xs text-anthracite-soft/50 font-sans font-medium uppercase tracking-wider">
                                  Tags
                                </span>
                              </div>
                              <button
                                onClick={() => startEditingTags(s.id)}
                                className="text-xs text-anthracite-soft/35 hover:text-anthracite-soft/60 font-sans transition-colors"
                              >
                                Bewerken
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {s.custom_tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-violet-100/50 border border-violet-200/30 text-violet-700/80">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                    <line x1="7" y1="7" x2="7.01" y2="7" />
                                  </svg>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ─── Note display in expanded detail ─── */}
                        {s.user_notes && editingNoteId !== s.id && (
                          <div className="mx-5 mb-5 p-4 rounded-xl bg-gold-light/8 border border-gold-light/15">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-muted/50">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                                <span className="text-xs text-anthracite-soft/50 font-sans font-medium uppercase tracking-wider">
                                  Persoonlijke notitie
                                </span>
                              </div>
                              <button
                                onClick={() => startEditingNote(s.id, s.user_notes)}
                                className="text-xs text-anthracite-soft/35 hover:text-anthracite-soft/60 font-sans transition-colors"
                              >
                                Bewerken
                              </button>
                            </div>
                            <p className="text-sm text-anthracite/80 font-sans leading-relaxed whitespace-pre-wrap">
                              {s.user_notes}
                            </p>
                          </div>
                        )}
                      </div>

                    )}
                  </div>
                ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

        </>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-sand-dark/15 text-center">
        <p className="text-xs text-anthracite-soft/30 font-sans">
          Je sessiegegevens worden veilig opgeslagen en zijn alleen voor jou zichtbaar.
        </p>
      </div>

      {/* ─── Session Comparison Modal ─── */}
      {showComparison && comparisonSessions.length >= 2 && (
        <SessionComparison
          sessions={comparisonSessions}
          onClose={() => setShowComparison(false)}
        />
      )}
    </div>
  );
};

export default MijnSessies;
