/**
 * Health check utility for the inner-kompas-chat edge function.
 * 
 * Verifies connectivity by sending a GET request to the health check endpoint.
 * Can be used to pre-flight check before sending chat messages, or to display
 * a connectivity status indicator in the UI.
 */

import { supabase } from '@/lib/supabase';

export interface HealthCheckResult {
  ok: boolean;
  status?: string;
  service?: string;
  version?: string;
  timestamp?: string;
  latencyMs: number;
  error?: string;
}

const HEALTH_CHECK_TIMEOUT = 8000; // 8 seconds
const SUPABASE_URL = 'https://bzmlljjjwrpxwiwnlwpb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bWxsampqd3JweHdpd25sd3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTc4OTUsImV4cCI6MjA5MzAzMzg5NX0.9qrx6RDbQOr1sVCzeuq6LuOd8MB-8m1ATX_jEWF2d9Y';

/**
 * Check if the inner-kompas-chat edge function is reachable and healthy.
 * Uses the GET health check endpoint added to the edge function.
 */
export async function checkChatHealth(): Promise<HealthCheckResult> {
  const start = performance.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/inner-kompas-chat`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);
    
    if (response.ok) {
      try {
        const data = await response.json();
        return {
          ok: true,
          status: data.status,
          service: data.service,
          version: data.version,
          timestamp: data.timestamp,
          latencyMs,
        };
      } catch {
        // Response was OK but not JSON — still consider it healthy
        return { ok: true, latencyMs };
      }
    } else {
      const errText = await response.text().catch(() => 'unknown');
      return {
        ok: false,
        latencyMs,
        error: `HTTP ${response.status}: ${errText.substring(0, 100)}`,
      };
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    const errMsg = err?.name === 'AbortError' 
      ? 'Health check timed out' 
      : (err?.message || String(err));
    
    return {
      ok: false,
      latencyMs,
      error: errMsg,
    };
  }
}

// Cache the last health check result to avoid spamming
let lastCheckResult: HealthCheckResult | null = null;
let lastCheckTime = 0;
const CACHE_DURATION_MS = 30000; // Cache for 30 seconds

/**
 * Cached version of checkChatHealth. Returns cached result if checked within last 30 seconds.
 */
export async function checkChatHealthCached(): Promise<HealthCheckResult> {
  const now = Date.now();
  if (lastCheckResult && (now - lastCheckTime) < CACHE_DURATION_MS) {
    return lastCheckResult;
  }
  
  const result = await checkChatHealth();
  lastCheckResult = result;
  lastCheckTime = now;
  return result;
}

/**
 * Invalidate the cached health check result (e.g., after a failed request).
 */
export function invalidateHealthCache(): void {
  lastCheckResult = null;
  lastCheckTime = 0;
}
