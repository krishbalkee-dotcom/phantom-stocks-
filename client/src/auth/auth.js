/**
 * Authentication Service
 * Handles user signup, login, password reset
 */

import { supabase } from './supabaseClient.js';
import { redirectToIntendedPage } from './authGuard.js';

/**
 * Sign up new user
 * Creates auth user + user_profiles entry with $10,000 starting balance
 */
export async function signUp(email, password, username) {
  try {
    console.log('[Auth] Signing up user:', email);
    
    // Validate inputs
    if (!email || !password || !username) {
      throw new Error('All fields are required');
    }
    
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Please enter a valid email address');
    }
    
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
      throw new Error(error.message);
    }
    
    if (!data.user) {
      throw new Error('Failed to create user');
    }
    
    console.log('[Auth] User created successfully:', data.user.id);
    
    // Redirect to portfolio
    window.location.href = '/portfolio.html';
    
  } catch (error) {
    console.error('[Auth] Signup exception:', error);
    throw error;
  }
}

/**
 * Log in existing user
 */
export async function login(email, password) {
  try {
    console.log('[Auth] Logging in user:', email);
    
    // Validate inputs
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      console.error('[Auth] Login error:', error);
      // Make error messages more user-friendly
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Invalid email or password');
      }
      throw new Error(error.message);
    }
    
    if (!data.session) {
      throw new Error('Failed to create session');
    }
    
    console.log('[Auth] Login successful');
    
    // Redirect to portfolio or intended page
    redirectToIntendedPage();
    
  } catch (error) {
    console.error('[Auth] Login exception:', error);
    throw error;
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
      throw new Error(error.message);
    }
    
    console.log('[Auth] Logout successful');
    window.location.href = '/index.html';
    
  } catch (error) {
    console.error('[Auth] Logout exception:', error);
    throw error;
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
      throw new Error(error.message);
    }
    
    console.log('[Auth] Password reset email sent');
    return 'Password reset email sent! Check your inbox.';
    
  } catch (error) {
    console.error('[Auth] Password reset exception:', error);
    throw error;
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
      throw new Error(error.message);
    }
    
    console.log('[Auth] Password updated successfully');
    return 'Password updated successfully!';
    
  } catch (error) {
    console.error('[Auth] Password update exception:', error);
    throw error;
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