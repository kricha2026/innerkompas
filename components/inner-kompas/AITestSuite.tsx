import React, { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface TestCase {
  id: string;
  label: string;
  mechanism: string;
  message: string;
  mustContain: string[];
  mustNotContain: string[];
}

interface TestResult {
  testId: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'error';
  response?: string;
  quickReplies?: string[];
  compassState?: string;
  activeAgent?: string;
  matchedTerms: string[];
  failedTerms: string[];
  blockedTerms: string[];
  duration?: number;
  error?: string;
  rawJson?: boolean;
  excessiveQuickReplies?: boolean;
  duplicateQuickReplies?: boolean;
}

const TEST_CASES: TestCase[] = [
  {
    id: 'control_through_thinking',
    label: 'Controle via denken',
    mechanism: 'control_through_thinking',
    message: 'Als ik kritiek krijg op werk dan schiet mijn hoofd aan en ga ik alles analyseren',
    mustContain: ['controle', 'analyseren', 'hoofd probeert grip', 'hoofd probeert controle', 'hoofd neemt over', 'denken', 'grip'],
    mustNotContain: ['dat klinkt moeilijk', 'dat is begrijpelijk'],
  },
  {
    id: 'protective_withdrawal',
    label: 'Beschermend terugtrekken',
    mechanism: 'protective_withdrawal',
    message: 'Ik trek me altijd terug als het te dichtbij komt, dan bouw ik een muur',
    mustContain: ['terugtrekken', 'beschermen', 'muur', 'afstand', 'veiligheid', 'bescherming'],
    mustNotContain: [],
  },
  {
    id: 'overfunctioning',
    label: 'Overfunctioneren',
    mechanism: 'overfunctioning',
    message: 'Bij stress ga ik altijd harder werken tot ik instort',
    mustContain: ['harder werken', 'controle', 'overfunctioneren', 'presteren', 'druk', 'instort', 'inspanning'],
    mustNotContain: [],
  },
];

const AITestSuite: React.FC = () => {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);

  const runSingleTest = useCallback(async (testCase: TestCase): Promise<TestResult> => {
    const startTime = Date.now();
    
    try {
      const invokeBody = {
        messages: [
          { role: 'user', content: testCase.message },
        ],
        phase: 'regulation',
        sessionContext: {
          detectedMode: null,
          emotionWords: [],
          bodyAreas: [],
          isStable: false,
          messageCount: 1,
          lastMessageHasEmotion: false,
          lastMessageNoBodySensation: false,
          noBodySensationCount: 0,
          lastMessageProcessFrustration: false,
          lastMessageText: testCase.message,
          flowStage: 'none',
          lastMessageHasStoryTrigger: false,
          lastMessageHasBodySensation: false,
          isRelaxing: false,
          isOverwhelmed: false,
          isSlowingDown: false,
          flowInstructions: [],
          bodyBoundarySet: false,
          isSomaticEntry: false,
          isCognitiveEntry: false,
          isTraumaActivation: false,
          isFixControl: false,
          innerFocusWorsening: false,
        },
      };

      const { data, error } = await supabase.functions.invoke('inner-kompas-chat', {
        body: invokeBody,
      });

      const duration = Date.now() - startTime;

      if (error || !data) {
        return {
          testId: testCase.id,
          status: 'error',
          error: error?.message || 'No data returned',
          matchedTerms: [],
          failedTerms: [],
          blockedTerms: [],
          duration,
        };
      }

      const responseText = (data.message || '').toLowerCase();
      const quickReplies = Array.isArray(data.quickReplies) ? data.quickReplies : [];

      // Check for raw JSON in response
      const rawJson = responseText.includes('"message"') || responseText.includes('"quickreplies"') || responseText.startsWith('{');

      // Check for excessive quick replies
      const excessiveQuickReplies = quickReplies.length > 3;

      // Check for duplicate quick replies
      const normalizedReplies = quickReplies.map((r: string) => r.toLowerCase().trim());
      const duplicateQuickReplies = new Set(normalizedReplies).size !== normalizedReplies.length;

      // Check mustContain (at least one must match)
      const matchedTerms = testCase.mustContain.filter(term => responseText.includes(term.toLowerCase()));
      const failedTerms = matchedTerms.length === 0 ? testCase.mustContain : [];

      // Check mustNotContain (none should match)
      const blockedTerms = testCase.mustNotContain.filter(term => responseText.includes(term.toLowerCase()));

      const passed = matchedTerms.length > 0 && blockedTerms.length === 0 && !rawJson && !excessiveQuickReplies && !duplicateQuickReplies;

      return {
        testId: testCase.id,
        status: passed ? 'pass' : 'fail',
        response: data.message,
        quickReplies,
        compassState: data.compassState,
        activeAgent: data.activeAgent,
        matchedTerms,
        failedTerms,
        blockedTerms,
        duration,
        rawJson,
        excessiveQuickReplies,
        duplicateQuickReplies,
      };
    } catch (err: any) {
      return {
        testId: testCase.id,
        status: 'error',
        error: err?.message || 'Unknown error',
        matchedTerms: [],
        failedTerms: [],
        blockedTerms: [],
        duration: Date.now() - startTime,
      };
    }
  }, []);

  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    
    // Set all to running
    const initialResults: Record<string, TestResult> = {};
    for (const tc of TEST_CASES) {
      initialResults[tc.id] = {
        testId: tc.id,
        status: 'running',
        matchedTerms: [],
        failedTerms: [],
        blockedTerms: [],
      };
    }
    setResults(initialResults);

    // Run tests sequentially to avoid rate limiting
    for (const tc of TEST_CASES) {
      const result = await runSingleTest(tc);
      setResults(prev => ({ ...prev, [tc.id]: result }));
    }

    setRunCount(prev => prev + 1);
    setIsRunning(false);
  }, [runSingleTest]);

  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const errorCount = Object.values(results).filter(r => r.status === 'error').length;
  const totalRun = passCount + failCount + errorCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg text-anthracite">AI Mechanisme Test Suite</h3>
          <p className="text-xs text-anthracite-soft/50 font-sans mt-1">
            Valideert of de AI mechanismen correct herkent en reflecteert
          </p>
        </div>
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className={`px-5 py-2.5 rounded-xl text-sm font-sans transition-all duration-200 ${
            isRunning
              ? 'bg-sand-dark/20 text-anthracite-soft/40 cursor-not-allowed'
              : 'bg-anthracite text-sand-light hover:bg-anthracite-light'
          }`}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-sand-light/30 border-t-sand-light animate-spin" />
              Tests draaien...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {runCount > 0 ? 'Opnieuw draaien' : 'Tests starten'}
            </span>
          )}
        </button>
      </div>

      {/* Summary bar */}
      {totalRun > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-cream/70 border border-sand-dark/15">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${passCount === TEST_CASES.length ? 'bg-emerald-400' : failCount > 0 || errorCount > 0 ? 'bg-amber-400' : 'bg-sand-dark/30'}`} />
            <span className="text-sm font-sans text-anthracite font-medium">
              {passCount}/{TEST_CASES.length} geslaagd
            </span>
          </div>
          {failCount > 0 && (
            <span className="text-xs font-sans text-red-500/70">
              {failCount} gefaald
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-xs font-sans text-amber-500/70">
              {errorCount} fout(en)
            </span>
          )}
          <span className="text-xs font-sans text-anthracite-soft/40 ml-auto">
            Run #{runCount}
          </span>
        </div>
      )}

      {/* Test cases */}
      <div className="space-y-4">
        {TEST_CASES.map((tc) => {
          const result = results[tc.id];
          const statusColors: Record<string, string> = {
            pending: 'border-sand-dark/15 bg-cream/40',
            running: 'border-gold-light/40 bg-gold-light/5',
            pass: 'border-emerald-200/50 bg-emerald-50/30',
            fail: 'border-red-200/50 bg-red-50/30',
            error: 'border-amber-200/50 bg-amber-50/30',
          };
          const status = result?.status || 'pending';

          return (
            <div key={tc.id} className={`rounded-2xl border ${statusColors[status]} overflow-hidden transition-all duration-300`}>
              {/* Test header */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    {status === 'running' && (
                      <div className="w-4 h-4 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
                    )}
                    {status === 'pass' && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {status === 'fail' && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                    {status === 'error' && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )}
                    {status === 'pending' && (
                      <div className="w-4 h-4 rounded-full bg-sand-dark/20" />
                    )}
                    <h4 className="text-sm font-sans font-medium text-anthracite">{tc.label}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sand-dark/10 text-anthracite-soft/50 font-sans">
                      {tc.mechanism}
                    </span>
                  </div>
                  {result?.duration && (
                    <span className="text-[10px] text-anthracite-soft/40 font-sans">
                      {(result.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>

                {/* Input message */}
                <div className="p-3 rounded-xl bg-anthracite/5 border border-anthracite/8 mb-3">
                  <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1">Input</p>
                  <p className="text-xs text-anthracite font-sans">{tc.message}</p>
                </div>

                {/* Validation criteria */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-[10px] text-anthracite-soft/40 font-sans">Moet bevatten (1+):</span>
                  {tc.mustContain.map((term, i) => {
                    const matched = result?.matchedTerms?.includes(term);
                    return (
                      <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${
                        !result ? 'bg-sand-dark/8 text-anthracite-soft/50' :
                        matched ? 'bg-emerald-100/60 text-emerald-700' : 'bg-sand-dark/8 text-anthracite-soft/40'
                      }`}>
                        {term}
                      </span>
                    );
                  })}
                </div>
                {tc.mustNotContain.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-anthracite-soft/40 font-sans">Mag NIET bevatten:</span>
                    {tc.mustNotContain.map((term, i) => {
                      const blocked = result?.blockedTerms?.includes(term);
                      return (
                        <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${
                          !result ? 'bg-sand-dark/8 text-anthracite-soft/50' :
                          blocked ? 'bg-red-100/60 text-red-700' : 'bg-emerald-100/60 text-emerald-700'
                        }`}>
                          {term}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Response */}
              {result && (result.status === 'pass' || result.status === 'fail') && result.response && (
                <div className="border-t border-sand-dark/10 p-4 bg-cream/20">
                  <p className="text-[10px] text-anthracite-soft/40 font-sans uppercase tracking-wider mb-1.5">AI Response</p>
                  <p className="text-xs text-anthracite font-sans leading-relaxed mb-3">{result.response}</p>
                  
                  <div className="flex flex-wrap gap-3 text-[10px] font-sans text-anthracite-soft/50">
                    {result.compassState && (
                      <span>Kompas: <span className="text-anthracite-soft">{result.compassState}</span></span>
                    )}
                    {result.activeAgent && (
                      <span>Agent: <span className="text-anthracite-soft">{result.activeAgent}</span></span>
                    )}
                    {result.quickReplies && result.quickReplies.length > 0 && (
                      <span>Quick replies: <span className="text-anthracite-soft">{result.quickReplies.join(' | ')}</span></span>
                    )}
                  </div>

                  {/* Bug indicators */}
                  {(result.rawJson || result.excessiveQuickReplies || result.duplicateQuickReplies) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.rawJson && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100/60 text-red-600 font-sans">
                          Raw JSON in response
                        </span>
                      )}
                      {result.excessiveQuickReplies && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100/60 text-red-600 font-sans">
                          {'>'}3 quick replies
                        </span>
                      )}
                      {result.duplicateQuickReplies && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100/60 text-red-600 font-sans">
                          Duplicate quick replies
                        </span>
                      )}
                    </div>
                  )}

                  {/* Failure details */}
                  {result.status === 'fail' && (
                    <div className="mt-3 p-2.5 rounded-lg bg-red-50/50 border border-red-200/30">
                      <p className="text-[10px] text-red-600 font-sans font-medium mb-1">Reden van falen:</p>
                      {result.matchedTerms.length === 0 && (
                        <p className="text-[10px] text-red-500/70 font-sans">
                          Geen van de verwachte termen gevonden in de response
                        </p>
                      )}
                      {result.blockedTerms.length > 0 && (
                        <p className="text-[10px] text-red-500/70 font-sans">
                          Geblokkeerde termen gevonden: {result.blockedTerms.join(', ')}
                        </p>
                      )}
                      {result.rawJson && (
                        <p className="text-[10px] text-red-500/70 font-sans">Raw JSON gedetecteerd in response</p>
                      )}
                      {result.excessiveQuickReplies && (
                        <p className="text-[10px] text-red-500/70 font-sans">Meer dan 3 quick replies</p>
                      )}
                      {result.duplicateQuickReplies && (
                        <p className="text-[10px] text-red-500/70 font-sans">Dubbele quick replies gedetecteerd</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {result?.status === 'error' && (
                <div className="border-t border-amber-200/30 p-4 bg-amber-50/20">
                  <p className="text-xs text-amber-600 font-sans">{result.error}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AITestSuite;
