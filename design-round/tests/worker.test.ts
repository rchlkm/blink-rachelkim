import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import type pg from "pg";
import { createPool } from "../src/db.ts";
import { dedupeKey } from "../src/dedupe.ts";
import { processNotification, runOnce } from "../src/worker.ts";

// Runs against the real database inside a transaction that is always rolled back,
// so nothing is left behind in `jobs`, `notifications`, or `patient_preferences`.
const pool = createPool();
let db: pg.PoolClient;

beforeEach(async () => {
  db = await pool.connect();
  await db.query("BEGIN");
});
afterEach(async () => {
  await db.query("ROLLBACK");
  db.release();
});
after(() => pool.end());

const job = (patient_id: string, payload: Record<string, unknown> = { appointment_id: "a1" }) => ({
  type: "appointment_reminder",
  patient_id,
  payload,
});

const count = async (patientId: string) =>
  Number(
    (await db.query("SELECT count(*) FROM notifications WHERE patient_id = $1", [patientId]))
      .rows[0].count,
  );

describe("dedupeKey", () => {
  it("ignores object key order", () => {
    assert.equal(
      dedupeKey("p", "order_status", { a: 1, b: { c: 2, d: 3 } }),
      dedupeKey("p", "order_status", { b: { d: 3, c: 2 }, a: 1 }),
    );
  });
  it("differs by patient, type, and payload", () => {
    const base = dedupeKey("p", "order_status", { a: 1 });
    assert.notEqual(base, dedupeKey("q", "order_status", { a: 1 }));
    assert.notEqual(base, dedupeKey("p", "appointment_reminder", { a: 1 }));
    assert.notEqual(base, dedupeKey("p", "order_status", { a: 2 }));
  });
});

describe("processNotification", () => {
  it("writes a pending notification when there is no preference row", async () => {
    const pid = randomUUID();
    const res = await processNotification(db, job(pid));
    assert.equal(res.outcome, "created");
    const { rows } = await db.query("SELECT status, category FROM notifications WHERE patient_id = $1", [pid]);
    assert.deepEqual(rows, [{ status: "pending", category: "transactional" }]);
  });

  it("skips opted-out patients and writes nothing", async () => {
    const pid = randomUUID();
    await db.query(
      "INSERT INTO patient_preferences (patient_id, channel_pref, opt_out) VALUES ($1, 'sms', true)",
      [pid],
    );
    assert.deepEqual(await processNotification(db, job(pid)), { outcome: "skipped_opt_out" });
    assert.equal(await count(pid), 0);
  });

  it("skips a duplicate even if payload key order differs", async () => {
    const pid = randomUUID();
    await processNotification(db, job(pid, { a: 1, b: 2 }));
    assert.deepEqual(await processNotification(db, job(pid, { b: 2, a: 1 })), {
      outcome: "skipped_duplicate",
    });
    assert.equal(await count(pid), 1);
  });

  it("rejects malformed jobs", async () => {
    await assert.rejects(processNotification(db, { type: "nope" }), /unknown type/);
    await assert.rejects(processNotification(db, { type: "order_status" }), /patient_id/);
  });
});

describe("runOnce", () => {
  const enqueue = async (payload: unknown) =>
    (
      await db.query(
        // Oldest created_at so we're claimed ahead of any real queued jobs.
        `INSERT INTO jobs (id, payload, created_at) VALUES ($1, $2, 'epoch') RETURNING id`,
        [randomUUID(), payload],
      )
    ).rows[0].id as string;

  const status = async (id: string) =>
    (await db.query("SELECT status, result, error, attempts FROM jobs WHERE id = $1", [id])).rows[0];

  it("claims a notification job, writes the notification, marks the job succeeded", async () => {
    const pid = randomUUID();
    const id = await enqueue(job(pid));
    assert.equal(await runOnce(db), true);
    const row = await status(id);
    assert.equal(row.status, "succeeded");
    assert.equal(row.result.outcome, "created");
    assert.equal(row.attempts, 1);
    assert.equal(await count(pid), 1);
  });

  it("marks malformed jobs failed with the error", async () => {
    const id = await enqueue({ type: "order_status", payload: {} });
    await runOnce(db);
    const row = await status(id);
    assert.equal(row.status, "failed");
    assert.match(row.error, /patient_id/);
  });

  it("leaves other job types alone", async () => {
    const id = await enqueue({ type: "send_email", payload: {} });
    await runOnce(db);
    assert.equal((await status(id)).status, "queued");
  });
});
