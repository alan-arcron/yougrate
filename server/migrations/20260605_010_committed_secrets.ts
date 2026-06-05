import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.jsonb("committed_secrets").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("committed_secrets");
  });
}
