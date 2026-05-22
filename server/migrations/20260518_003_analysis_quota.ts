import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (t) => {
    t.integer("free_analyses_used").defaultTo(0);
    t.integer("free_analyses_limit").defaultTo(2);
  });

  await knex.schema.alterTable("migrations", (t) => {
    t.integer("retry_count").defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("free_analyses_used");
    t.dropColumn("free_analyses_limit");
  });

  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("retry_count");
  });
}
