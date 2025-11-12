/**
 * Supabase Client Configuration
 * Handles all database connections and authentication
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment or config
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

/**
 * Get current user session
 */
export async function getCurrentUser() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[Supabase] Error getting session:', error);
      return null;
    }
    
    return session?.user || null;
  } catch (error) {
    console.error('[Supabase] Exception getting user:', error);
    return null;
  }
}

/**
 * Get user profile data
 */
export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('[Supabase] Error fetching profile:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('[Supabase] Exception fetching profile:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * Sign out current user
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Supabase] Error signing out:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Supabase] Exception signing out:', error);
    return false;
  }
}

/**
 * Listen for auth state changes
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] Auth state changed:', event);
    callback(event, session);
  });
}

export default supabase;