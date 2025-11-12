/**
 * Courses Page Logic
 * Handles course module display and navigation
 */

import { requireAuth } from '../auth/authGuard.js';
import { logout } from '../auth/auth.js';
import {
  getCourseModules,
  getCourseProgress,
  isModuleUnlocked,
  calculateProgressPercent
} from '../services/courseService.js';

// Require authentication
const user = await requireAuth();

// Module icons
const MODULE_ICONS = {
  1: '📚',
  2: '📊',
  3: '🔍',
  4: '🛡️',
  5: '🎯',
  6: '🧠',
  7: '⚡',
  8: '📈',
  9: '🤖'
};

// Initialize page
async function init() {
  // Set username
  document.getElementById('username').textContent = user.user_metadata?.username || user.email;
  
  // Setup logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await logout();
  });
  
  // Load courses
  await loadCourses();
}

/**
 * Load and render courses
 */
async function loadCourses() {
  try {
    // Fetch modules and progress
    const [modules, progress] = await Promise.all([
      getCourseModules(),
      getCourseProgress(user.id)
    ]);
    
    // Render progress bar
    renderProgressBar(progress);
    
    // Render modules
    renderModules(modules, progress);
    
    // Show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('modulesGrid').style.display = 'grid';
    
  } catch (error) {
    console.error('[Courses] Error loading courses:', error);
    alert('Failed to load courses. Please refresh the page.');
  }
}

/**
 * Render progress bar
 */
function renderProgressBar(progress) {
  const percent = calculateProgressPercent(progress.completedCount, progress.totalModules);
  
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('progressStats').textContent = 
    `${progress.completedCount} of ${progress.totalModules} modules completed`;
}

/**
 * Render module cards
 */
async function renderModules(modules, progress) {
  const grid = document.getElementById('modulesGrid');
  let html = '';
  
  for (const module of modules) {
    const isCompleted = progress.completed.includes(module.id);
    const isInProgress = progress.inProgress.includes(module.id);
    const isUnlocked = await isModuleUnlocked(user.id, module.id);
    
    let statusClass = '';
    let statusText = '';
    
    if (isCompleted) {
      statusClass = 'status-completed';
      statusText = 'Completed';
    } else if (isInProgress) {
      statusClass = 'status-in-progress';
      statusText = 'In Progress';
    } else if (isUnlocked) {
      statusClass = '';
      statusText = 'Start';
    } else {
      statusClass = 'status-locked';
      statusText = '🔒 Locked';
    }
    
    const cardClass = isCompleted ? 'module-card completed' : isUnlocked ? 'module-card' : 'module-card locked';
    const icon = MODULE_ICONS[module.id] || '📖';
    
    html += `
      <div class="${cardClass}" data-module-id="${module.id}" data-unlocked="${isUnlocked}">
        <div class="module-header">
          <div class="module-icon">${icon}</div>
          <div class="module-number">MODULE ${module.id}</div>
        </div>
        <h3 class="module-title">${module.title}</h3>
        <p class="module-description">${module.description}</p>
        <div class="module-footer">
          <div class="module-status ${statusClass}">${statusText}</div>
          <div class="module-duration">~10 min read</div>
        </div>
      </div>
    `;
  }
  
  grid.innerHTML = html;
  
  // Add click handlers
  grid.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', () => {
      const moduleId = card.dataset.moduleId;
      const isUnlocked = card.dataset.unlocked === 'true';
      
      if (isUnlocked) {
        window.location.href = `module.html?id=${moduleId}`;
      }
    });
  });
}

// Initialize
init();