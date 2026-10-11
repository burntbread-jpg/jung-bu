import { getDatabase } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPACITY = 7;
const DEFAULT_OPERATOR_PIN_HASH = "790520ed9fe8bbad69ddbe81f243a056fc801861f7f4d1b0d46ad85820624ed9";
const FILTERED_TERMS = [
  "씨발", "시발", "씨바ᄅ", "시바ᄅ", "개새끼", "새끼", "병신", "지랄", "꺼져", "닥쳐", "미친", "멍청", "바보", "죽어", "엿먹",
  "최악", "형편없", "별로", "재미없", "지루", "싫어", "짜증", "불쾌", "불편", "실망", "엉망", "망했", "쓸모없", "시간낭비",
  "sibal",
];
const FILTERED_PATTERNS = FILTERED_TERMS.map((term) => new RegExp(
  Array.from(term).map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s._·*~-]*"),
  "giu",
));
type Sql = Awaited<ReturnType<typeof getDatabase>>;
type EventState = { currentRound: number; status: "ready" | "active" | "break" | "ended"; roundStartedAt: string | null };

function attendanceRoundFor(state: EventState) {
  if (state.status === "ended" || (state.status === "break" && state.currentRound >= 3)) return null;
  return state.status === "break" ? state.currentRound + 1 : state.currentRound;
}

function validTableId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 1 && id <= 15 ? id : null;
}

function truncate(value: unknown, length: number) {
  return Array.from(String(value ?? "").trim()).slice(0, length).join("");
}

function filterNegativeWords(value: unknown, length: number) {
  let filtered = truncate(value, length).normalize("NFKC");
  for (const pattern of FILTERED_PATTERNS) {
    filtered = filtered.replace(pattern, (match) => "•".repeat(Math.max(2, Array.from(match).filter((character) => /[\p{L}\p{N}]/u.test(character)).length)));
  }
  return filtered;
}

function hexToBytes(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function validOperator(request: Request) {
  const provided = request.headers.get("X-Operator-Pin") ?? "";
  if (!provided) return false;
  const encoder = new TextEncoder();
  const providedHash = await crypto.subtle.digest("SHA-256", encoder.encode(provided));
  const expectedBytes = hexToBytes(DEFAULT_OPERATOR_PIN_HASH);
  const providedBytes = new Uint8Array(providedHash);
  let mismatch = expectedBytes.length ^ providedBytes.length;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    mismatch |= expectedBytes[index] ^ (providedBytes[index] ?? 0);
  }
  return mismatch === 0;
}

async function readState(sql: Sql): Promise<EventState> {
  const transitioned = await sql`UPDATE event_state
    SET status = CASE WHEN current_round >= 3 THEN 'ended' ELSE 'break' END,
        round_started_at = NULL,
        updated_at = now()
    WHERE id = 1
      AND status = 'active'
      AND round_started_at IS NOT NULL
      AND round_started_at <= now() - interval '20 minutes'
    RETURNING current_round, status, round_started_at`;
  if (transitioned[0]) {
    return {
      currentRound: Number(transitioned[0].current_round),
      status: transitioned[0].status as EventState["status"],
      roundStartedAt: null,
    };
  }

  const rows = await sql`SELECT current_round, status, round_started_at FROM event_state WHERE id = 1`;
  const row = rows[0] as { current_round: number; status: EventState["status"]; round_started_at: string | Date | null } | undefined;
  if (!row) return { currentRound: 1, status: "ready", roundStartedAt: null };

  const roundStartedAt = row.round_started_at ? new Date(row.round_started_at).toISOString() : null;
  return { currentRound: Number(row.current_round), status: row.status, roundStartedAt };
}

