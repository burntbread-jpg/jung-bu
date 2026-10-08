import { env } from "cloudflare:workers";

const CAPACITY = 10;
type EventState = { currentRound: number; status: "ready" | "active" | "break" | "ended"; roundStartedAt: string | null };

function db() {
  if (!env.DB) throw new Error("운영 데이터 저장소에 연결할 수 없습니다.");
  return env.DB;
}

function validTableId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 1 && id <= 15 ? id : null;
}

function truncate(value: unknown, length: number) {
  return Array.from(String(value ?? "").trim()).slice(0, length).join("");
}

async function validOperator(request: Request) {
  const expected = env.OPERATOR_PIN;
  const provided = request.headers.get("X-Operator-Pin") ?? "";
  if (!expected || !provided) return false;
  const encoder = new TextEncoder();
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  return new Uint8Array(expectedHash).every((byte, index) => byte === new Uint8Array(providedHash)[index]);
}

async function readState(database: D1Database): Promise<EventState> {
  const row = await database.prepare("SELECT current_round, status, round_started_at FROM event_state WHERE id = 1").first<{ current_round: number; status: EventState["status"]; round_started_at: string | null }>();
  if (!row) return { currentRound: 1, status: "ready", roundStartedAt: null };
  if (row.status === "active" && row.round_started_at) {
    const elapsed = Date.now() - new Date(row.round_started_at).getTime();
    if (elapsed >= 20 * 60 * 1000) {
      const status = row.current_round >= 3 ? "ended" : "break";
      await database.prepare("UPDATE event_state SET status = ?, round_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(status).run();
      return { currentRound: row.current_round, status, roundStartedAt: null };
    }
  }
  return { currentRound: row.current_round, status: row.status, roundStartedAt: row.round_started_at };
}

export async function GET() {
  try {
    const database = db();
    const state = await readState(database);
    const [countsResult, feedbackResult, materialsResult] = await database.batch([
      database.prepare("SELECT table_id, COUNT(*) AS count FROM attendance WHERE round = ? GROUP BY table_id").bind(state.currentRound),
      database.prepare("SELECT id, name, message, winner, created_at FROM feedback ORDER BY id DESC LIMIT 60"),
      database.prepare("SELECT table_id, url FROM material_links ORDER BY table_id"),
    ]);
    return Response.json({
      state,
      capacity: CAPACITY,
      counts: Object.fromEntries((countsResult.results as Array<{ table_id: number; count: number }>).map((row) => [row.table_id, Math.min(Number(row.count), CAPACITY)])),
      feedback: feedbackResult.results,
      materials: Object.fromEntries((materialsResult.results as Array<{ table_id: number; url: string }>).map((row) => [row.table_id, row.url])),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "현황을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const database = db();
    const state = await readState(database);

    if (action === "verify_operator") {
      if (!env.OPERATOR_PIN) return Response.json({ error: "운영자 PIN이 아직 설정되지 않았습니다." }, { status: 503 });
      if (!(await validOperator(request))) return Response.json({ error: "운영자 PIN이 올바르지 않습니다." }, { status: 401 });
      return Response.json({ ok: true });
    }

    const protectedActions = new Set(["start", "next", "pause", "end", "reset", "material", "raffle"]);
    if (protectedActions.has(action) && !(await validOperator(request))) {
      return Response.json({ error: "운영자 인증이 필요합니다." }, { status: 401 });
    }

    if (action === "attend") {
      const tableId = validTableId(payload.tableId);
      if (!tableId) return Response.json({ error: "테이블 번호를 확인해 주세요." }, { status: 400 });
      if (state.status !== "active") return Response.json({ error: "현재 참석을 받는 회차가 아닙니다." }, { status: 409 });
      const inserted = await database.prepare(
        `INSERT INTO attendance (table_id, round)
         SELECT ?, ?
         WHERE (SELECT COUNT(*) FROM attendance WHERE round = ? AND table_id = ?) < ?`,
      ).bind(tableId, state.currentRound, state.currentRound, tableId, CAPACITY).run();
      if (!inserted.meta.changes) return Response.json({ error: "이 테이블은 정원이 찼습니다." }, { status: 409 });
      const countRow = await database.prepare("SELECT COUNT(*) AS count FROM attendance WHERE round = ? AND table_id = ?").bind(state.currentRound, tableId).first<{ count: number }>();
      const count = Math.min(Number(countRow?.count ?? 0), CAPACITY);
      return Response.json({ ok: true, count, remaining: CAPACITY - count });
    }

    if (action === "feedback") {
      const message = truncate(payload.message, 240);
      const name = truncate(payload.name, 30) || "익명";
      if (!message) return Response.json({ error: "참여 소감을 입력해 주세요." }, { status: 400 });
      await database.prepare("INSERT INTO feedback (name, message) VALUES (?, ?)").bind(name, message).run();
      return Response.json({ ok: true });
    }

    if (action === "start" || action === "next") {
      const nextRound = action === "start" ? Math.max(1, state.currentRound) : state.currentRound + 1;
      if (nextRound > 3) return Response.json({ error: "3회차까지 모두 진행했습니다." }, { status: 409 });
      const now = new Date().toISOString();
      await database.prepare(`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at) VALUES (1, ?, 'active', ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET current_round = excluded.current_round, status = 'active', round_started_at = excluded.round_started_at, updated_at = CURRENT_TIMESTAMP`).bind(nextRound, now).run();
      return Response.json({ ok: true, currentRound: nextRound, roundStartedAt: now });
    }

    if (action === "pause") {
      await database.prepare(`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at) VALUES (1, ?, 'break', NULL, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET status = 'break', round_started_at = NULL, updated_at = CURRENT_TIMESTAMP`).bind(state.currentRound).run();
      return Response.json({ ok: true });
    }

    if (action === "end") {
      await database.prepare(`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at) VALUES (1, 3, 'ended', NULL, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET current_round = 3, status = 'ended', round_started_at = NULL, updated_at = CURRENT_TIMESTAMP`).run();
      return Response.json({ ok: true });
    }

    if (action === "reset") {
      await database.batch([
        database.prepare("DELETE FROM attendance"),
        database.prepare("DELETE FROM feedback"),
        database.prepare(`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at) VALUES (1, 1, 'ready', NULL, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET current_round = 1, status = 'ready', round_started_at = NULL, updated_at = CURRENT_TIMESTAMP`),
      ]);
      return Response.json({ ok: true });
    }

    if (action === "material") {
      const tableId = validTableId(payload.tableId);
      const url = truncate(payload.url, 500);
      let validUrl = false;
      try { validUrl = ["http:", "https:"].includes(new URL(url).protocol); } catch { validUrl = false; }
      if (!tableId || !validUrl) return Response.json({ error: "테이블과 http(s) 자료 주소를 확인해 주세요." }, { status: 400 });
      await database.prepare(`INSERT INTO material_links (table_id, url, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(table_id) DO UPDATE SET url = excluded.url, updated_at = CURRENT_TIMESTAMP`).bind(tableId, url).run();
      return Response.json({ ok: true });
    }

    if (action === "raffle") {
      const winner = await database.prepare("SELECT id, name, message FROM feedback WHERE winner = 0 ORDER BY RANDOM() LIMIT 1").first<{ id: number; name: string; message: string }>();
      if (!winner) return Response.json({ error: "추첨할 참여 소감이 없습니다." }, { status: 409 });
      await database.prepare("UPDATE feedback SET winner = 1 WHERE id = ?").bind(winner.id).run();
      return Response.json({ ok: true, winner });
    }

    return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
