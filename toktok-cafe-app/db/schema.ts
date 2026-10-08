import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const eventState = sqliteTable("event_state", {
  id: integer("id").primaryKey(),
  currentRound: integer("current_round").notNull().default(1),
  status: text("status").notNull().default("ready"),
  roundStartedAt: text("round_started_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tableId: integer("table_id").notNull(),
  round: integer("round").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_attendance_round_table").on(table.round, table.tableId)]);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("익명"),
  message: text("message").notNull(),
  winner: integer("winner", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_feedback_created_at").on(table.createdAt)]);

export const materialLinks = sqliteTable("material_links", {
  tableId: integer("table_id").primaryKey(),
  url: text("url").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