export async function GET() {
  try {
    const sql = await getDatabase();
    const state = await readState(sql);
    const attendanceRound = attendanceRoundFor(state);
    const [countRows, feedbackRows, materialRows] = await Promise.all([
      attendanceRound
        ? sql`SELECT table_id, COUNT(*)::integer AS count FROM attendance WHERE round = ${attendanceRound} GROUP BY table_id`
        : Promise.resolve([]),
      sql`SELECT id, name, message, winner, created_at FROM feedback ORDER BY id DESC LIMIT 60`,
      sql`SELECT table_id, url, image_url FROM material_links ORDER BY table_id`,
    ]);
    return Response.json({
      state,
      attendanceRound,
      capacity: CAPACITY,
      counts: Object.fromEntries(countRows.map((row) => [Number(row.table_id), Math.min(Number(row.count), CAPACITY)])),
      feedback: feedbackRows.map((row) => ({
        ...row,
        name: filterNegativeWords(row.name, 30) || "익명",
        message: filterNegativeWords(row.message, 500),
      })),
      materials: Object.fromEntries(materialRows.map((row) => [Number(row.table_id), String(row.url)])),
      materialImages: Object.fromEntries(materialRows.filter((row) => row.image_url).map((row) => [Number(row.table_id), String(row.image_url)])),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("event status error", error);
    return Response.json({ error: "현황을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const sql = await getDatabase();
    const state = await readState(sql);

    if (action === "verify_operator") {
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
      if (!attendanceRoundFor(state)) return Response.json({ error: "모든 회차의 참석 접수가 종료되었습니다." }, { status: 409 });

      const startSlot = crypto.getRandomValues(new Uint32Array(1))[0] % CAPACITY;
      let insertedRound: number | null = null;
      for (let offset = 0; offset < CAPACITY; offset += 1) {
        const slot = ((startSlot + offset) % CAPACITY) + 1;
        const rows = await sql`INSERT INTO attendance (table_id, round, slot)
          SELECT ${tableId}, CASE WHEN status = 'break' THEN current_round + 1 ELSE current_round END, ${slot}
          FROM event_state
          WHERE id = 1
            AND status <> 'ended'
            AND NOT (status = 'break' AND current_round >= 3)
          ON CONFLICT (round, table_id, slot) DO NOTHING
          RETURNING round`;
        if (rows.length) { insertedRound = Number(rows[0].round); break; }
      }
      if (!insertedRound) {
        const latest = await readState(sql);
        const error = attendanceRoundFor(latest) ? "이 테이블은 정원이 찼습니다." : "모든 회차의 참석 접수가 종료되었습니다.";
        return Response.json({ error }, { status: 409 });
      }
      const countRows = await sql`SELECT COUNT(*)::integer AS count FROM attendance WHERE round = ${insertedRound} AND table_id = ${tableId}`;
      const count = Math.min(Number(countRows[0]?.count ?? 0), CAPACITY);
      return Response.json({ ok: true, attendanceRound: insertedRound, count, remaining: CAPACITY - count });
    }

    if (action === "feedback") {
      const message = filterNegativeWords(payload.message, 500);
      const name = filterNegativeWords(payload.name, 30) || "익명";
      if (!message) return Response.json({ error: "참여 소감을 입력해 주세요." }, { status: 400 });
      await sql`INSERT INTO feedback (name, message) VALUES (${name}, ${message})`;
      return Response.json({ ok: true });
    }

    if (action === "start" || action === "next") {
      const nextRound = action === "start" ? Math.max(1, state.currentRound) : state.currentRound + 1;
      if (nextRound > 3) return Response.json({ error: "3회차까지 모두 진행했습니다." }, { status: 409 });
      const now = new Date();
      await sql`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at)
        VALUES (1, ${nextRound}, 'active', ${now}, now())
        ON CONFLICT (id) DO UPDATE SET current_round = EXCLUDED.current_round, status = 'active', round_started_at = EXCLUDED.round_started_at, updated_at = now()`;
      return Response.json({ ok: true, currentRound: nextRound, roundStartedAt: now.toISOString() });
    }

    if (action === "pause") {
      await sql`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at)
        VALUES (1, ${state.currentRound}, 'break', NULL, now())
        ON CONFLICT (id) DO UPDATE SET status = 'break', round_started_at = NULL, updated_at = now()`;
      return Response.json({ ok: true });
    }

    if (action === "end") {
      await sql`INSERT INTO event_state (id, current_round, status, round_started_at, updated_at)
        VALUES (1, 3, 'ended', NULL, now())
        ON CONFLICT (id) DO UPDATE SET current_round = 3, status = 'ended', round_started_at = NULL, updated_at = now()`;
      return Response.json({ ok: true });
    }

    if (action === "reset") {
      await sql`WITH cleared_attendance AS (DELETE FROM attendance),
        cleared_feedback AS (DELETE FROM feedback)
        INSERT INTO event_state (id, current_round, status, round_started_at, updated_at)
        VALUES (1, 1, 'ready', NULL, now())
        ON CONFLICT (id) DO UPDATE SET current_round = 1, status = 'ready', round_started_at = NULL, updated_at = now()`;
      return Response.json({ ok: true });
    }

    if (action === "material") {
      const tableId = validTableId(payload.tableId);
      const url = truncate(payload.url, 500);
      const imageUrl = truncate(payload.imageUrl, 1000);
      let validUrl = false;
      try { validUrl = ["http:", "https:"].includes(new URL(url).protocol); } catch { validUrl = false; }
      let validImageUrl = !imageUrl;
      try { validImageUrl = !imageUrl || ["http:", "https:"].includes(new URL(imageUrl).protocol); } catch { validImageUrl = false; }
      if (!tableId || !validUrl || !validImageUrl) return Response.json({ error: "테이블과 http(s) 자료·이미지 주소를 확인해 주세요." }, { status: 400 });
      await sql`INSERT INTO material_links (table_id, url, image_url, updated_at) VALUES (${tableId}, ${url}, ${imageUrl || null}, now())
        ON CONFLICT (table_id) DO UPDATE SET url = EXCLUDED.url, image_url = EXCLUDED.image_url, updated_at = now()`;
      return Response.json({ ok: true });
    }

    if (action === "raffle") {
      const rows = await sql`WITH picked AS (
          SELECT id FROM feedback WHERE winner = false ORDER BY random() FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE feedback SET winner = true FROM picked WHERE feedback.id = picked.id
        RETURNING feedback.id, feedback.name, feedback.message`;
      const winner = rows[0];
      if (!winner) return Response.json({ error: "추첨할 참여 소감이 없습니다." }, { status: 409 });
      return Response.json({ ok: true, winner: { ...winner, name: filterNegativeWords(winner.name, 30), message: filterNegativeWords(winner.message, 500) } });
    }

    return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  } catch (error) {
    console.error("event action error", error);
    return Response.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
