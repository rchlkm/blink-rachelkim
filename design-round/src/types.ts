export const NOTIFICATION_TYPES = ["appointment_reminder", "order_status"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Channel = "sms" | "email" | "push";
export type NotificationStatus = "pending" | "sent" | "failed";

export interface PatientPreference {
  patientId: string;
  channelPref: Channel;
  optOut: boolean;
  /** "HH:MM:SS" local wall-clock time in `timezone`; the window may wrap midnight. */
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}

export interface Notification {
  id: string;
  patientId: string;
  notificationType: NotificationType;
  category: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  scheduledAt: Date;
  dedupeKey: string;
}

/** Shape the API layer enqueues into `jobs.payload`. */
export interface NotificationJobPayload {
  type: NotificationType;
  patient_id: string;
  category?: string;
  /** ISO-8601; defaults to now. */
  scheduled_at?: string;
  payload: Record<string, unknown>;
}

export interface Job {
  id: string;
  payload: unknown;
  attempts: number;
}
