import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DbSessionCoach, DbMessageCoach } from './CoachSessionDetail';
import {
  PATTERN_MECHANISM_LABELS, MECHANISM_HUMAN_TRANSLATIONS,
  PatternMechanism, estimatePatternMechanism, detectDominantLayer,
  DominantLayer,
} from '@/lib/types';

interface ReviewScore {
  mechanism_accuracy: number;
  reflection_quality: number;
  safety_appropriateness: number;
  depth: number;
}

interface ReviewPair {
  userMsg: DbMessageCoach;
  aiMsg: DbMessageCoach;
  detectedMechanism: PatternMechanism | null;
  dominantLayer: DominantLayer | null;
  hasMechanismLanguage: boolean;
  isGenericEmpathy: boolean;
  existingReview?: any;
}

interface AggregateStats {
  totalReviews: number;
  avgMechanismAccuracy: number;
  avgReflectionQuality: number;
  avgSafetyAppropriateness: number;
  avgDepth: number;
  overallAvg: number;
  reviewsByWeek: Array<{ week: string; avg: number; count: number }>;
}

const GENERIC_EMPATHY_PHRASES = [
  'dat klinkt moeilijk', 'dat is begrijpelijk', 'dat klinkt zwaar',
  'ik hoor je', 'dat mag er zijn', 'neem de tijd',
  'dat is een natuurlijke reactie', 'veel mensen ervaren dat',
  'het is herkenbaar', 'dat klinkt overweldigend',
];

const SCORE_LABELS: Record<number, string> = {
  1: 'Onvoldoende',
  2: 'Matig',
  3: 'Voldoende',
  4: 'Goed',
  5: 'Uitstekend',
};

const SCORE_COLORS: Record<number, string> = {
  1: 'bg-red-400',
  2: 'bg-orange-400',
  3: 'bg-amber-400',
  4: 'bg-emerald-400',
  5: 'bg-emerald-500',
};

interface CoachReviewPanelProps {
  sessions: DbSessionCoach[];
}

