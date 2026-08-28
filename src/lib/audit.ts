import { supabase } from "@/lib/supabase";
import type { AuditLog } from "@/types";

export async function logAudit(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const entry: Partial<AuditLog> = {
      actor_id: user.id,
      actor_email: user.email ?? undefined,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details as unknown as Record<string, unknown>,
    };
    await supabase.from("audit_logs").insert(entry);
  } catch {
    // audit logging is best-effort; don't break the flow
  }
}
