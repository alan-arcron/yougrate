import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    // Free-form notes the reviewer writes back to the customer.
    t.text("review_notes");
    // S3 object key of the reviewed code archive the admin uploads back.
    t.text("review_artifact_key");
    // Original display filename for the reviewed archive (for the download).
    t.string("review_artifact_name", 255);
    // When the reviewer marked the review complete and delivered it.
    t.timestamp("reviewed_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("review_notes");
    t.dropColumn("review_artifact_key");
    t.dropColumn("review_artifact_name");
    t.dropColumn("reviewed_at");
  });
}
