import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { startServer } from '../src/server.mjs';
import { AssetService } from '../src/assets.mjs';
import { safeDataPath } from '../src/store.mjs';
import { hash } from '../src/common.mjs';

// Run: node --experimental-sqlite tools/benchmark-local.mjs
// Optional report: THIRD_DRAFT_BENCHMARK_REPORT must be a path inside
// .workbench/v1-benchmark. Real data-directory environment variables are ignored.
// This measures local HTTP + JSON parsing only, never browser rendering.
const repository = fileURLToPath(new URL('../', import.meta.url));
const benchmarkRoot = path.join(repository, '.workbench', 'v1-benchmark');
mkdirSync(safeDataPath(benchmarkRoot), { recursive: true });
let reportPath = null;
if (process.env.THIRD_DRAFT_BENCHMARK_REPORT) {
  const candidate = path.resolve(process.env.THIRD_DRAFT_BENCHMARK_REPORT);
  if (!candidate.startsWith(benchmarkRoot + path.sep) || path.extname(candidate) !== '.json')
    throw new Error('Benchmark report must be a JSON file inside .workbench/v1-benchmark.');
  reportPath = safeDataPath(benchmarkRoot, path.relative(benchmarkRoot, candidate));
}
const fixtureDirectory = mkdtempSync(path.join(benchmarkRoot, 'fixture-'));
const PRIMARY_COUNT = 1000, SECONDARY_COUNT = 1, SAMPLES = 50, WARMUP = 5;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const sourceFiles = ['src/store.mjs', 'src/assets.mjs', 'src/server.mjs',
  'src/skills.mjs', 'src/context.mjs', 'src/service.mjs', 'tools/benchmark-local.mjs'];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(path.join(repository, file)))]));
const initialSourceHashes = sourceHashes();
let providerCalls = 0, inspections = 0, app;
const runtime = {
  async inspect() { inspections++; return { available: false, route: 'benchmark-disabled', billing: 'subscription', reason: 'benchmark_no_provider' }; },
  async generate() { providerCalls++; throw new Error('A benchmark must never call a provider.'); },
};
const round = value => Math.round(value * 1000) / 1000;
function statistics(samples) {
  const sorted = samples.map(sample => sample.ms).sort((a, b) => a - b);
  const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
  return { samples: sorted.length, p50Ms: round(percentile(0.5)), p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1)), payloadBytes: { min: Math.min(...samples.map(s => s.bytes)),
      max: Math.max(...samples.map(s => s.bytes)) }, sampleMs: samples.map(sample => round(sample.ms)) };
}

