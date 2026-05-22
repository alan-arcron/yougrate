import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("email", 255).notNullable().unique();
    t.string("name", 255);
    t.string("avatar_url", 500);
    t.string("github_access_token", 500);
    t.string("github_username", 255);
    t.string("vercel_access_token", 500);
    t.string("stripe_customer_id", 255);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("projects", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("name", 255).notNullable();
    t.string("github_repo_url", 500).notNullable();
    t.string("github_repo_full_name", 255).notNullable();
    t.string("default_branch", 100).defaultTo("main");
    t.string("detected_platform", 50);
    t.string("supabase_url", 500);
    t.string("supabase_anon_key", 500);
    t.enum("status", ["created", "analyzing", "analyzed", "migrating", "migrated", "deploying", "deployed", "failed"]).notNullable().defaultTo("created");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index("user_id");
  });

  await knex.schema.createTable("migrations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
    t.enum("status", ["pending", "analyzing", "estimated", "confirmed", "running", "completed", "failed"]).notNullable().defaultTo("pending");
    t.string("detected_platform", 50);
    t.jsonb("detected_services").defaultTo("[]");
    t.integer("total_files").defaultTo(0);
    t.integer("files_to_migrate").defaultTo(0);
    t.integer("files_migrated").defaultTo(0);
    t.text("current_file");
    t.integer("estimated_input_tokens").defaultTo(0);
    t.integer("estimated_output_tokens").defaultTo(0);
    t.integer("estimated_cost_cents").defaultTo(0);
    t.integer("actual_input_tokens").defaultTo(0);
    t.integer("actual_output_tokens").defaultTo(0);
    t.integer("actual_cost_cents").defaultTo(0);
    t.string("output_type", 20);
    t.string("output_repo_url", 500);
    t.string("output_branch", 255);
    t.text("error_message");
    t.jsonb("migration_log").defaultTo("[]");
    t.timestamp("started_at", { useTz: true });
    t.timestamp("completed_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index("project_id");
  });

  await knex.schema.createTable("migration_files", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("migration_id").notNullable().references("id").inTable("migrations").onDelete("CASCADE");
    t.text("file_path").notNullable();
    t.enum("status", ["pending", "migrating", "completed", "skipped", "failed"]).notNullable().defaultTo("pending");
    t.text("original_content");
    t.text("migrated_content");
    t.jsonb("changes_summary");
    t.integer("input_tokens").defaultTo(0);
    t.integer("output_tokens").defaultTo(0);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index("migration_id");
  });

  await knex.schema.createTable("billing_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.uuid("migration_id").references("id").inTable("migrations").onDelete("SET NULL");
    t.integer("input_tokens").notNullable().defaultTo(0);
    t.integer("output_tokens").notNullable().defaultTo(0);
    t.integer("raw_cost_cents").notNullable().defaultTo(0);
    t.integer("billed_cost_cents").notNullable().defaultTo(0);
    t.float("markup_multiplier").notNullable().defaultTo(4);
    t.string("stripe_invoice_id", 255);
    t.enum("status", ["pending", "invoiced", "paid", "failed"]).notNullable().defaultTo("pending");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index("user_id");
    t.index("migration_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("billing_events");
  await knex.schema.dropTableIfExists("migration_files");
  await knex.schema.dropTableIfExists("migrations");
  await knex.schema.dropTableIfExists("projects");
  await knex.schema.dropTableIfExists("users");
}
