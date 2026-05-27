import { db } from "../db";

const STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes without an update
const CHECK_INTERVAL_MS = 5 * 60 * 1000;   // check every 5 minutes

const ACTIVE_STATUSES = ["running", "analyzing", "building", "fixing"];

export function startStallDetector() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS).toISOString();

      const stalled = await db("migrations")
        .whereIn("status", ACTIVE_STATUSES)
        .where("updated_at", "<", cutoff)
        .select("id", "status", "updated_at");

      for (const m of stalled) {
        await db("migrations")
          .where({ id: m.id })
          .whereIn("status", ACTIVE_STATUSES)
          .update({
            status: "failed",
            error_message: `Migration stalled — no progress for ${STALL_THRESHOLD_MS / 60000} minutes (was ${m.status}). You can retry to resume.`,
            current_file: null,
            updated_at: new Date().toISOString(),
          });

        const migration = await db("migrations").where({ id: m.id }).first();
        if (migration) {
          await db("projects")
            .where({ id: migration.project_id })
            .update({ status: "failed" });
        }

        console.log(`[stall-detector] Marked migration ${m.id.slice(0, 8)} as failed (was ${m.status}, last updated ${m.updated_at})`);
      }
    } catch (err) {
      console.error("[stall-detector] Error:", err);
    }
  }, CHECK_INTERVAL_MS);

  console.log("[stall-detector] Running every 5 minutes (10 min threshold)");
}
