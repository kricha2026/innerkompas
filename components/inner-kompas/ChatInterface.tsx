import React, { useState, useRef, useEffect } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { ChatMessage, BodyArea, BODY_AREA_LABELS } from '@/lib/types';
import { checkChatHealthCached, invalidateHealthCache } from '@/lib/healthCheck';
import { containsLeakedError } from '@/ai/responseValidation';


import BodyMap from './BodyMap';


// ─── Rendering-level fallback message ───
// Shown ONLY if a technical error string somehow leaks through every prior
// validation/cleaning layer. We do NOT re-run the JSON cleaner here, because
// SessionContext already cleans messages before saving — re-running it at
// render time risks mangling legitimate prose (regression observed Apr 14).
const RENDER_FALLBACK_MESSAGE = 'Ik ben er. Neem even de tijd — vertel wat er speelt.';


const ChatInterface: React.FC = () => {
  const { 
    session, sendMessage, isAiLoading, selectBodyInChat,
    crisisDetected, currentView
  } = useSession();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [isMobile, setIsMobile] = useState(false);

  const messages = session?.messages || [];

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isAiLoading]);

  // Focus input on mount (only on desktop — mobile auto-focus opens keyboard)
  useEffect(() => {
    if (inputRef.current && !isMobile) {
      inputRef.current.focus();
    }
  }, [isMobile]);

  // Health check on mount — verify edge function connectivity
  useEffect(() => {
    let cancelled = false;
    const runCheck = async () => {
      try {
        const result = await checkChatHealthCached();
        if (!cancelled) {
          setConnectionStatus(result.ok ? 'ok' : 'checking');
          if (result.ok) {
            console.log(`%c[HEALTH] Edge function OK%c — ${result.latencyMs}ms, v${result.version || '?'}`, 'color: #38a169; font-weight: bold;', 'color: #718096;');
          } else {
            console.warn(`[HEALTH] Edge function unreachable: ${result.error}`);
          }
        }
      } catch {
        if (!cancelled) setConnectionStatus('checking');
      }
    };
    runCheck();
    return () => { cancelled = true; };
  }, []);

  // Re-check health after a failed message send
  useEffect(() => {
    if (!isAiLoading && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      // If the last assistant message is a fallback, re-check health
      if (lastMsg.role === 'assistant' && lastMsg.content === 'Ik ben er. Neem even de tijd.') {
        invalidateHealthCache();
        checkChatHealthCached().then(result => {
        setConnectionStatus(result.ok ? 'ok' : 'checking');  
        });
      }
    }
  }, [messages.length, isAiLoading]);


  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isAiLoading) return;
    setInputText('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await sendMessage(text);
    // On mobile, don't auto-focus (keeps keyboard open which is good)
    // On desktop, refocus
    if (!isMobile) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    }
  };

  const handleQuickReply = async (reply: string) => {
    if (isAiLoading) return;
    setInputText('');
    await sendMessage(reply);
  };

  const handleBodySelect = async (area: BodyArea) => {
    selectBodyInChat(area);
    await sendMessage(`Ik voel het in mijn ${BODY_AREA_LABELS[area].toLowerCase()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  // Phase label — the only label shown to clients
  const phaseLabel = currentView === 'regulation' 
    ? 'Regulatie' 
    : currentView === 'holding' 
      ? 'Duiding' 
      : currentView === 'kern' 
        ? 'Naar de kern' 
        : '';

  // Find last assistant message for showing interactive elements
  const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant');
  const lastAssistantMessage = lastAssistantIdx >= 0 
    ? messages[messages.length - 1 - lastAssistantIdx] 
    : null;


  return (
    <div className="flex flex-col h-full bg-sand">

      {/* Phase indicator with connectivity status */}
      <div className="flex-shrink-0 border-b border-sand-dark/15">
        <div className="flex items-center justify-center py-2 sm:py-3 gap-2">
          {/* Subtle connectivity dot */}
          <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
            connectionStatus === 'ok' ? 'bg-green-400/60' :
            connectionStatus === 'error' ? 'bg-amber-400/60' :
            'bg-gray-300/40 animate-slow-pulse'
          }`} />
          <span className="text-xs text-gold-muted font-sans uppercase tracking-widest">
            {phaseLabel}
          </span>
        </div>
      </div>

      {/* Connection warning banner — only shown when health check fails */}
      {connectionStatus === 'error' && (
        <div className="flex-shrink-0 bg-amber-50/80 border-b border-amber-200/40 px-4 py-2">
          <p className="text-center text-xs text-amber-700/70 font-sans">
            Verbinding met AI is beperkt. Antwoorden kunnen trager zijn of lokaal gegenereerd worden.
          </p>
        </div>
      )}


      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="max-w-lg mx-auto space-y-3 sm:space-y-4">
          {/* Welcome prompt if no messages yet */}
          {messages.length === 0 && !isAiLoading && (
            <div className="flex flex-col items-center gap-4 sm:gap-6 py-8 sm:py-12 animate-gentle-fade">
              <div className="w-4 h-4 rounded-full bg-gold/20 animate-slow-pulse" />
              <div className="text-center space-y-2 sm:space-y-3 max-w-xs px-4">
                <p className="font-serif text-lg sm:text-xl text-anthracite leading-relaxed">
                  Wat brengt je hier?
                </p>
                <p className="text-sm text-anthracite-soft/60 font-sans leading-relaxed">
                  Vertel in je eigen woorden wat er speelt.
                </p>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg) => (
            <MessageBubble 
              key={msg.id} 
              message={msg}
              isLastAssistant={msg.id === lastAssistantMessage?.id}
              onQuickReply={handleQuickReply}
              onBodySelect={handleBodySelect}
              isAiLoading={isAiLoading}
            />
          ))}

          {/* Typing indicator */}
          {isAiLoading && (
            <div className="flex justify-start animate-gentle-fade">
              <div className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl rounded-bl-md bg-cream/80 border border-sand-dark/15">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gold/40 animate-slow-pulse" />
                  <div className="w-2 h-2 rounded-full bg-gold/40 animate-slow-pulse" style={{ animationDelay: '0.3s' }} />
                  <div className="w-2 h-2 rounded-full bg-gold/40 animate-slow-pulse" style={{ animationDelay: '0.6s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area — with safe area bottom padding for iPhones */}
      <div className="flex-shrink-0 border-t border-sand-dark/15 bg-warm-white/60 backdrop-blur-sm pb-safe">
        <div className="max-w-lg mx-auto px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-end gap-2 sm:gap-3">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Typ hier..."
                disabled={isAiLoading || crisisDetected}
                rows={1}
                className="w-full px-4 py-3 rounded-2xl bg-cream/80 border border-sand-dark/20 
                  focus:border-gold-light/50 focus:outline-none focus:ring-1 focus:ring-gold-light/30
                  resize-none text-anthracite font-sans text-base 
                  placeholder:text-anthracite-soft/30 transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  minHeight: '44px',
                  maxHeight: '120px',
                  overflow: inputText.split('\n').length > 3 ? 'auto' : 'hidden'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                }}
              />
            </div>
            
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isAiLoading || crisisDetected}
              className="flex-shrink-0 w-11 h-11 rounded-full bg-cream border border-gold-light/30 
                hover:border-gold/40 hover:bg-gold-light/20
                active:bg-gold-light/30
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200 flex items-center justify-center touch-target"
              aria-label="Verstuur"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" 
                className="text-anthracite-soft"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          {/* Hint — hidden on mobile (they use the send button) */}
          <p className="hidden sm:block text-center text-xs text-anthracite-soft/25 font-sans mt-2 keyboard-hide">
            Druk Enter om te versturen
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Message Bubble ───

interface MessageBubbleProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  onQuickReply: (reply: string) => void;
  onBodySelect: (area: BodyArea) => void;
  isAiLoading: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, isLastAssistant, onQuickReply, onBodySelect, isAiLoading 
}) => {
  const isUser = message.role === 'user';
  // ── Render-level safety: ONLY check for leaked technical error strings ──
  // We deliberately do NOT re-run cleanRawJsonFromMessage here. SessionContext
  // already cleans messages before saving them; running the cleaner a second
  // time at render risks mangling legitimate prose (regression observed Apr 14
  // where rich therapeutic content was being flattened or partially deleted).
  const displayContent = (message.role === 'assistant' && containsLeakedError(message.content))
    ? RENDER_FALLBACK_MESSAGE
    : message.content;


  // Determine if quick replies are present and active

  // Button Override Rule: when session.buttonOverrideActive is true, suppress all quick replies
  const buttonOverrideActive = useSession().session?.buttonOverrideActive ?? false;
  const hasActiveQuickReplies = !!(
    message.quickReplies && 
    message.quickReplies.length > 0 && 
    isLastAssistant && 
    !isAiLoading &&
    !buttonOverrideActive
  );

  // Body map should NOT show when:
  // 1. Quick replies are present (quick replies take priority — avoids large gap)
  // 2. Body area was already selected
  // 3. Not the last assistant message
  // 4. AI is still loading
  const showBodyMap = !!(
    message.showBodyMap && 
    isLastAssistant && 
    !isAiLoading && 
    !message.bodyAreaSelected &&
    !hasActiveQuickReplies  // <-- FIX: don't show body map when quick replies exist
  );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-gentle-fade`}>
      <div className="flex flex-col gap-2 sm:gap-3 max-w-[90%] sm:max-w-[85%]">
        {/* Bubble */}
        <div
          className={`
            px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl
            ${isUser 
              ? 'bg-gold-light/40 border border-gold/20 rounded-br-md text-anthracite' 
              : 'bg-cream/80 border border-sand-dark/15 rounded-bl-md text-anthracite'
            }
          `}
        >
          <div className="font-sans text-[15px] sm:text-base leading-relaxed whitespace-pre-wrap">
            {displayContent}

          </div>
        </div>

        {/* Body Map — only when no quick replies are present */}
        {showBodyMap && (
          <div className="animate-gentle-fade">
            <BodyMap onSelect={onBodySelect} selectedArea={null} />
          </div>
        )}

        {/* Body area selected */}
        {message.bodyAreaSelected && (
          <div className="text-xs text-anthracite-soft/50 font-sans px-2">
            {BODY_AREA_LABELS[message.bodyAreaSelected]} geselecteerd
          </div>
        )}

        {/* Quick replies — directly below message text, no gap */}
        {hasActiveQuickReplies && (
          <div className="flex flex-wrap gap-2 animate-gentle-fade">
            {message.quickReplies!.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => onQuickReply(reply)}
                className="px-4 py-2.5 rounded-2xl bg-cream/60 border border-sand-dark/20 
                  hover:border-gold-light/40 hover:bg-cream
                  active:bg-gold-light/20
                  text-sm text-anthracite-soft font-sans leading-snug
                  whitespace-normal text-left
                  transition-all duration-200
                  max-w-full touch-target"
              >
                {reply}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
