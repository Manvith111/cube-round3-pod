import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export interface IdempotencyRecord {
  key: string;
  endpoint: string;
  request_hash: string;
  response_status: number;
  response_body: Record<string, unknown>;
  user_id?: string;
  created_at?: string;
  expires_at: string;
}

export function computeRequestHash(payload: unknown): string {
  const normalized = JSON.stringify(payload, Object.keys(payload || {}).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

export async function checkIdempotency(
  supabase: SupabaseClient,
  key: string,
  endpoint: string,
  requestHash: string
): Promise<IdempotencyRecord | null> {
  const { data, error } = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('key', key)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    // Delete expired record
    await supabase.from('idempotency_keys').delete().eq('key', key);
    return null;
  }

  // If request hash matches, return stored response
  if (data.request_hash === requestHash && data.endpoint === endpoint) {
    return data as IdempotencyRecord;
  }

  // If key reused with different payload, throw conflict
  throw new Error(`Idempotency key "${key}" was previously used with a different request payload.`);
}

export async function saveIdempotencyRecord(
  supabase: SupabaseClient,
  params: {
    key: string;
    endpoint: string;
    requestHash: string;
    responseStatus: number;
    responseBody: Record<string, unknown>;
    userId?: string;
    ttlMinutes?: number;
  }
): Promise<void> {
  const ttl = params.ttlMinutes || 1440; // Default 24 hours
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  await supabase.from('idempotency_keys').upsert({
    key: params.key,
    endpoint: params.endpoint,
    request_hash: params.requestHash,
    response_status: params.responseStatus,
    response_body: params.responseBody,
    user_id: params.userId || null,
    expires_at: expiresAt,
  });
}
