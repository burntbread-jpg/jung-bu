import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type SqlClient = NeonQueryFunction<false, false>;

let client: SqlClient | undefined;
let schemaPromise: Promise<void> | undefined;

function getClient(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL이 설정되지 않았습니다. Vercel Marketplace에서 Neon을 연결해 주세요.");
  }
  client ??= neon<false, false>(databaseUrl);
  return client;
}

async function ensureSchema(sql: SqlClient) {
  if (!schemaPromise) {
    schemaPromise = sql.transaction((tx) => [
      tx`SELECT pg_advisory_xact_lock(20261010)`,
      tx`CREATE TABLE IF NOT EXISTS event_state (
        id integer PRIMARY KEY CHECK (id = 1),
        current_round integer NOT NULL DEFAULT 1 CHECK (current_round BETWEEN 1 AND 3),
        status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'active', 'break', 'ended')),
        round_started_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      tx`CREATE TABLE IF NOT EXISTS attendance (
        id bigserial PRIMARY KEY,
        table_id integer NOT NULL CHECK (table_id BETWEEN 1 AND 15),
        round integer NOT NULL CHECK (round BETWEEN 1 AND 3),
        slot integer NOT NULL CHECK (slot BETWEEN 1 AND 7),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (round, table_id, slot)
      )`,
      tx`DELETE FROM attendance WHERE slot > 7`,
      tx`DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'attendance_slot_check'
              AND pg_get_constraintdef(oid) LIKE '%10%'
          ) THEN
            ALTER TABLE attendance DROP CONSTRAINT attendance_slot_check;
            ALTER TABLE attendance ADD CONSTRAINT attendance_slot_check CHECK (slot BETWEEN 1 AND 7);
          END IF;
        END
      $$`,
      tx`CREATE INDEX IF NOT EXISTS idx_attendance_round_table ON attendance (round, table_id)`,
      tx`CREATE TABLE IF NOT EXISTS feedback (
        id bigserial PRIMARY KEY,
        name text NOT NULL DEFAULT '익명',
        message text NOT NULL,
        winner boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      tx`CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC)`,
      tx`CREATE TABLE IF NOT EXISTS material_links (
        table_id integer PRIMARY KEY CHECK (table_id BETWEEN 1 AND 15),
        url text NOT NULL,
        image_url text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      tx`ALTER TABLE material_links ADD COLUMN IF NOT EXISTS image_url text`,
    ]).then(() => undefined).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

export async function getDatabase() {
  const sql = getClient();
  await ensureSchema(sql);
  return sql;
}
