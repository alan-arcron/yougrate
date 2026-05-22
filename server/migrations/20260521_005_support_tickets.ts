import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("support_tickets", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.string("user_email", 255).notNullable();
    t.string("type", 20).notNullable().defaultTo("question");
    t.string("subject", 500).notNullable();
    t.text("description").notNullable();
    t.jsonb("image_urls").notNullable().defaultTo("[]");
    t.string("status", 20).notNullable().defaultTo("open");
    t.text("admin_notes").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("support_tickets");
}
