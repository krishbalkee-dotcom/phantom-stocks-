/**
 * Authentication Service
 * Handles user signup, login, password reset
 */

import { supabase } from '../services/supabaseClient.js';

/**
 * Sign up new user
 * Creates auth user + user_profiles entry with $10,000 starting balance
 */
export async function signUp(email, password, username) {
  try {
    console.log('[Auth] Signing up user:', email);
    
    // Create auth user
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username
        }
      }
    });
    
    if (error) {
      console.error('[Auth] Signup error:', error);
      return { success: false, error: error.message };
    }
    
    if (!data.user) {
      return { success: false, error: 'Failed to create user' };
    }
    
    console.log('[Auth] User created successfully:', data.user.id);
    
    // User profile is auto-created by database trigger with $10,000
    
    return {
      success: true,
      user: data.user,
      message: 'Account created! You can now log in.'
    };
    
  } catch (error) {
    console.error('[Auth] Signup exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log in existing user
 */
export async function login(email, password) {
  try {
    console.log('[Auth] Logging in user:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      console.error('[Auth] Login error:', error);
      return { success: false, error: error.message };
    }
    
    if (!data.session) {
      return { success: false, error: 'Failed to create session' };
    }
    
    console.log('[Auth] Login successful');
    
    return {
      success: true,
      user: data.user,
      session: data.session
    };
    
  } catch (error) {
    console.error('[Auth] Login exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log out current user
 */
export async function logout() {
  try {
    console.log('[Auth] Logging out user');
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('[Auth] Logout error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('[Auth] Logout successful');
    
    return { success: true };
    
  } catch (error) {
    console.error('[Auth] Logout exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(email) {
  try {
    console.log('[Auth] Requesting password reset for:', email);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    
    if (error) {
      console.error('[Auth] Password reset error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('[Auth] Password reset email sent');
    
    return {
      success: true,
      message: 'Password reset email sent! Check your inbox.'
    };
    
  } catch (error) {
    console.error('[Auth] Password reset exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update password (after reset)
 */
export async function updatePassword(newPassword) {
  try {
    console.log('[Auth] Updating password');
    
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    
    if (error) {
      console.error('[Auth] Password update error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('[Auth] Password updated successfully');
    
    return {
      success: true,
      message: 'Password updated successfully!'
    };
    
  } catch (error) {
    console.error('[Auth] Password update exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[Auth] Error getting session:', error);
      return null;
    }
    
    return session?.user || null;
  } catch (error) {
    console.error('[Auth] Exception getting user:', error);
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