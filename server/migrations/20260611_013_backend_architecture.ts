import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    // Coarse classification of the app's backend so we can route deployment and
    // set user expectations: "supabase_only" (frontend + Supabase, current
    // default), "edge_functions" (serverless functions -> Supabase Edge
    // Functions), or "server" (a true long-running server -> Railway).
    t.string("backend_type", 30);
    // Supporting detail for the classification: { reason, server_dir?,
    // start_command?, edge_functions?: string[] }.
    t.jsonb("backend_details").defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("backend_type");
    t.dropColumn("backend_details");
  });
}
