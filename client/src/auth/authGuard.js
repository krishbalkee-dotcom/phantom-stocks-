/**
 * Authentication Guard
 * Protects pages from unauthenticated access
 * Redirects to login if user is not authenticated
 */

import { getCurrentUser } from './auth.js';

/**
 * Check authentication and redirect if needed
 * Call this at the top of every protected page
 * @returns {Promise<Object>} User object if authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    console.log('[AuthGuard] User not authenticated, redirecting to login');
    
    // Store the intended destination
    const intendedPath = window.location.pathname + window.location.search;
    sessionStorage.setItem('intendedPath', intendedPath);
    
    // Redirect to login
    window.location.href = '/index.html';
    return null;
  }
  
  return user;
}

/**
 * Redirect to intended page after login
 * Call this after successful login
 */
export function redirectToIntendedPage() {
  const intendedPath = sessionStorage.getItem('intendedPath');
  sessionStorage.removeItem('intendedPath');
  
  if (intendedPath && intendedPath !== '/index.html') {
    window.location.href = intendedPath;
  } else {
    window.location.href = '/portfolio.html';
  }
}

/**
 * Check if user is on login page when already authenticated
 * If so, redirect to portfolio
 */
export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();
  
  if (user && window.location.pathname === '/index.html') {
    console.log('[AuthGuard] User already authenticated, redirecting to portfolio');
    window.location.href = '/portfolio.html';
    return true;
  }
  
  return false;
}