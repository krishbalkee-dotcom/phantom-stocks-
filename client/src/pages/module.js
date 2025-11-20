/**
 * Module Page Logic (CLIENT-SIDE)
 * Handles module content display, time tracking, and completion
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

if (!moduleId) {
  alert('Invalid module ID');
  window.location.href = 'courses.html';
}

// Timer interval
let timerInterval = null;

// Initialize page
async function init() {
  try {
    // Load module content
    const module = await getModule(moduleId);
    
    if (!module) {
      alert('Module not found');
      window.location.href = 'courses.html';
      return;
    }
    
    // Render module
    renderModule(module);
    
    // Mark as started (if not already)
    await startModule(user.id, moduleId);
    
    // Start time tracking
    startTimeTracking(user.id, moduleId);
    
    // Start timer display
    startTimerDisplay();
    
    // Setup complete button
    setupCompleteButton();
    
    // Setup back button with modal
    setupBackButton();
    
    // Hide loading, show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('moduleContent').style.display = 'block';
    
  } catch (error) {
    console.error('[Module] Error initializing:', error);
    alert('Failed to load module. Please try again.');
    window.location.href = 'courses.html';
  }
}

/**
 * Render module content
 */
function renderModule(module) {
  document.getElementById('moduleNumber').textContent = `MODULE ${module.id}`;
  document.getElementById('moduleTitle').textContent = module.title;
  document.getElementById('moduleDuration').textContent = `~${module.estimated_time_minutes || 5} min`;
  document.getElementById('articleContent').innerHTML = module.content || '<p>No content available.</p>';
}

/**
 * Start timer display (updates every second)
 */
function startTimerDisplay() {
  timerInterval = setInterval(() => {
    const session = getActiveSession();
    
    if (session) {
      document.getElementById('timerText').textContent = session.formattedTime;
      
      // Enable complete button after 5 minutes
      const completeBtn = document.getElementById('completeBtn');
      const requirementMsg = document.getElementById('requirementMessage');
      
      if (session.canComplete && completeBtn.disabled) {
        completeBtn.disabled = false;
        requirementMsg.textContent = 'You can now complete this module!';
        requirementMsg.style.color = '#10b981';
        requirementMsg.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        requirementMsg.style.background = 'rgba(16, 185, 129, 0.1)';
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
    const session = getActiveSession();
    
    if (!session || !session.canComplete) {
      alert('Please spend at least 5 minutes on this module before completing.');
      return;
    }
    
    completeBtn.disabled = true;
    completeBtn.textContent = 'Completing...';
    
    try {
      await completeModule(user.id, moduleId);
      
      // Show success message
      const successMsg = document.getElementById('successMessage');
      successMsg.classList.add('show');
      
      completeBtn.textContent = 'Completed!';
      completeBtn.classList.add('completed');
      
      // Stop timer
      stopTimeTracking();
      clearInterval(timerInterval);
      
      // Redirect after 2 seconds
      setTimeout(() => {
        window.location.href = 'courses.html';
      }, 2000);
      
    } catch (error) {
      console.error('[Module] Error completing module:', error);
      alert(error.message || 'Failed to complete module. Please try again.');
      completeBtn.disabled = false;
      completeBtn.textContent = 'Complete Module';
    }
  });
}

/**
 * Setup back button with custom modal
 */
function setupBackButton() {
  const backBtn = document.getElementById('backBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalCancel = document.getElementById('modalCancel');
  const modalOk = document.getElementById('modalOk');
  
  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    const session = getActiveSession();
    
    // If module is complete or can be completed, allow navigation
    if (!session || session.canComplete) {
      window.location.href = 'courses.html';
      return;
    }
    
    // Show custom modal instead of browser confirm
    modalOverlay.classList.add('show');
  });
  
  // Modal cancel button
  modalCancel.addEventListener('click', () => {
    modalOverlay.classList.remove('show');
  });
  
  // Modal OK button
  modalOk.addEventListener('click', () => {
    stopTimeTracking();
    window.location.href = 'courses.html';
  });
  
  // Click overlay to close
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('show');
    }
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopTimeTracking();
  clearInterval(timerInterval);
});

// Initialize
init();