/**
 * Courses API Routes
 * Handles course modules, progress tracking, and completion
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * GET /api/courses/modules
 * Get all course modules (ordered sequentially)
 */
router.get('/modules', async (req, res) => {
  try {
    const { data: modules, error } = await supabase
      .from('course_modules')
      .select('id, title, description, icon_number, order_index, estimated_time_minutes, category')
      .order('order_index', { ascending: true });
    
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch modules' });
    }
    
    res.json(modules || []);
    
  } catch (error) {
    console.error('[Courses] Error in /modules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/courses/module/:id
 * Get full content of a specific module
 */
router.get('/module/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: module, error } = await supabase
      .from('course_modules')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    res.json(module);
    
  } catch (error) {
    console.error('[Courses] Error in /module/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/courses/progress
 * Get user's course progress
 * Query params: user_id
 */
router.get('/progress', async (req, res) => {
  try {
    // Debug logging
    console.log('[Courses] /progress called');
    console.log('[Courses] req.query:', req.query);
    console.log('[Courses] req.query.user_id:', req.query.user_id);
    console.log('[Courses] Full URL:', req.url);
    
    const { user_id } = req.query;
    
    if (!user_id) {
      console.error('[Courses] user_id is missing or undefined');
      return res.status(400).json({ error: 'user_id required' });
    }
    
    // Get completed modules
    const { data: completedModules, error: completedError } = await supabase
      .from('user_course_progress')
      .select('module_id, completed_at, time_spent_seconds')
      .eq('user_id', user_id)
      .not('completed_at', 'is', null);
    
    if (completedError) {
      return res.status(500).json({ error: 'Failed to fetch progress' });
    }
    
    // Get in-progress modules
    const { data: inProgressModules, error: inProgressError } = await supabase
      .from('user_course_progress')
      .select('module_id, started_at, time_spent_seconds')
      .eq('user_id', user_id)
      .is('completed_at', null);
    
    if (inProgressError) {
      return res.status(500).json({ error: 'Failed to fetch in-progress modules' });
    }
    
    // Get total number of modules
    const { count: totalModules } = await supabase
      .from('course_modules')
      .select('*', { count: 'exact', head: true });
    
    const completed = completedModules?.map(m => m.module_id) || [];
    const inProgress = inProgressModules?.map(m => m.module_id) || [];
    const completedCount = completed.length;
    const progressPercent = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;
    
    res.json({
      totalModules: totalModules || 9,
      completedCount: completedCount,
      progressPercent: progressPercent.toFixed(1),
      completed: completed,
      inProgress: inProgress
    });
    
  } catch (error) {
    console.error('[Courses] Error in /progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/courses/start
 * Mark a module as started
 * Body: { user_id, module_id }
 */
router.post('/start', async (req, res) => {
  try {
    const { user_id, module_id } = req.body;
    
    if (!user_id || !module_id) {
      return res.status(400).json({ error: 'user_id and module_id required' });
    }
    
    // Check if already exists
    const { data: existing } = await supabase
      .from('user_course_progress')
      .select('id')
      .eq('user_id', user_id)
      .eq('module_id', module_id)
      .single();
    
    if (existing) {
      return res.json({ message: 'Already started' });
    }
    
    // Create progress record
    const { error } = await supabase
      .from('user_course_progress')
      .insert({
        user_id: user_id,
        module_id: module_id
      });
    
    if (error) {
      return res.status(500).json({ error: 'Failed to start module' });
    }
    
    res.json({ success: true, message: 'Module started' });
    
  } catch (error) {
    console.error('[Courses] Error in /start:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/courses/ping
 * Update time spent on a module (called every 30 seconds)
 * Body: { user_id, module_id, timeSpent (seconds) }
 */
router.post('/ping', async (req, res) => {
  try {
    const { user_id, module_id, timeSpent } = req.body;
    
    if (!user_id || !module_id || timeSpent === undefined) {
      return res.status(400).json({ error: 'user_id, module_id, and timeSpent required' });
    }
    
    // Update or create page view record
    const { data: existing } = await supabase
      .from('course_page_views')
      .select('id, total_time_seconds')
      .eq('user_id', user_id)
      .eq('module_id', module_id)
      .order('session_start', { ascending: false })
      .limit(1)
      .single();
    
    if (existing) {
      // Update existing record
      await supabase
        .from('course_page_views')
        .update({
          last_ping: new Date().toISOString(),
          total_time_seconds: existing.total_time_seconds + 30 // Add 30 seconds
        })
        .eq('id', existing.id);
    } else {
      // Create new session
      await supabase
        .from('course_page_views')
        .insert({
          user_id: user_id,
          module_id: module_id,
          total_time_seconds: 30
        });
    }
    
    // Update progress record
    await supabase
      .from('user_course_progress')
      .upsert({
        user_id: user_id,
        module_id: module_id,
        time_spent_seconds: timeSpent
      }, {
        onConflict: 'user_id,module_id'
      });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[Courses] Error in /ping:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/courses/complete/:id
 * Mark a module as complete (validates 10-minute requirement)
 * Body: { user_id }
 */
router.post('/complete/:id', async (req, res) => {
  try {
    const { id: module_id } = req.params;
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }
    
    // Check time spent
    const { data: pageView } = await supabase
      .from('course_page_views')
      .select('total_time_seconds')
      .eq('user_id', user_id)
      .eq('module_id', module_id)
      .order('session_start', { ascending: false })
      .limit(1)
      .single();
    
    const timeSpent = pageView?.total_time_seconds || 0;
    
    if (timeSpent < 600) { // 10 minutes = 600 seconds
      return res.status(400).json({ 
        error: 'Insufficient time spent',
        required: 600,
        actual: timeSpent
      });
    }
    
    // Check if already completed
    const { data: existing } = await supabase
      .from('user_course_progress')
      .select('completed_at')
      .eq('user_id', user_id)
      .eq('module_id', module_id)
      .single();
    
    if (existing?.completed_at) {
      return res.json({ message: 'Already completed' });
    }
    
    // Mark as complete
    const { error } = await supabase
      .from('user_course_progress')
      .upsert({
        user_id: user_id,
        module_id: module_id,
        completed_at: new Date().toISOString(),
        time_spent_seconds: timeSpent
      }, {
        onConflict: 'user_id,module_id'
      });
    
    if (error) {
      return res.status(500).json({ error: 'Failed to complete module' });
    }
    
    console.log(`[Courses] User ${user_id} completed module ${module_id}`);
    
    res.json({ 
      success: true, 
      message: 'Module completed!',
      timeSpent: timeSpent
    });
    
  } catch (error) {
    console.error('[Courses] Error in /complete/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/courses/check-unlock/:id
 * Check if a module is unlocked (previous module completed)
 * Query params: user_id
 */
router.get('/check-unlock/:id', async (req, res) => {
  try {
    const { id: module_id } = req.params;
    
    // Debug logging
    console.log('[Courses] /check-unlock called');
    console.log('[Courses] module_id:', module_id);
    console.log('[Courses] req.query:', req.query);
    console.log('[Courses] req.query.user_id:', req.query.user_id);
    console.log('[Courses] Full URL:', req.url);
    
    const { user_id } = req.query;
    
    if (!user_id) {
      console.error('[Courses] user_id is missing or undefined');
      return res.status(400).json({ error: 'user_id required' });
    }
    
    // Module 1 is always unlocked
    if (parseInt(module_id) === 1) {
      return res.json({ unlocked: true });
    }
    
    // Get the module's order index
    const { data: module } = await supabase
      .from('course_modules')
      .select('order_index')
      .eq('id', module_id)
      .single();
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // Check if previous module is completed
    const { data: previousModule } = await supabase
      .from('course_modules')
      .select('id')
      .eq('order_index', module.order_index - 1)
      .single();
    
    if (!previousModule) {
      return res.json({ unlocked: true }); // No previous module
    }
    
    const { data: progress } = await supabase
      .from('user_course_progress')
      .select('completed_at')
      .eq('user_id', user_id)
      .eq('module_id', previousModule.id)
      .single();
    
    const unlocked = progress?.completed_at !== null;
    
    res.json({ unlocked: unlocked });
    
  } catch (error) {
    console.error('[Courses] Error in /check-unlock/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;