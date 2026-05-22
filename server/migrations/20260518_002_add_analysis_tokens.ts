import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.integer("analysis_input_tokens").defaultTo(0);
    t.integer("analysis_output_tokens").defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("migrations", (t) => {
    t.dropColumn("analysis_input_tokens");
    t.dropColumn("analysis_output_tokens");
  });
}
