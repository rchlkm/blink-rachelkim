import type { Db } from "./db.ts";
import { dedupeKey } from "./dedupe.ts";
import { claimNext, markFailed, markSucceeded } from "./repos/jobs.ts";
import { findByDedupeKey, insertNotification } from "./repos/notifications.ts";
import { getPreference } from "./repos/preferences.ts";
import { NOTIFICATION_TYPES, type NotificationJobPayload } from "./types.ts";

export type Outcome =
  | { outcome: "created"; notificationId: string }
  | { outcome: "skipped_opt_out" }
  | { outcome: "skipped_duplicate" };

function parseJob(raw: unknown): NotificationJobPayload {
  const j = raw as Partial<NotificationJobPayload> | null;
  if (!j || typeof j !== "object")
    throw new Error("job payload is not an object");
  if (!NOTIFICATION_TYPES.includes(j.type as never))
    throw new Error(`unknown type: ${j.type}`);
  if (typeof j.patient_id !== "string")
    throw new Error("patient_id is required");
  if (!j.payload || typeof j.payload !== "object" || Array.isArray(j.payload)) {
    throw new Error("payload must be an object");
  }
  if (
    j.scheduled_at !== undefined &&
    Number.isNaN(Date.parse(j.scheduled_at))
  ) {
    throw new Error("scheduled_at is not a valid timestamp");
  }
  return j as NotificationJobPayload;
}

export async function processNotification(
  db: Db,
  raw: unknown,
): Promise<Outcome> {
  const job = parseJob(raw);

  // No preference row means the patient never opted out; deliver with defaults.
  const pref = await getPreference(db, job.patient_id);
  if (pref?.optOut) return { outcome: "skipped_opt_out" };

  const key = dedupeKey(job.patient_id, job.type, job.payload);
  if (await findByDedupeKey(db, key)) return { outcome: "skipped_duplicate" };

  const created = await insertNotification(db, {
    patientId: job.patient_id,
    notificationType: job.type,
    category: job.category ?? "transactional",
    payload: job.payload,
    scheduledAt: job.scheduled_at ? new Date(job.scheduled_at) : new Date(),
    dedupeKey: key,
    // status = pending
  });
  // The pre-check above is a fast path; the unique index is what settles a race.
  return created
    ? { outcome: "created", notificationId: created.id }
    : { outcome: "skipped_duplicate" };
}

/** Claims and processes one job. Returns false if the queue had nothing for us. */
export async function runOnce(db: Db): Promise<boolean> {
  const job = await claimNext(db, NOTIFICATION_TYPES);
  if (!job) return false;
  try {
    await markSucceeded(db, job.id, await processNotification(db, job.payload));

    // sendNotification
    // provider.send(payload, key)

    // on transient error
    //  requeue to the scheduled queue
  } catch (err) {
    await markFailed(
      db,
      job.id,
      err instanceof Error ? err.message : String(err),
    );
  }
  return true;
}
