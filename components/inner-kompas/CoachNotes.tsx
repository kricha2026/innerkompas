import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface CoachNote {
  id: string;
  session_id: string;
  coach_id: string | null;
  note_text: string;
  flagged_for_followup: boolean;
  key_therapeutic_moments: string[];
  created_at: string;
  updated_at: string;
}

interface CoachNotesProps {
  sessionId: string;
  coachId?: string;
}

const MOMENT_SUGGESTIONS = [
  'Doorbraak / inzicht',
  'Emotionele opening',
  'Patroonherkenning',
  'Lichaamsbewustzijn',
  'Weerstand / verdediging',
  'Vertrouwensmoment',
  'Regulatie bereikt',
  'Terugval / regressie',
  'Verbinding met kern',
  'Kracht / veerkracht zichtbaar',
];

const CoachNotes: React.FC<CoachNotesProps> = ({ sessionId, coachId }) => {
  const [note, setNote] = useState<CoachNote | null>(null);
  const [noteText, setNoteText] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [moments, setMoments] = useState<string[]>([]);
  const [momentInput, setMomentInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showMomentSuggestions, setShowMomentSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const momentInputRef = useRef<HTMLInputElement>(null);

  // Load existing note
  useEffect(() => {
    loadNote();
  }, [sessionId]);

  const loadNote = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ik_coach_notes')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (data && !error) {
        setNote(data);
        setNoteText(data.note_text || '');
        setFlagged(data.flagged_for_followup || false);
        setMoments(data.key_therapeutic_moments || []);
      } else {
        setNote(null);
        setNoteText('');
        setFlagged(false);
        setMoments([]);
      }
    } catch (e) {
      console.error('Error loading coach note:', e);
    }
    setLoading(false);
  };

  const saveNote = useCallback(async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const noteData = {
        session_id: sessionId,
        coach_id: coachId || null,
        note_text: noteText.trim(),
        flagged_for_followup: flagged,
        key_therapeutic_moments: moments,
        updated_at: new Date().toISOString(),
      };

      if (note) {
        // Update existing
        const { error } = await supabase
          .from('ik_coach_notes')
          .update(noteData)
          .eq('id', note.id);
        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('ik_coach_notes')
          .insert(noteData)
          .select('*')
          .single();
        if (error) throw error;
        if (data) setNote(data);
      }

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Error saving coach note:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
    setSaving(false);
  }, [sessionId, coachId, noteText, flagged, moments, note]);

  const toggleFollowUp = async () => {
    const newFlagged = !flagged;
    setFlagged(newFlagged);

    // Auto-save flag change
    if (note) {
      try {
        await supabase
          .from('ik_coach_notes')
          .update({
            flagged_for_followup: newFlagged,
            updated_at: new Date().toISOString(),
          })
          .eq('id', note.id);
      } catch (e) {
        console.error('Error updating flag:', e);
      }
    }
  };

  const addMoment = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || moments.includes(trimmed) || moments.length >= 10) return;
    setMoments(prev => [...prev, trimmed]);
    setMomentInput('');
    setShowMomentSuggestions(false);
  };

  const removeMoment = (momentToRemove: string) => {
    setMoments(prev => prev.filter(m => m !== momentToRemove));
  };

  const filteredSuggestions = MOMENT_SUGGESTIONS.filter(
    s => !moments.includes(s) && (!momentInput.trim() || s.toLowerCase().includes(momentInput.toLowerCase()))
  ).slice(0, 6);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-4 h-4 rounded-full bg-gold-light/30 animate-breathe" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with follow-up flag */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500/60">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <h4 className="text-xs font-sans text-anthracite-soft/60 uppercase tracking-wider font-medium">
            Coach notities
          </h4>
          <span className="text-[10px] text-anthracite-soft/25 font-sans">
            (alleen zichtbaar voor coach)
          </span>
        </div>

        <button
          onClick={toggleFollowUp}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-all duration-200 border ${
            flagged
              ? 'bg-amber-100/60 border-amber-300/40 text-amber-700 hover:bg-amber-100/80'
              : 'bg-cream/60 border-sand-dark/15 text-anthracite-soft/50 hover:border-amber-300/30 hover:text-amber-600'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          {flagged ? 'Follow-up gepland' : 'Markeer voor follow-up'}
        </button>
      </div>

      {/* Note textarea */}
      <div>
        <textarea
          ref={textareaRef}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();
          }}
          placeholder="Schrijf hier je observaties, klinische notities en aandachtspunten voor deze sessie..."
          className="w-full min-h-[120px] max-h-[300px] px-4 py-3 rounded-xl bg-cream/60 border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-sky-300/40 resize-y transition-colors duration-200 leading-relaxed"
          maxLength={5000}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-anthracite-soft/25 font-sans">
            {noteText.length}/5000 — Ctrl+Enter om op te slaan
          </span>
        </div>
      </div>

      {/* Key therapeutic moments */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500/50">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <h5 className="text-xs font-sans text-anthracite-soft/50 font-medium">
            Sleutelmomenten
          </h5>
          <span className="text-[10px] text-anthracite-soft/25 font-sans">
            {moments.length}/10
          </span>
        </div>

        {/* Current moments */}
        {moments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {moments.map((moment, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-100/50 border border-purple-200/30 text-purple-700/80"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {moment}
                <button
                  onClick={() => removeMoment(moment)}
                  className="flex-shrink-0 p-0.5 rounded-full hover:bg-purple-200/50 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Moment input */}
        {moments.length < 10 && (
          <div className="relative">
            <input
              ref={momentInputRef}
              type="text"
              value={momentInput}
              onChange={(e) => {
                setMomentInput(e.target.value);
                setShowMomentSuggestions(true);
              }}
              onFocus={() => setShowMomentSuggestions(true)}
              onBlur={() => setTimeout(() => setShowMomentSuggestions(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMoment(momentInput);
                }
              }}
              placeholder="Typ een sleutelmoment..."
              className="w-full px-3 py-2 rounded-lg bg-cream/60 border border-sand-dark/15 text-sm text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-purple-300/40 transition-colors duration-200"
              maxLength={100}
            />

            {showMomentSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-warm-white border border-sand-dark/15 shadow-sm">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addMoment(suggestion);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-sans text-anthracite-soft hover:bg-purple-50/50 hover:text-purple-700 transition-colors flex items-center gap-2"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400/50 flex-shrink-0">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {suggestion}
                  </button>
                ))}
                {momentInput.trim() && !filteredSuggestions.some(s => s.toLowerCase() === momentInput.trim().toLowerCase()) && (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addMoment(momentInput);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-sans text-purple-600 hover:bg-purple-50/50 transition-colors flex items-center gap-2 border-t border-sand-dark/10"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Voeg toe: "{momentInput.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {note && (
          <span className="text-[10px] text-anthracite-soft/25 font-sans">
            Laatst opgeslagen: {new Date(note.updated_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          onClick={saveNote}
          disabled={saving || saveStatus === 'success'}
          className={`px-5 py-2 rounded-xl text-xs font-sans font-medium transition-all duration-200 disabled:opacity-60 ${
            saveStatus === 'success'
              ? 'bg-emerald-100/60 text-emerald-700 border border-emerald-300/30'
              : saveStatus === 'error'
              ? 'bg-red-100/60 text-red-700 border border-red-300/30'
              : 'bg-sky-100/40 text-sky-700 border border-sky-200/40 hover:bg-sky-100/60 hover:border-sky-300/40'
          }`}
        >
          {saving ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Opslaan...
            </span>
          ) : saveStatus === 'success' ? (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Opgeslagen
            </span>
          ) : saveStatus === 'error' ? (
            'Fout bij opslaan'
          ) : (
            'Notities opslaan'
          )}
        </button>
      </div>
    </div>
  );
};

export default CoachNotes;
