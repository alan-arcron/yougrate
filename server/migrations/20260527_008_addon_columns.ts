import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.boolean("addon_data_migration").notNullable().defaultTo(false);
    t.boolean("addon_code_review").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("addon_data_migration");
    t.dropColumn("addon_code_review");
  });
}
