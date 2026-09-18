-- Patient notification service: preferences + notifications.
-- Queue lives in the existing `jobs` table; this migration doesn't touch it.

BEGIN;

CREATE TYPE notification_channel AS ENUM ('sms', 'email', 'push');
CREATE TYPE notification_type    AS ENUM ('appointment_reminder', 'order_status');
CREATE TYPE notification_status  AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE patient_preferences (
    patient_id         uuid PRIMARY KEY,
    channel_pref       notification_channel NOT NULL,
    opt_out            boolean NOT NULL DEFAULT false,
    -- Local wall-clock window, interpreted in `timezone`. May wrap midnight (22:00 -> 07:00).
    quiet_hours_start  time,
    quiet_hours_end    time,
    timezone           text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT quiet_hours_complete CHECK (
        (quiet_hours_start IS NULL AND quiet_hours_end IS NULL AND timezone IS NULL)
        OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL AND timezone IS NOT NULL)
    )
);

CREATE TABLE notifications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id        uuid NOT NULL,
    notification_type notification_type NOT NULL,
    category          text NOT NULL,
    payload           jsonb NOT NULL,
    status            notification_status NOT NULL DEFAULT 'pending',
    scheduled_at      timestamptz NOT NULL DEFAULT now(),
    -- sha256 over (patient_id, notification_type, canonical payload); computed by the worker.
    -- The unique constraint is the authoritative dedupe guard.
    dedupe_key        text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_dedupe_key_key UNIQUE (dedupe_key)
);

-- Sender's scan: "what's due?"
CREATE INDEX idx_notifications_due ON notifications (scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_notifications_patient ON notifications (patient_id, created_at DESC);

COMMIT;
