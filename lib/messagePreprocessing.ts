import {
  ChatMessage,
  detectNoBodySensation,
  detectSomaticCluster, extractDescribedBodySignals,
} from '@/lib/types';

interface PreprocessMessageContextOptions {
  messages: ChatMessage[];
  updatedMessages: ChatMessage[];
  text: string;
  lastMessageProcessFrustration: boolean;
  noBodySensationCount: number;
}

export function preprocessMessageContext(options: PreprocessMessageContextOptions) {
  const {
    messages,
    updatedMessages,
    text,
    lastMessageProcessFrustration,
    noBodySensationCount,
  } = options;

  // ── No-body-sensation tracking ──
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const lastMsgWasBodyAwareness = lastAssistantMsg?.showBodyMap === true || 
    (lastAssistantMsg?.content && /lichaam|lijf|voel je|merk je|waar zit|waar voel/i.test(lastAssistantMsg.content));
  const userSaysNoBodySensation = detectNoBodySensation(text);
  const lastMessageNoBodySensation = !lastMessageProcessFrustration && lastMsgWasBodyAwareness && userSaysNoBodySensation;
  
  let currentNoBodyCount = noBodySensationCount;
  if (lastMessageNoBodySensation) {
    currentNoBodyCount = noBodySensationCount + 1;
  }

  // ── SOMATIC CLUSTER DETECTION ──
  // Detects when multiple body signals have been described across the conversation.
  // When a cluster is detected, the AI should shift from somatic inquiry to meaning-giving.
  // Based on the methodological principle: body signals are carriers of emotional/nervous system info.
  const somaticCluster = detectSomaticCluster(updatedMessages);
  const alreadyDescribedBodySignals = extractDescribedBodySignals(updatedMessages);

  // Log somatic cluster detection for debugging
  if (somaticCluster.isCluster) {
    console.log(
      `%c[SOMATIC CLUSTER] ${somaticCluster.signalCount} signalen gedetecteerd:%c ${somaticCluster.signals.join(', ')}`,
      'color: #d69e2e; font-weight: bold;',
      'color: #718096;'
    );
  }

  return {
    lastAssistantMsg,
    lastMsgWasBodyAwareness,
    userSaysNoBodySensation,
    lastMessageNoBodySensation,
    currentNoBodyCount,
    somaticCluster,
    alreadyDescribedBodySignals,
  };
}
