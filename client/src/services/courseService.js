/**
 * Course Service
 * Client-side service for educational course management
 */

const API_BASE = 'https://phantom-stocks.onrender.com/api';

// Track active page view session
let activeSession = null;
let pingInterval = null;

/**
 * Get all course modules
 * @returns {Promise<Array>} Array of course modules
 */
export async function getCourseModules() {
  try {
    const response = await fetch(`${API_BASE}/courses/modules`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch course modules');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[CourseService] getCourseModules error:', error);
    return [];
  }
}

/**
 * Get a single module by ID with full content
 * @param {number} moduleId - Module ID
 * @returns {Promise<Object>} Module with full article content
 */
export async function getModule(moduleId) {
  try {
    const response = await fetch(`${API_BASE}/courses/module/${moduleId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch module');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[CourseService] getModule error:', error);
    throw error;
  }
}

/**
 * Get user's course progress
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Progress data
 */
export async function getCourseProgress(userId) {
  try {
    const response = await fetch(`${API_BASE}/courses/progress?user_id=${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch course progress');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[CourseService] getCourseProgress error:', error);
    return {
      totalModules: 9,
      completedCount: 0,
      progressPercent: 0,
      completed: [],
      inProgress: []
    };
  }
}

/**
 * Start a course module (marks as "in progress")
 * @param {string} userId - User ID
 * @param {number} moduleId - Module ID
 */
export async function startModule(userId, moduleId) {
  try {
    const response = await fetch(`${API_BASE}/courses/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId, module_id: moduleId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to start module');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[CourseService] startModule exception:', error);
    throw error;
  }
}

/**
 * Start tracking time spent on a module page
 * Pings server every 30 seconds
 * @param {string} userId - User ID
 * @param {number} moduleId - Module ID
 * @returns {string} Session ID
 */
export function startTimeTracking(userId, moduleId) {
  // Clear any existing session
  stopTimeTracking();
  
  // Generate session ID
  const sessionId = `${userId}-${moduleId}-${Date.now()}`;
  
  activeSession = {
    sessionId,
    userId,
    moduleId,
    startTime: Date.now(),
    totalSeconds: 0
  };
  
  console.log(`[CourseService] Started time tracking for module ${moduleId}`);
  
  // Ping every 30 seconds
  pingInterval = setInterval(async () => {
    if (!activeSession) return;
    
    const elapsedSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
    activeSession.totalSeconds = elapsedSeconds;
    
    try {
      await fetch(`${API_BASE}/courses/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: activeSession.userId,
          module_id: activeSession.moduleId,
          timeSpent: elapsedSeconds
        })
      });
      
      console.log(`[CourseService] Ping: ${elapsedSeconds}s on module ${moduleId}`);
      
    } catch (error) {
      console.error('[CourseService] Ping error:', error);
    }
  }, 30000); // 30 seconds
  
  return sessionId;
}

/**
 * Stop tracking time
 */
export function stopTimeTracking() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  
  if (activeSession) {
    console.log(`[CourseService] Stopped time tracking: ${activeSession.totalSeconds}s total`);
    activeSession = null;
  }
}

/**
 * Get current session info
 */
export function getActiveSession() {
  if (!activeSession) return null;
  
  const elapsedSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
  
  return {
    ...activeSession,
    totalSeconds: elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    canComplete: elapsedSeconds >= 300 // 5 minutes = 300 seconds
  };
}

/**
 * Complete a course module
 * @param {string} userId - User ID
 * @param {number} moduleId - Module ID
 * @returns {Promise<Object>} Completion result
 */
export async function completeModule(userId, moduleId) {
  try {
    const response = await fetch(`${API_BASE}/courses/complete/${moduleId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to complete module');
    }
    
    // Stop time tracking
    stopTimeTracking();
    
    console.log(`[CourseService] Module ${moduleId} completed!`);
    
    return data;
    
  } catch (error) {
    console.error('[CourseService] completeModule error:', error);
    throw error;
  }
}

/**
 * Check if a module is unlocked
 * @param {string} userId - User ID
 * @param {number} moduleId - Module ID
 * @returns {Promise<boolean>} True if unlocked
 */
export async function isModuleUnlocked(userId, moduleId) {
  try {
    const response = await fetch(`${API_BASE}/courses/check-unlock/${moduleId}?user_id=${userId}`);
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.unlocked === true;
    
  } catch (error) {
    console.error('[CourseService] isModuleUnlocked error:', error);
    return false;
  }
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgressPercent(completedCount, totalModules) {
  if (totalModules === 0) return 0;
  return Math.round((completedCount / totalModules) * 100);
}