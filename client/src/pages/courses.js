/**
 * Courses Page Logic (CLIENT-SIDE)
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
  3: '📈',
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
    
    // Render modules by category
    await renderModules(modules, progress);
    
    // Hide loading, show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('modulesContent').style.display = 'block';
    
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
 * Render module cards in their respective sections
 */
async function renderModules(modules, progress) {
  const beginnerContainer = document.getElementById('beginnerModules');
  const intermediateContainer = document.getElementById('intermediateModules');
  const advancedContainer = document.getElementById('advancedModules');
  
  // Clear containers
  beginnerContainer.innerHTML = '';
  intermediateContainer.innerHTML = '';
  advancedContainer.innerHTML = '';
  
  // Process each module
  for (const module of modules) {
    const isCompleted = progress.completed.includes(module.id);
    const isInProgress = progress.inProgress.includes(module.id);
    const isUnlocked = await isModuleUnlocked(user.id, module.id);
    
    const card = createModuleCard(module, isCompleted, isInProgress, isUnlocked);
    
    // Add to appropriate container
    if (module.category === 'beginner') {
      beginnerContainer.appendChild(card);
    } else if (module.category === 'intermediate') {
      intermediateContainer.appendChild(card);
    } else if (module.category === 'advanced') {
      advancedContainer.appendChild(card);
    }
  }
}

/**
 * Create a module card element
 */
function createModuleCard(module, isCompleted, isInProgress, isUnlocked) {
  const card = document.createElement('div');
  card.className = isCompleted ? 'module-card completed' : isUnlocked ? 'module-card' : 'module-card locked';
  card.dataset.moduleId = module.id;
  card.dataset.unlocked = isUnlocked;
  
  // Determine status
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
  
  const icon = MODULE_ICONS[module.id] || '📖';
  const categoryClass = module.category || 'beginner';
  
  card.innerHTML = `
    <div class="module-number-badge">${module.id}</div>
    <div class="module-header">
      <div class="module-icon ${categoryClass}">${icon}</div>
      <div class="module-content">
        <h3 class="module-title">${module.title}</h3>
      </div>
    </div>
    <p class="module-description">${module.description}</p>
    <div class="module-footer">
      <div class="module-status ${statusClass}">${statusText}</div>
      <div class="module-duration">~${module.estimated_time_minutes || 10} min read</div>
    </div>
  `;
  
  // Add click handler
  if (isUnlocked) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      window.location.href = `module.html?id=${module.id}`;
    });
  }
  
  return card;
}

// Initialize
init();