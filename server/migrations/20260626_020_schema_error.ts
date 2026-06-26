import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.text("schema_error").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("schema_error");
  });
}
