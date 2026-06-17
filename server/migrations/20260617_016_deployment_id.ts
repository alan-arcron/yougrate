import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    // The current Vercel deployment id for this migration. Lets the API
    // reconcile a stuck "building"/"fixing" row against Vercel's real status
    // (e.g. when the in-process build worker dies on a server restart).
    t.string("deployment_id", 255);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("deployment_id");
  });
}