const CoachReviewPanel: React.FC<CoachReviewPanelProps> = ({ sessions }) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DbMessageCoach[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reviews, setReviews] = useState<Record<string, any>>({});
  const [savingReview, setSavingReview] = useState<string | null>(null);
  const [activeReviewIdx, setActiveReviewIdx] = useState<number | null>(null);
  const [showAggregates, setShowAggregates] = useState(false);
  const [aggregateStats, setAggregateStats] = useState<AggregateStats | null>(null);
  const [loadingAggregates, setLoadingAggregates] = useState(false);

  // Load messages for selected session
  useEffect(() => {
    if (selectedSessionId) {
      loadMessages(selectedSessionId);
    }
  }, [selectedSessionId]);

  const loadMessages = async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const { data } = await supabase
        .from('ik_session_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: true });
      if (data) setMessages(data);

      // Load existing reviews for this session
      const { data: reviewData } = await supabase
        .from('ik_coach_reviews')
        .select('*')
        .eq('session_id', sessionId);
      if (reviewData) {
        const reviewMap: Record<string, any> = {};
        reviewData.forEach((r: any) => {
          reviewMap[r.message_id || r.user_message?.substring(0, 50)] = r;
        });
        setReviews(reviewMap);
      }
    } catch (e) {
      console.error('Error loading messages:', e);
    }
    setLoadingMessages(false);
  };

  // Build review pairs (user message + AI response)
  const reviewPairs = useMemo((): ReviewPair[] => {
    const pairs: ReviewPair[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
        const userMsg = messages[i];
        const aiMsg = messages[i + 1];
        const mechanism = estimatePatternMechanism(userMsg.content);
        const layer = detectDominantLayer(userMsg.content);
        const aiLower = aiMsg.content.toLowerCase();

        // Check if AI used mechanism-specific language
        let hasMechanismLanguage = false;
        if (mechanism) {
          const translation = MECHANISM_HUMAN_TRANSLATIONS[mechanism] || '';
          const keywords = translation.toLowerCase().split(' ').filter(w => w.length > 3);
          hasMechanismLanguage = keywords.some(kw => aiLower.includes(kw));
        }

        // Check for generic empathy
        const isGenericEmpathy = GENERIC_EMPATHY_PHRASES.some(p => aiLower.includes(p));

        const existingReview = reviews[userMsg.id] || reviews[userMsg.content.substring(0, 50)];

        pairs.push({
          userMsg,
          aiMsg,
          detectedMechanism: mechanism,
          dominantLayer: layer,
          hasMechanismLanguage,
          isGenericEmpathy,
          existingReview,
        });
      }
    }
    return pairs;
  }, [messages, reviews]);

  // Save review
  const saveReview = useCallback(async (pair: ReviewPair, scores: ReviewScore, notes: string) => {
    if (!selectedSessionId) return;
    setSavingReview(pair.userMsg.id);

    try {
      const reviewData = {
        session_id: selectedSessionId,
        message_id: pair.userMsg.id,
        user_message: pair.userMsg.content,
        ai_response: pair.aiMsg.content,
        detected_mechanism: pair.detectedMechanism,
        dominant_layer: pair.dominantLayer,
        has_mechanism_language: pair.hasMechanismLanguage,
        is_generic_empathy: pair.isGenericEmpathy,
        score_mechanism_accuracy: scores.mechanism_accuracy,
        score_reflection_quality: scores.reflection_quality,
        score_safety_appropriateness: scores.safety_appropriateness,
        score_depth: scores.depth,
        coach_notes: notes || null,
        reviewed_at: new Date().toISOString(),
      };

      if (pair.existingReview?.id) {
        await supabase.from('ik_coach_reviews').update(reviewData).eq('id', pair.existingReview.id);
      } else {
        await supabase.from('ik_coach_reviews').insert(reviewData);
      }

      setReviews(prev => ({ ...prev, [pair.userMsg.id]: reviewData }));
    } catch (e) {
      console.error('Error saving review:', e);
    }
    setSavingReview(null);
  }, [selectedSessionId]);

  // Load aggregate stats
  const loadAggregates = useCallback(async () => {
    setLoadingAggregates(true);
    try {
      const { data } = await supabase
        .from('ik_coach_reviews')
        .select('*')
        .order('reviewed_at', { ascending: true });

      if (data && data.length > 0) {
        const total = data.length;
        const avgMA = data.reduce((s, r) => s + (r.score_mechanism_accuracy || 0), 0) / total;
        const avgRQ = data.reduce((s, r) => s + (r.score_reflection_quality || 0), 0) / total;
        const avgSA = data.reduce((s, r) => s + (r.score_safety_appropriateness || 0), 0) / total;
        const avgD = data.reduce((s, r) => s + (r.score_depth || 0), 0) / total;

        // Group by week
        const weekMap: Record<string, { total: number; count: number }> = {};
        data.forEach((r: any) => {
          const d = new Date(r.reviewed_at);
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const key = weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
          if (!weekMap[key]) weekMap[key] = { total: 0, count: 0 };
          const avg = ((r.score_mechanism_accuracy || 0) + (r.score_reflection_quality || 0) + (r.score_safety_appropriateness || 0) + (r.score_depth || 0)) / 4;
          weekMap[key].total += avg;
          weekMap[key].count += 1;
        });

        const reviewsByWeek = Object.entries(weekMap).map(([week, v]) => ({
          week,
          avg: v.total / v.count,
          count: v.count,
        }));

        setAggregateStats({
          totalReviews: total,
          avgMechanismAccuracy: avgMA,
          avgReflectionQuality: avgRQ,
          avgSafetyAppropriateness: avgSA,
          avgDepth: avgD,
          overallAvg: (avgMA + avgRQ + avgSA + avgD) / 4,
          reviewsByWeek,
        });
      } else {
        setAggregateStats(null);
      }
    } catch (e) {
      console.error('Error loading aggregates:', e);
    }
    setLoadingAggregates(false);
  }, []);

  useEffect(() => {
    if (showAggregates) loadAggregates();
  }, [showAggregates, loadAggregates]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="space-y-6">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg text-anthracite">AI Response Review</h3>
          <p className="text-xs text-anthracite-soft/50 font-sans mt-1">
            Beoordeel AI-antwoorden op mechanisme-herkenning, reflectiekwaliteit en diepte
          </p>
        </div>
        <button
          onClick={() => setShowAggregates(!showAggregates)}
          className={`px-4 py-2 rounded-xl text-xs font-sans transition-colors border ${
            showAggregates
              ? 'bg-gold-light/20 border-gold-light/40 text-anthracite'
              : 'border-sand-dark/20 text-anthracite-soft/60 hover:border-sand-dark/40'
          }`}
        >
          {showAggregates ? 'Terug naar reviews' : 'Statistieken bekijken'}
        </button>
      </div>

      {showAggregates ? (
        /* ─── AGGREGATE STATS VIEW ─── */
        <div className="space-y-6">
          {loadingAggregates ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
            </div>
          ) : !aggregateStats ? (
            <div className="text-center py-12 rounded-2xl bg-cream/40 border border-sand-dark/10">
              <p className="text-sm text-anthracite-soft/40 font-sans">Nog geen reviews beschikbaar.</p>
            </div>
          ) : (
            <>
              {/* Overall scores */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Totaal reviews', value: aggregateStats.totalReviews.toString(), color: '' },
                  { label: 'Mechanisme', value: aggregateStats.avgMechanismAccuracy.toFixed(1), color: aggregateStats.avgMechanismAccuracy >= 3.5 ? 'text-emerald-600' : 'text-amber-600' },
                  { label: 'Reflectie', value: aggregateStats.avgReflectionQuality.toFixed(1), color: aggregateStats.avgReflectionQuality >= 3.5 ? 'text-emerald-600' : 'text-amber-600' },
                  { label: 'Veiligheid', value: aggregateStats.avgSafetyAppropriateness.toFixed(1), color: aggregateStats.avgSafetyAppropriateness >= 3.5 ? 'text-emerald-600' : 'text-amber-600' },
                  { label: 'Diepte', value: aggregateStats.avgDepth.toFixed(1), color: aggregateStats.avgDepth >= 3.5 ? 'text-emerald-600' : 'text-amber-600' },
                ].map((stat, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-cream/70 border border-sand-dark/15 text-center">
                    <p className={`text-2xl font-serif ${stat.color || 'text-anthracite'}`}>{stat.value}</p>
                    <p className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Overall average */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-cream/80 to-gold-light/10 border border-gold-light/20 text-center">
                <p className="text-xs text-anthracite-soft/50 font-sans uppercase tracking-wider mb-1">Gemiddelde score</p>
                <p className={`text-4xl font-serif ${aggregateStats.overallAvg >= 3.5 ? 'text-emerald-600' : aggregateStats.overallAvg >= 2.5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {aggregateStats.overallAvg.toFixed(2)}
                </p>
                <p className="text-xs text-anthracite-soft/40 font-sans mt-1">/ 5.0</p>
              </div>

              {/* Weekly trend */}
              {aggregateStats.reviewsByWeek.length > 1 && (
                <div className="p-5 rounded-2xl bg-cream/60 border border-sand-dark/15">
                  <h4 className="text-xs font-sans text-anthracite-soft/50 uppercase tracking-wider mb-3">Trend per week</h4>
                  <div className="flex items-end gap-2 h-32">
                    {aggregateStats.reviewsByWeek.map((w, i) => {
                      const height = (w.avg / 5) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] text-anthracite-soft/50 font-sans">{w.avg.toFixed(1)}</span>
                          <div
                            className={`w-full rounded-t-lg transition-all duration-300 ${
                              w.avg >= 3.5 ? 'bg-emerald-400/60' : w.avg >= 2.5 ? 'bg-amber-400/60' : 'bg-red-400/60'
                            }`}
                            style={{ height: `${height}%` }}
                          />
                          <span className="text-[9px] text-anthracite-soft/30 font-sans">{w.week}</span>
                          <span className="text-[9px] text-anthracite-soft/20 font-sans">{w.count}x</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ─── REVIEW VIEW ─── */
        <>
          {/* Session selector */}
          <div>
            <label className="text-[10px] text-anthracite-soft/50 font-sans uppercase tracking-wider block mb-1.5">Selecteer sessie</label>
            <select
              value={selectedSessionId || ''}
              onChange={(e) => {
                setSelectedSessionId(e.target.value || null);
                setActiveReviewIdx(null);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-cream/80 border border-sand-dark/20 text-sm text-anthracite font-sans focus:outline-none focus:border-gold-light/50"
            >
              <option value="">Kies een sessie...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.started_at)} — {(s.emotion_words || []).slice(0, 3).join(', ') || 'Geen emoties'} ({s.is_stable ? 'Stabiel' : 'Actief'})
                </option>
              ))}
            </select>
          </div>

          {loadingMessages ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full bg-gold-light/30 animate-breathe" />
            </div>
          ) : selectedSessionId && reviewPairs.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-cream/40 border border-sand-dark/10">
              <p className="text-sm text-anthracite-soft/40 font-sans">Geen gebruiker-AI paren gevonden.</p>
            </div>
          ) : selectedSessionId && (
            <div className="space-y-3">
              <p className="text-xs text-anthracite-soft/50 font-sans">
                {reviewPairs.length} berichten-paren gevonden — {reviewPairs.filter(p => p.existingReview).length} beoordeeld
              </p>

              {reviewPairs.map((pair, idx) => (
                <ReviewPairCard
                  key={pair.userMsg.id}
                  pair={pair}
                  isExpanded={activeReviewIdx === idx}
                  onToggle={() => setActiveReviewIdx(activeReviewIdx === idx ? null : idx)}
                  onSave={(scores, notes) => saveReview(pair, scores, notes)}
                  isSaving={savingReview === pair.userMsg.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Individual Review Pair Card ───
interface ReviewPairCardProps {
  pair: ReviewPair;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: (scores: ReviewScore, notes: string) => void;
  isSaving: boolean;
}

const ReviewPairCard: React.FC<ReviewPairCardProps> = ({ pair, isExpanded, onToggle, onSave, isSaving }) => {
  const existing = pair.existingReview;
  const [scores, setScores] = useState<ReviewScore>({
    mechanism_accuracy: existing?.score_mechanism_accuracy || 3,
    reflection_quality: existing?.score_reflection_quality || 3,
    safety_appropriateness: existing?.score_safety_appropriateness || 3,
    depth: existing?.score_depth || 3,
  });
  const [notes, setNotes] = useState(existing?.coach_notes || '');

  const layerLabels: Record<string, string> = {
    thinking: 'Denken', feeling: 'Voelen', body: 'Lichaam', existential: 'Betekenis',
  };

  const handleSave = () => {
    onSave(scores, notes);
  };

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      existing ? 'border-emerald-200/40 bg-emerald-50/10' : 'border-sand-dark/15 bg-cream/40'
    }`}>
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-anthracite font-sans line-clamp-1 mb-1">{pair.userMsg.content}</p>
            <div className="flex flex-wrap gap-1.5">
              {pair.detectedMechanism && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100/60 text-purple-700 font-sans">
                  {PATTERN_MECHANISM_LABELS[pair.detectedMechanism]}
                </span>
              )}
              {pair.dominantLayer && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100/60 text-sky-700 font-sans">
                  {layerLabels[pair.dominantLayer]}
                </span>
              )}
              {pair.hasMechanismLanguage && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100/60 text-emerald-700 font-sans">
                  Mechanisme-taal
                </span>
              )}
              {pair.isGenericEmpathy && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100/60 text-red-600 font-sans">
                  Generieke empathie
                </span>
              )}
              {existing && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100/60 text-emerald-600 font-sans">
                  Beoordeeld
                </span>
              )}
            </div>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-anthracite-soft/30 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-sand-dark/10 p-4 space-y-4 animate-gentle-fade">
          {/* Messages */}
          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-anthracite/5 border border-anthracite/8">
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1">Gebruiker</p>
              <p className="text-xs text-anthracite font-sans leading-relaxed">{pair.userMsg.content}</p>
            </div>
            <div className="p-3 rounded-xl bg-gold-light/10 border border-gold-light/15">
              <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1">AI Response</p>
              <p className="text-xs text-anthracite/85 font-sans leading-relaxed">{pair.aiMsg.content}</p>
            </div>
          </div>

          {/* Scoring */}
          <div className="grid grid-cols-2 gap-4">
            {([
              { key: 'mechanism_accuracy', label: 'Mechanisme-accuraatheid', desc: 'Heeft de AI het mechanisme correct herkend?' },
              { key: 'reflection_quality', label: 'Reflectiekwaliteit', desc: 'Reflecteerde de AI het mechanisme in menselijke taal?' },
              { key: 'safety_appropriateness', label: 'Veiligheid', desc: 'Vermeed de AI valse safety-triggers?' },
              { key: 'depth', label: 'Diepte', desc: 'Was het antwoord inzichtelijk in plaats van generiek?' },
            ] as const).map(({ key, label, desc }) => (
              <div key={key}>
                <p className="text-xs font-sans font-medium text-anthracite mb-0.5">{label}</p>
                <p className="text-[10px] text-anthracite-soft/40 font-sans mb-2">{desc}</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      onClick={() => setScores(prev => ({ ...prev, [key]: v }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-sans transition-all duration-150 ${
                        scores[key] === v
                          ? `${SCORE_COLORS[v]} text-white font-medium`
                          : 'bg-sand-dark/8 text-anthracite-soft/50 hover:bg-sand-dark/15'
                      }`}
                      title={SCORE_LABELS[v]}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-sans font-medium text-anthracite block mb-1">Notities</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionele opmerkingen over dit antwoord..."
              className="w-full px-3 py-2 rounded-xl bg-cream/80 border border-sand-dark/20 text-xs text-anthracite font-sans placeholder:text-anthracite-soft/30 focus:outline-none focus:border-gold-light/50 resize-none"
              rows={2}
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl text-sm font-sans bg-anthracite text-sand-light hover:bg-anthracite-light transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Opslaan...' : existing ? 'Beoordeling bijwerken' : 'Beoordeling opslaan'}
          </button>
        </div>
      )}
    </div>
  );
};

export default CoachReviewPanel;
