/**
 * Courses Page Logic (CLIENT-SIDE) - REDESIGNED
 * Professional UI with 3 courses per level, no emojis
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

// Professional SVG Icons (NO EMOJIS)
const MODULE_ICONS = {
  // Beginner (Green)
  1: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`, // Book
  2: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`, // Activity/Markets
  3: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`, // Dollar sign
  
  // Intermediate (Orange)
  4: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`, // TrendingUp
  5: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`, // Bar chart
  6: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`, // Grid/Chart types
  
  // Advanced (Red)
  7: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>`, // Layers/Portfolio
  8: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`, // Clock/Timing
  9: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"></path></svg>`, // Plus/Advanced
};

// Initialize page
async function init() {
  // Set username (if element exists)
  const headerUsername = document.querySelector('.user-section .username');
  if (headerUsername) {
    headerUsername.textContent = user.user_metadata?.username || user.email.split('@')[0];
  }
  
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
 * Render professional progress bar
 */
function renderProgressBar(progress) {
  const percent = calculateProgressPercent(progress.completedCount, progress.totalModules);
  
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('completedCount').textContent = progress.completedCount;
  document.getElementById('inProgressCount').textContent = progress.inProgress.length;
  document.getElementById('totalModules').textContent = progress.totalModules;
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
 * Create a professional module card element (matching screenshot)
 */
function createModuleCard(module, isCompleted, isInProgress, isUnlocked) {
  const card = document.createElement('div');
  card.className = isCompleted ? 'module-card completed' : isUnlocked ? 'module-card' : 'module-card locked';
  card.dataset.moduleId = module.id;
  card.dataset.unlocked = isUnlocked;
  
  // Determine status text
  let statusText = '';
  if (isCompleted) {
    statusText = 'Completed';
  } else if (isInProgress) {
    statusText = 'In Progress';
  } else if (isUnlocked) {
    statusText = 'Start Learning';
  } else {
    statusText = 'Locked';
  }
  
  const icon = MODULE_ICONS[module.id] || MODULE_ICONS[1];
  const categoryClass = module.category || 'beginner';
  
  card.innerHTML = `
    <div class="module-number-badge">${module.id}</div>
    <div class="module-icon ${categoryClass}">${icon}</div>
    <h3 class="module-title">${module.title}</h3>
    <p class="module-description">${module.description}</p>
    <div class="module-footer">
      <div class="start-learning-btn ${categoryClass}">${statusText} →</div>
      <div class="module-duration">~${module.estimated_time_minutes || 10} min</div>
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