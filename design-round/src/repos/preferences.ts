import type { Db } from "../db.ts";
import type { PatientPreference } from "../types.ts";

export async function getPreference(db: Db, patientId: string): Promise<PatientPreference | null> {
  const { rows } = await db.query(
    `SELECT patient_id, channel_pref, opt_out, quiet_hours_start, quiet_hours_end, timezone
       FROM patient_preferences
      WHERE patient_id = $1`,
    [patientId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    patientId: r.patient_id,
    channelPref: r.channel_pref,
    optOut: r.opt_out,
    quietHoursStart: r.quiet_hours_start,
    quietHoursEnd: r.quiet_hours_end,
    timezone: r.timezone,
  };
}
