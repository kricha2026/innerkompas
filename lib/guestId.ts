/**
 * ─── GUEST IDENTITY MANAGER ───
 * 
 * Generates and manages a stable guest identity per device.
 * This allows sessions to be saved and retrieved even without login.
 * 
 * The guest_id is:
 * - A valid UUID v4 stored in localStorage
 * - Stable across page reloads and browser sessions
 * - Used as user_id in ik_sessions when no account is logged in
 * - Linkable to a real account when the user later signs up/logs in
 */

const GUEST_ID_STORAGE_KEY = 'ik_guest_id';

/**
 * Get or create a stable guest UUID for this device.
 * Returns the same UUID on every call for the same browser/device.
 */
export function getGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing && isValidUUID(existing)) {
      return existing;
    }

    // Generate a new UUID v4
    const newId = crypto.randomUUID();
    localStorage.setItem(GUEST_ID_STORAGE_KEY, newId);
    return newId;
  } catch (e) {
    // If localStorage is unavailable (private browsing, etc.),
    // generate a session-scoped UUID that won't persist
    console.warn('[GUEST ID] localStorage unavailable, using session-scoped ID');
    return crypto.randomUUID();
  }
}

/**
 * Check if a user_id is a guest ID (not linked to an account).
 * Guest IDs are stored in localStorage and are not in ik_auth_users.
 */
export function isGuestId(userId: string): boolean {
  try {
    const guestId = localStorage.getItem(GUEST_ID_STORAGE_KEY);
    return userId === guestId;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid UUID format.
 */
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Clear the guest ID (e.g., after linking to an account).
 * This is optional — keeping it allows detecting previously-guest sessions.
 */
export function clearGuestId(): void {
  try {
    localStorage.removeItem(GUEST_ID_STORAGE_KEY);
  } catch {
    // ignore
  }
}
