import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.string("reviewed_by", 320);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("reviewed_by");
  });
}
