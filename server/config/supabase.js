// Supabase Client Configuration
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// Create Supabase client with service role key (for backend)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Test connection
supabase
    .from('user_profiles')
    .select('count')
    .limit(1)
    .then(() => {
        console.log('✅ Supabase connected successfully');
    })
    .catch((error) => {
        console.error('❌ Supabase connection failed:', error.message);
    });

export default supabase;