try {
  app = await startServer({ dataDir: fixtureDirectory, port: 0, runtime });
  const assets = new AssetService(app.store);
  const primary = app.store.createProject({ name: 'Synthetic benchmark: 1000 tiny PNG assets' });
  const secondary = app.store.createProject({ name: 'Synthetic benchmark: secondary project' });
  const seedStart = performance.now();
  for (const [project, count] of [[primary, PRIMARY_COUNT], [secondary, SECONDARY_COUNT]]) {
    for (let index = 0; index < count; index++) {
      await assets.import(project.id, { name: `Synthetic tiny PNG ${index + 1}`,
        source: 'Benchmark fixture only: repeated 1x1 PNG; no customer material',
        base64: png.toString('base64') });
      if (project.id === primary.id && (index + 1) % 250 === 0)
        process.stderr.write(`Imported ${index + 1}/${PRIMARY_COUNT} synthetic primary assets.\n`);
    }
  }
  const seedMs = round(performance.now() - seedStart);
  const primaryAssets = app.store.rows('assets', primary.id);
  assert.equal(primaryAssets.length, PRIMARY_COUNT);
  assert.equal(new Set(primaryAssets.map(asset => asset.id)).size, PRIMARY_COUNT);
  assert.equal(app.store.rows('assets', secondary.id).length, SECONDARY_COUNT);
  for (const asset of primaryAssets) {
    assert.equal(asset.width, 1); assert.equal(asset.height, 1);
    assert.equal(hash(assets.read(primary.id, asset.id)), asset.artifactHash);
  }
  const session = await fetch(`${app.url}/api/session`);
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie); await session.arrayBuffer();
  async function snapshot(project, expectedCount) {
    const started = performance.now();
    const response = await fetch(`${app.url}/api/projects/${project.id}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const body = Buffer.from(await response.arrayBuffer());
    const decoded = JSON.parse(body.toString('utf8'));
    const elapsed = performance.now() - started;
    assert.equal(decoded.project.id, project.id);
    assert.equal(decoded.assets.length, expectedCount);
    return { ms: elapsed, bytes: body.length };
  }
  for (let index = 0; index < WARMUP; index++) {
    await snapshot(primary, PRIMARY_COUNT); await snapshot(secondary, SECONDARY_COUNT);
  }
  const repeated = [];
  for (let index = 0; index < SAMPLES; index++) repeated.push(await snapshot(primary, PRIMARY_COUNT));
  const toPrimary = [], toSecondary = [];
  for (let index = 0; index < SAMPLES; index++) {
    toSecondary.push(await snapshot(secondary, SECONDARY_COUNT));
    toPrimary.push(await snapshot(primary, PRIMARY_COUNT));
  }
  const metrics = { primarySnapshot: statistics(repeated),
    switchToPrimary: statistics(toPrimary), switchToSecondary: statistics(toSecondary) };
  const unchanged = JSON.stringify(initialSourceHashes) === JSON.stringify(sourceHashes());
  assert.equal(unchanged, true, 'Implementation changed during the benchmark; rerun against a stable source snapshot.');
  assert.equal(providerCalls, 0); assert.equal(inspections, 0);
  const report = {
    benchmark: 'NFR-07 / T-28 local backend', recordedAt: new Date().toISOString(),
    scope: 'Loopback HTTP response transfer and JSON parsing; backend only',
    hardware: { cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length,
      memoryBytes: os.totalmem(), platform: os.platform(), release: os.release(), architecture: os.arch() },
    runtime: { node: process.version, sqlite: app.store.db.prepare('SELECT sqlite_version() AS version').get().version,
      sharp: sharp.versions.sharp, providerCalls, nativeRuntimeInspections: inspections },
    fixture: { projects: 2, primaryAssets: PRIMARY_COUNT, secondaryAssets: SECONDARY_COUNT,
      dimensions: '1x1', format: 'PNG', sourceBytes: png.length, sourceHash: hash(png),
      creation: 'Every asset passed through AssetService.import, full image decoding, file verification and SQLite persistence.',
      limitation: 'Tiny repeated synthetic images test metadata volume; they do not represent realistic image decoding or browser rendering load.',
      seedMs, isolatedFixtureRemovedAfterRun: true },
    method: { warmupPerProject: WARMUP, samplesPerMetric: SAMPLES,
      percentile: 'nearest rank', timing: 'Request start through HTTP body receipt and JSON parse; validation outside timing.',
      switch: 'Alternating sequential requests between the two projects, with each destination reported separately.' },
    metrics, sourceHashes: initialSourceHashes,
    acceptance: { backend: Object.values(metrics).every(metric => metric.p95Ms <= 1000) ? 'PASS' : 'FAIL',
      targetP95Ms: 1000, browser: 'NOT_RUN', overallNfr07: 'NOT_ACCEPTED',
      note: 'Browser project switching/list rendering must be measured separately before NFR-07 acceptance.' },
  };
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (reportPath) { mkdirSync(path.dirname(reportPath), { recursive: true }); writeFileSync(reportPath, serialized, { flag: 'wx' }); }
  process.stdout.write(serialized);
  if (report.acceptance.backend !== 'PASS') process.exitCode = 1;
} finally {
  if (app) await app.close();
  const target = path.resolve(fixtureDirectory), boundary = path.resolve(benchmarkRoot) + path.sep;
  assert.ok(target.startsWith(boundary) && path.basename(target).startsWith('fixture-'));
  safeDataPath(benchmarkRoot, path.relative(benchmarkRoot, target));
  rmSync(target, { recursive: true, force: true });
}
