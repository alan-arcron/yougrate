import type { Knex } from "knex";

// Existing migrations created their Supabase tables during the run, before we
// tracked it. Mark finished migrations as schema_applied so the (now mandatory)
// "Create Tables in Supabase" step doesn't reappear for them. Rows that recorded
// an error are left alone so users can still resolve and re-apply.
export async function up(knex: Knex): Promise<void> {
  await knex("migrations")
    .whereNull("schema_error")
    .whereIn("status", ["completed", "reviewed", "pending_review", "reviewing"])
    .update({ schema_applied: true });
}

export async function down(): Promise<void> {
  // Data backfill — no-op on rollback.
}
