import { MutableRefObject } from 'react';
import { supabase } from '@/lib/supabase';

// ─── DB: Save a single message to ik_session_messages ───
// NOTE: quick_replies must be JSON.stringify'd before insert because the column
// is JSONB. PostgREST incorrectly converts JS arrays to PostgreSQL array literals
// (e.g., {a,b,c}) instead of JSON arrays (["a","b","c"]), causing
// "invalid input syntax for type json" errors.
export async function saveMessageToDb(
  sessionId: string | null,
  role: 'user' | 'assistant',
  content: string,
  quickReplies?: string[],
  showBodyMap?: boolean,
  bodyAreaSelected?: string,
  messageOrderRef?: MutableRefObject<number>,
) {
  if (!sessionId) return;
  const order = messageOrderRef ? messageOrderRef.current : 0;
  if (messageOrderRef) messageOrderRef.current += 1;
  try {
    await supabase.from('ik_session_messages').insert({
      session_id: sessionId,
      role,
      content,
      quick_replies: quickReplies && quickReplies.length > 0 ? JSON.stringify(quickReplies) : null,
      show_body_map: !!showBodyMap,
      body_area_selected: bodyAreaSelected || null,
      message_order: order,
    });
  } catch (e) {

    console.error('DB insert message error', e);
  }
}


// ─── DB: Save a compass state detection to ik_compass_state_history ───
export async function saveCompassStateToDb(
  sessionId: string | null,
  primaryState: string,
  secondaryState: string | null,
  confidence: number,
  source: 'client' | 'ai',
  detectedAt?: Date,
) {
  if (!sessionId) return;
  try {
    await supabase.from('ik_compass_state_history').insert({
      session_id: sessionId,
      primary_state: primaryState,
      secondary_state: secondaryState || null,
      confidence,
      detected_at: (detectedAt || new Date()).toISOString(),
      source,
    });
  } catch (e) {
    console.error('DB insert compass state error', e);
  }
}
