import { performance } from "node:perf_hooks";

const baseUrl = process.env.LOAD_TEST_URL || "https://jung-bu.vercel.app";
const concurrency = Number(process.env.LOAD_TEST_USERS || 100);
const waves = Number(process.env.LOAD_TEST_WAVES || 12);
const intervalMs = Number(process.env.LOAD_TEST_INTERVAL_MS || 5000);
const timeoutMs = Number(process.env.LOAD_TEST_TIMEOUT_MS || 20000);

function percentile(sorted, value) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((value / 100) * sorted.length) - 1)];
}

function summarize(name, results, wallMs) {
  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok);
  const statusCounts = results.reduce((counts, result) => {
    const key = result.status ? String(result.status) : "network-error";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return {
    name,
    requests: results.length,
    successRatePercent: Number((((results.length - failures.length) / results.length) * 100).toFixed(2)),
    errors: failures.length,
    statusCounts,
    latencyMs: {
      min: Number((durations[0] || 0).toFixed(1)),
      average: Number((durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)).toFixed(1)),
      p50: Number(percentile(durations, 50).toFixed(1)),
      p95: Number(percentile(durations, 95).toFixed(1)),
      p99: Number(percentile(durations, 99).toFixed(1)),
      max: Number((durations.at(-1) || 0).toFixed(1)),
    },
    throughputRequestsPerSecond: Number(((results.length / Math.max(1, wallMs)) * 1000).toFixed(2)),
    transferredBytes: results.reduce((sum, result) => sum + result.bytes, 0),
    sampleErrors: failures.slice(0, 5).map((result) => result.error || `HTTP ${result.status}`),
  };
}

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      headers: { "user-agent": "JungBu-Authorized-Load-Test/1.0" },
      signal: controller.signal,
    });
    const body = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      bytes: body.byteLength,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runWave(path) {
  return Promise.all(Array.from({ length: concurrency }, () => request(path)));
}

async function runBurst(name, path) {
  const startedAt = performance.now();
  const results = await runWave(path);
  return summarize(name, results, performance.now() - startedAt);
}

async function runSustained() {
  const results = [];
  const startedAt = performance.now();
  for (let wave = 0; wave < waves; wave += 1) {
    const targetTime = startedAt + wave * intervalMs;
    const waitMs = targetTime - performance.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    results.push(...(await runWave("/api/event")));
  }
  return summarize(
    `${concurrency} users polling every ${intervalMs / 1000}s for ${waves} waves`,
    results,
    performance.now() - startedAt,
  );
}

await request("/api/event");

const report = {
  testedAt: new Date().toISOString(),
  target: baseUrl,
  configuration: { concurrency, waves, intervalMs, timeoutMs },
  phases: [],
};

report.phases.push(await runBurst(`${concurrency} simultaneous page loads`, "/"));
report.phases.push(await runBurst(`${concurrency} simultaneous API reads`, "/api/event"));
report.phases.push(await runSustained());

console.log(JSON.stringify(report, null, 2));
