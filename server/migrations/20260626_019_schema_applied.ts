import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.boolean("schema_applied").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("schema_applied");
  });
}
