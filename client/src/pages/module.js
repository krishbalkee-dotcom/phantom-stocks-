/**
 * Module Page Logic
 * Handles individual course module display, time tracking, and completion
 */

import { requireAuth } from '../auth/authGuard.js';
import {
  getModule,
  startModule,
  startTimeTracking,
  stopTimeTracking,
  getActiveSession,
  completeModule
} from '../services/courseService.js';

// Require authentication
const user = await requireAuth();

// Get module ID from URL
const urlParams = new URLSearchParams(window.location.search);
const moduleId = parseInt(urlParams.get('id'));

if (!moduleId || isNaN(moduleId)) {
  window.location.href = 'courses.html';
}

let timerInterval = null;

// Initialize page
async function init() {
  try {
    // Load module data
    const module = await getModule(moduleId);
    
    // Render module
    renderModule(module);
    
    // Start tracking
    await startModule(user.id, moduleId);
    startTimeTracking(user.id, moduleId);
    
    // Start UI timer
    startUITimer();
    
    // Setup complete button
    setupCompleteButton();
    
    // Show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('moduleContent').style.display = 'block';
    
    // Prevent accidental navigation
    window.addEventListener('beforeunload', handleBeforeUnload);
    
  } catch (error) {
    console.error('[Module] Error loading module:', error);
    alert('Failed to load module. Redirecting...');
    window.location.href = 'courses.html';
  }
}

/**
 * Render module content
 */
function renderModule(module) {
  document.getElementById('moduleNumber').textContent = `MODULE ${module.id}`;
  document.getElementById('moduleTitle').textContent = module.title;
  document.getElementById('articleContent').innerHTML = module.content;
}

/**
 * Start UI timer display
 */
function startUITimer() {
  timerInterval = setInterval(() => {
    const session = getActiveSession();
    
    if (session) {
      document.getElementById('timerText').textContent = session.formattedTime;
      
      // Enable complete button after 10 minutes
      const completeBtn = document.getElementById('completeBtn');
      const requirementMsg = document.getElementById('requirementMessage');
      
      if (session.canComplete) {
        completeBtn.disabled = false;
        requirementMsg.style.display = 'none';
      } else {
        const remaining = 600 - session.totalSeconds;
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        requirementMsg.textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')} remaining to complete`;
      }
    }
  }, 1000);
}

/**
 * Setup complete button
 */
function setupCompleteButton() {
  const completeBtn = document.getElementById('completeBtn');
  
  completeBtn.addEventListener('click', async () => {
    try {
      completeBtn.disabled = true;
      completeBtn.textContent = 'Completing...';
      
      await completeModule(user.id, moduleId);
      
      // Show success message
      document.getElementById('successMessage').classList.add('show');
      completeBtn.classList.add('completed');
      completeBtn.textContent = '✓ Completed';
      
      // Redirect after 2 seconds
      setTimeout(() => {
        window.location.href = 'courses.html';
      }, 2000);
      
    } catch (error) {
      console.error('[Module] Error completing module:', error);
      alert(error.message || 'Failed to complete module. Please ensure you have spent at least 10 minutes on this page.');
      completeBtn.disabled = false;
      completeBtn.textContent = 'Complete Module';
    }
  });
}

/**
 * Handle before unload (warn user they're leaving mid-session)
 */
function handleBeforeUnload(e) {
  const session = getActiveSession();
  
  if (session && !session.canComplete) {
    e.preventDefault();
    e.returnValue = 'You haven\'t completed this module yet. Are you sure you want to leave?';
    return e.returnValue;
  }
}

/**
 * Handle back button
 */
document.getElementById('backBtn').addEventListener('click', (e) => {
  const session = getActiveSession();
  
  if (session && !session.canComplete) {
    const confirmed = confirm('You haven\'t completed this module yet. Your progress will be saved, but you\'ll need to spend the full 10 minutes to complete it. Continue?');
    
    if (!confirmed) {
      e.preventDefault();
      return;
    }
  }
  
  // Stop tracking
  stopTimeTracking();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

// Cleanup on page unload
window.addEventListener('unload', () => {
  stopTimeTracking();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

// Initialize
init();