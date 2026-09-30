import { SupabaseClient } from '@supabase/supabase-js';

export interface AuditLogEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id?: string;
  actor_role?: string;
  ip_address?: string;
  user_agent?: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      actor_id: entry.actor_id || null,
      actor_role: entry.actor_role || null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
      previous_state: entry.previous_state || null,
      new_state: entry.new_state || null,
      metadata: entry.metadata || {},
    });

    if (error) {
      console.error('Failed to write audit log:', error);
    }
  } catch (err) {
    console.error('Exception writing audit log:', err);
  }
}
