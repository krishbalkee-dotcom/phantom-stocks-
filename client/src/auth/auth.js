/**
 * Authentication Service
 * Handles user signup and login (no email confirmation required)
 */

import { supabase } from './supabaseClient.js';
import { redirectToIntendedPage } from './authGuard.js';

/**
 * Sign up new user
 * Creates auth user + user_profiles entry with $10,000 starting balance
 */
export async function signUp(email, password, username, birthday) {
  try {
    console.log('[Auth] Signing up user:', email);
    
    // Validate inputs
    if (!email || !password || !username || !birthday) {
      throw new Error('All fields are required');
    }
    
    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Please enter a valid email address');
    }
    
    // Validate age (must be at least 10 years old)
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < 10) {
      throw new Error('You must be at least 10 years old to use Phantom Stocks');
    }
    
    // Create auth user (with email confirmation disabled)
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username,
          birthday: birthday
        },
        emailRedirectTo: undefined // No email confirmation
      }
    });
    
    if (error) {
      console.error('[Auth] Signup error:', error);
      
      // Handle specific error messages
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        throw new Error('This email is already registered');
      } else if (error.message.includes('Invalid email')) {
        throw new Error('Please enter a valid email address');
      } else if (error.message.includes('weak password')) {
        throw new Error('Password too weak - must be 8+ characters with uppercase, lowercase, and number');
      }
      
      throw new Error(error.message);
    }
    
    if (!data.user) {
      throw new Error('Failed to create user');
    }
    
    console.log('[Auth] User created successfully:', data.user.id);
    
    // Auto-login after signup (since no email confirmation needed)
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (sessionError) {
      console.error('[Auth] Auto-login error:', sessionError);
      // Still redirect to login if auto-login fails
      window.location.href = '/index.html';
      return;
    }
    
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
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Please confirm your email address');
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