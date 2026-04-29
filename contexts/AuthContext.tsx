import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { getGuestId } from '@/lib/guestId';

// ─── Types ───
export interface AuthUser {
  id: string;
  email: string;
}

export interface UserProfile {
  user_id: string;
  email: string;
  display_name: string;
  role: 'user' | 'coach' | 'admin';
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isCoach: boolean;
  isAuthenticated: boolean;
  isTesterMode: boolean;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string, role: string) => Promise<{ error?: string }>;
  signOut: () => void;
  updateDisplayName: (newName: string) => Promise<{ error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
}



const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Client-side password hashing (SHA-256 + salt) ───
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(useSalt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt: useSalt };
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const { hash: computedHash } = await hashPassword(password, salt);
  return computedHash === hash;
}

// ─── Storage keys ───
const STORAGE_KEY = 'ik_auth_session';

/**
 * ─── ACCOUNT LINKING ───
 * When a guest user logs in or signs up, link their previous guest sessions
 * to the new account. This ensures session continuity across the transition
 * from anonymous to authenticated usage.
 */
async function linkGuestSessionsToAccount(newUserId: string): Promise<void> {
  try {
    const guestId = getGuestId();
    if (!guestId || guestId === newUserId) return;

    // Check if there are any sessions under the guest ID
    const { data: guestSessions } = await supabase
      .from('ik_sessions')
      .select('id')
      .eq('user_id', guestId);

    if (!guestSessions || guestSessions.length === 0) return;

    console.log(
      `%c[ACCOUNT LINKING] Koppeling van ${guestSessions.length} gastsessie(s) aan account ${newUserId.substring(0, 8)}…`,
      'color: #805ad5; font-weight: bold;'
    );

    // Update all guest sessions to the new user_id, preserving the guest_id for tracking
    await supabase
      .from('ik_sessions')
      .update({ user_id: newUserId, guest_id: guestId })
      .eq('user_id', guestId);

    // Also link personal profile if it exists
    await supabase
      .from('ik_personal_profiles')
      .update({ user_id: newUserId, guest_id: guestId })
      .eq('user_id', guestId);

    // Link client status if it exists
    await supabase
      .from('ik_client_status')
      .update({ user_id: newUserId, guest_id: guestId })
      .eq('user_id', guestId);

    console.log(
      `%c[ACCOUNT LINKING] ${guestSessions.length} sessie(s) succesvol gekoppeld`,
      'color: #38a169; font-weight: bold;'
    );
  } catch (e) {
    console.error('[ACCOUNT LINKING] Fout bij koppelen gastsessies:', e);
    // Non-critical — don't block the login/signup flow
  }
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // ─── Tester mode: reads from global flag set in main.tsx + own detection ───
  const detectTesterMode = (): boolean => {
    try {
      // 1. Global flag (set in main.tsx BEFORE React renders — most reliable)
      try {
        if ((window as any).__IK_TESTER_MODE__ === true) return true;
      } catch (e) {}

      // 2. CSS class on <html> (also set in main.tsx)
      try {
        if (document.documentElement.classList.contains('tester-mode')) return true;
      } catch (e) {}

      // 3. sessionStorage (persists across navigations within same tab)
      try {
        if (sessionStorage.getItem('ik_tester_mode') === 'true') return true;
      } catch (e) {}

      // 4. URLSearchParams
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'tester') return true;
      } catch (e) {}

      // 5. Raw href
      try {
        if (window.location.href.includes('mode=tester')) return true;
      } catch (e) {}

      // 6. Hash
      try {
        if (window.location.hash.includes('mode=tester')) return true;
      } catch (e) {}

      return false;
    } catch (e) {
      return false;
    }
  };

  const [isTesterMode, setIsTesterMode] = useState<boolean>(() => {
    const detected = detectTesterMode();
    if (detected) {
      try { sessionStorage.setItem('ik_tester_mode', 'true'); } catch (e) {}
      try { document.documentElement.classList.add('tester-mode'); } catch (e) {}
      try { (window as any).__IK_TESTER_MODE__ = true; } catch (e) {}
    }
    return detected;
  });

  // Backup effect: re-check after mount
  useEffect(() => {
    const detected = detectTesterMode();
    if (detected && !isTesterMode) {
      try { sessionStorage.setItem('ik_tester_mode', 'true'); } catch (e) {}
      try { document.documentElement.classList.add('tester-mode'); } catch (e) {}
      try { (window as any).__IK_TESTER_MODE__ = true; } catch (e) {}
      setIsTesterMode(true);
    }
    if (!detected) {
      try { sessionStorage.removeItem('ik_tester_mode'); } catch (e) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps




  // ─── Restore session from localStorage on mount ───
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.user && parsed.profile) {
          setUser(parsed.user);
          setProfile(parsed.profile);
        }
      }
    } catch (e) {
      console.error('Failed to restore auth session:', e);
    }
    setIsLoading(false);
  }, []);

  const persistSession = useCallback((u: AuthUser | null, p: UserProfile | null) => {
    if (u && p) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: u, profile: p }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string, _role?: string): Promise<{ error?: string }> => {
    try {
      const trimmedEmail = email.toLowerCase().trim();
      if (!trimmedEmail || !password) return { error: 'E-mail en wachtwoord zijn verplicht.' };
      if (password.length < 6) return { error: 'Wachtwoord moet minimaal 6 tekens zijn.' };

      // Check existing
      const { data: existing } = await supabase
        .from('ik_auth_users')
        .select('id')
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (existing) return { error: 'Dit e-mailadres is al in gebruik.' };

      // Hash password
      const { hash, salt } = await hashPassword(password);
      const passwordHash = `${salt}:${hash}`;

      // Create user
      const { data: newUser, error: userError } = await supabase
        .from('ik_auth_users')
        .insert({ email: trimmedEmail, password_hash: passwordHash })
        .select('id, email, created_at')
        .single();

      if (userError || !newUser) {
        console.error('Signup error:', userError);
        return { error: 'Kon account niet aanmaken.' };
      }

      // SECURITY: All new signups are always role='user'.
      // Coach/admin roles can only be assigned via direct database update by an administrator.
      const userRole = 'user';

      const { data: newProfile } = await supabase
        .from('ik_user_profiles')
        .insert({
          user_id: newUser.id,
          email: trimmedEmail,
          display_name: displayName || trimmedEmail.split('@')[0],
          role: userRole,
        })
        .select('*')
        .single();

      const authUser: AuthUser = { id: newUser.id, email: newUser.email };
      const authProfile: UserProfile = newProfile || {
        user_id: newUser.id,
        email: trimmedEmail,
        display_name: displayName || trimmedEmail.split('@')[0],
        role: userRole as 'user' | 'coach',
      };

      setUser(authUser);
      setProfile(authProfile);
      persistSession(authUser, authProfile);
      setShowAuthModal(false);

      // ─── Link guest sessions to the new account ───
      linkGuestSessionsToAccount(newUser.id);

      return {};

    } catch (e) {
      console.error('Signup error:', e);
      return { error: 'Er is een fout opgetreden.' };
    }
  }, [persistSession]);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const trimmedEmail = email.toLowerCase().trim();
      if (!trimmedEmail || !password) return { error: 'E-mail en wachtwoord zijn verplicht.' };

      const { data: foundUser, error: findError } = await supabase
        .from('ik_auth_users')
        .select('id, email, password_hash, created_at')
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (findError || !foundUser) return { error: 'Ongeldig e-mailadres of wachtwoord.' };

      const isValid = await verifyPassword(password, foundUser.password_hash);
      if (!isValid) return { error: 'Ongeldig e-mailadres of wachtwoord.' };

      // Update last sign in
      await supabase.from('ik_auth_users').update({ last_sign_in: new Date().toISOString() }).eq('id', foundUser.id);

      // Get profile
      const { data: foundProfile } = await supabase
        .from('ik_user_profiles')
        .select('*')
        .eq('user_id', foundUser.id)
        .maybeSingle();

      const authUser: AuthUser = { id: foundUser.id, email: foundUser.email };
      const authProfile: UserProfile = foundProfile || {
        user_id: foundUser.id,
        email: trimmedEmail,
        display_name: trimmedEmail.split('@')[0],
        role: 'user' as const,
      };

      setUser(authUser);
      setProfile(authProfile);
      persistSession(authUser, authProfile);
      setShowAuthModal(false);

      // ─── Link guest sessions to the existing account ───
      linkGuestSessionsToAccount(foundUser.id);

      return {};

    } catch (e) {
      console.error('Signin error:', e);
      return { error: 'Er is een fout opgetreden.' };
    }
  }, [persistSession]);

  const signOut = useCallback(() => {
    setUser(null);
    setProfile(null);
    persistSession(null, null);
  }, [persistSession]);

  // ─── Update display name ───
  const updateDisplayName = useCallback(async (newName: string): Promise<{ error?: string }> => {
    if (!user || !profile) return { error: 'Je bent niet ingelogd.' };
    const trimmed = newName.trim();
    if (!trimmed) return { error: 'Naam mag niet leeg zijn.' };
    if (trimmed.length > 100) return { error: 'Naam is te lang (max 100 tekens).' };

    try {
      const { error: updateError } = await supabase
        .from('ik_user_profiles')
        .update({ display_name: trimmed })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Update display name error:', updateError);
        return { error: 'Kon naam niet bijwerken.' };
      }

      const updatedProfile = { ...profile, display_name: trimmed };
      setProfile(updatedProfile);
      persistSession(user, updatedProfile);
      return {};
    } catch (e) {
      console.error('Update display name error:', e);
      return { error: 'Er is een fout opgetreden.' };
    }
  }, [user, profile, persistSession]);

  // ─── Change password ───
  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<{ error?: string }> => {
    if (!user) return { error: 'Je bent niet ingelogd.' };
    if (!currentPassword || !newPassword) return { error: 'Beide wachtwoorden zijn verplicht.' };
    if (newPassword.length < 6) return { error: 'Nieuw wachtwoord moet minimaal 6 tekens zijn.' };

    try {
      // Fetch current password hash
      const { data: foundUser, error: findError } = await supabase
        .from('ik_auth_users')
        .select('password_hash')
        .eq('id', user.id)
        .single();

      if (findError || !foundUser) return { error: 'Kon account niet vinden.' };

      // Verify current password
      const isValid = await verifyPassword(currentPassword, foundUser.password_hash);
      if (!isValid) return { error: 'Huidig wachtwoord is onjuist.' };

      // Hash new password
      const { hash, salt } = await hashPassword(newPassword);
      const newPasswordHash = `${salt}:${hash}`;

      // Update in database
      const { error: updateError } = await supabase
        .from('ik_auth_users')
        .update({ password_hash: newPasswordHash })
        .eq('id', user.id);

      if (updateError) {
        console.error('Change password error:', updateError);
        return { error: 'Kon wachtwoord niet wijzigen.' };
      }

      return {};
    } catch (e) {
      console.error('Change password error:', e);
      return { error: 'Er is een fout opgetreden.' };
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isLoading,
      isCoach: profile?.role === 'coach' || profile?.role === 'admin',
      isAuthenticated: !!user,
      isTesterMode,
      showAuthModal,
      setShowAuthModal,
      signIn,
      signUp,
      signOut,
      updateDisplayName,
      changePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
