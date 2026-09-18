import type { Db } from "../db.ts";
import type { Notification, NotificationType } from "../types.ts";

export interface NewNotification {
  patientId: string;
  notificationType: NotificationType;
  category: string;
  payload: Record<string, unknown>;
  scheduledAt: Date;
  dedupeKey: string;
}

const COLUMNS = `id, patient_id, notification_type, category, payload, status, scheduled_at, dedupe_key`;

function toNotification(r: any): Notification {
  return {
    id: r.id,
    patientId: r.patient_id,
    notificationType: r.notification_type,
    category: r.category,
    payload: r.payload,
    status: r.status,
    scheduledAt: r.scheduled_at,
    dedupeKey: r.dedupe_key,
  };
}

export async function findByDedupeKey(db: Db, dedupeKey: string): Promise<Notification | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM notifications WHERE dedupe_key = $1`, [
    dedupeKey,
  ]);
  return rows[0] ? toNotification(rows[0]) : null;
}

/**
 * Inserts a pending notification. Returns null if one with the same dedupe key already exists,
 * so two workers racing on the same key can't both write.
 */
export async function insertNotification(db: Db, n: NewNotification): Promise<Notification | null> {
  const { rows } = await db.query(
    `INSERT INTO notifications
            (patient_id, notification_type, category, payload, scheduled_at, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [n.patientId, n.notificationType, n.category, n.payload, n.scheduledAt, n.dedupeKey],
  );
  return rows[0] ? toNotification(rows[0]) : null;
}
