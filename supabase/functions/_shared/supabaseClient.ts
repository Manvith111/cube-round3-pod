import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseUserClient(authHeader?: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  const options: Record<string, unknown> = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };

  if (authHeader) {
    options.global = {
      headers: {
        Authorization: authHeader,
      },
    };
  }

  return createClient(supabaseUrl, anonKey, options);
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}
