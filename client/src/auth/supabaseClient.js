/**
 * Supabase Client Configuration
 * Handles all database connections and authentication
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase credentials (hardcoded for browser use - these are safe to expose)
const SUPABASE_URL = 'https://wjvcnajhbxsqiznplsjl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmNuYWpoYnhzcWl6bnBsc2psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MDMzMDYsImV4cCI6MjA3ODQ3OTMwNn0.VPvbWdXQtx4UQfn8p9DOnfSkyKX5QM7ytm1ZacWD1DE';

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