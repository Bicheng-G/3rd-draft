import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { startServer } from '../src/server.mjs';
import { AssetService } from '../src/assets.mjs';
import { safeDataPath } from '../src/store.mjs';
import { hash } from '../src/common.mjs';

// Prerequisite: npx --yes --package @playwright/cli@0.1.22 playwright-cli --version
// Run: node --experimental-sqlite tools/benchmark-browser.mjs
// Uses only cached CLI packages. Chromium/Chrome must already be installed.
// Optional THIRD_DRAFT_BROWSER_BENCHMARK_REPORT: new JSON file under
// .workbench/v1-benchmark-browser. Real application data-dir settings are ignored.
// --samples=10 supports a short diagnostic run; the default is 30 measured pairs.
// THIRD_DRAFT_PLAYWRIGHT_CLI can name the installed playwright-cli.js explicitly.
const repository = fileURLToPath(new URL('../', import.meta.url));
const benchmarkRoot = path.join(repository, '.workbench', 'v1-benchmark-browser');
const evidenceRoot = path.join(repository, 'output', 'playwright', 'v1-benchmark-browser');
mkdirSync(safeDataPath(benchmarkRoot), { recursive: true });
mkdirSync(safeDataPath(evidenceRoot), { recursive: true });
const fixtureDirectory = mkdtempSync(path.join(benchmarkRoot, 'fixture-'));
const runDirectory = mkdtempSync(path.join(evidenceRoot, 'run-'));
const session = `td-bench-${path.basename(runDirectory).slice(4).toLowerCase()}`;
const reportPath = process.env.THIRD_DRAFT_BROWSER_BENCHMARK_REPORT
  ? path.resolve(process.env.THIRD_DRAFT_BROWSER_BENCHMARK_REPORT)
  : path.join(benchmarkRoot, `browser-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
assert.ok(reportPath.startsWith(benchmarkRoot + path.sep) && path.extname(reportPath) === '.json',
  'Report must be a JSON file inside .workbench/v1-benchmark-browser.');
safeDataPath(benchmarkRoot, path.relative(benchmarkRoot, reportPath));
assert.equal(existsSync(reportPath), false, 'Existing benchmark evidence is never overwritten.');
const sampleArgument = process.argv.find(argument => argument.startsWith('--samples='));
const PRIMARY_COUNT = 1000, SECONDARY_COUNT = 1, SAMPLES = sampleArgument ? Number(sampleArgument.split('=')[1]) : 30, WARMUP = 3;
assert.ok(Number.isInteger(SAMPLES) && SAMPLES >= 10 && SAMPLES <= 50, 'Use 10–50 measured pairs.');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const sourceFiles = ['src/store.mjs', 'src/assets.mjs', 'src/server.mjs', 'src/service.mjs',
  'src/skills.mjs', 'src/context.mjs', 'public/index.html', 'public/app.js', 'public/styles.css',
  'tools/benchmark-browser.mjs'];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(path.join(repository, file)))]));
const initialSourceHashes = sourceHashes();
let app, browserOpened = false, providerCalls = 0, inspections = 0, phase = 'setup';
const disabledRuntime = {
  async inspect() { inspections++; return { available: false, route: 'benchmark-disabled', billing: 'subscription', version: null, reason: 'benchmark_no_provider' }; },
  async generate() { providerCalls++; throw new Error('Provider calls are forbidden in this benchmark.'); },
};
function findCli() {
  if (process.env.THIRD_DRAFT_PLAYWRIGHT_CLI) return path.resolve(process.env.THIRD_DRAFT_PLAYWRIGHT_CLI);
  const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx');
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(cache, entry.name, 'node_modules', '@playwright', 'cli');
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).version === '0.1.22')
      return path.join(directory, 'playwright-cli.js');
  }
  throw new Error('Install @playwright/cli@0.1.22 once using the prerequisite command.');
}
let cliPath;
function cli(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, `-s=${session}`, ...args], { cwd: runDirectory, shell: false, windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      child.kill(); child.stdout.destroy(); child.stderr.destroy();
      reject(new Error(`CLI_EXECUTION_TIMEOUT: ${args[0]} exceeded 90 seconds; no app-performance conclusion follows.`));
    }, 90000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`Playwright CLI exited ${code}: ${stderr || stdout}`)); });
  });
}
const round = value => Math.round(value * 1000) / 1000;
function statistics(samples, field) {
  const sorted = samples.map(sample => sample[field]).sort((a, b) => a - b);
  assert.equal(sorted.length, SAMPLES);
  assert.ok(sorted.every(value => Number.isFinite(value) && value > 0));
  return { samples: sorted.length, p50Ms: round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]), maxMs: round(sorted.at(-1)),
    sampleMs: samples.map(sample => round(sample[field])) };
}

// Executed by the Playwright CLI, using its real browser Page (no test framework).
async function browserMeasurement(page, fixture) {
  const errors = [];
  const onPageError = error => errors.push(error.message);
  page.on('pageerror', onPageError);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForSelector('#project-list .project-button');
  const metrics = { primary: [], secondary: [] };
  async function projectSwitch(project, expected) {
    await page.evaluate(({ name, expected }) => {
      const button = [...document.querySelectorAll('#project-list .project-button')].find(node => node.textContent.includes(name));
      if (!button) throw new Error('Fixture project is missing from the real selector.');
      window.__tdBenchmark = { done: false };
      button.addEventListener('click', () => {
        const start = performance.now();
        const poll = () => {
          if (!document.querySelector('#workspace').hidden && document.querySelector('#current-project-name').textContent === name
              && document.querySelector('#image-count').textContent === String(expected)
              && !document.querySelector('#view-create').hidden) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
              window.__tdBenchmark = { done: true, start, switchMs: performance.now() - start };
            }));
          } else if (performance.now() - start > 30000) window.__tdBenchmark = { done: true, error: 'Project render timed out.' };
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }, { once: true, capture: true });
    }, { name: project.name, expected });
    await page.locator('#project-list .project-button').filter({ hasText: project.name }).click();
    await page.waitForFunction(() => window.__tdBenchmark?.done, null, { timeout: 35000 });
    const result = await page.evaluate(() => window.__tdBenchmark);
    if (result.error) throw new Error(result.error);
    return result;
  }
  async function armSurface(buttonSelector, selector, paginationSelector, project, count) {
    await page.evaluate(({ buttonSelector, selector, paginationSelector, project, count, pageSize }) => {
      window.__tdSurface = { done: false };
      document.querySelector(buttonSelector).addEventListener('click', () => {
        const start = performance.now();
        const poll = async () => {
          const nav = document.querySelector(paginationSelector);
          const cards = [...document.querySelectorAll(selector)];
          const expectedIds = project.assetIds.slice(0, pageSize);
          const ready = nav && Number(nav.dataset.page) === 1 && Number(nav.dataset.totalResults) === count
            && Number(nav.dataset.totalPages) === Math.ceil(count / pageSize)
            && JSON.stringify(cards.map(card => card.dataset.assetId)) === JSON.stringify(expectedIds);
          const images = [...document.querySelectorAll(`${selector} .asset-preview`)].filter(image => {
            const rect = image.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
          });
          if (ready && images.length && images.every(image => image.complete && image.naturalWidth > 0)) {
            try {
              await Promise.all(images.map(image => image.decode()));
              requestAnimationFrame(() => requestAnimationFrame(() => {
                window.__tdSurface = { done: true, ms: performance.now() - start, finished: performance.now(),
                  visibleThumbnails: images.length, renderedCards: cards.length, totalResults: count };
              }));
            } catch (error) { window.__tdSurface = { done: true, error: error.message }; }
          } else if (performance.now() - start > 15000) window.__tdSurface = { done: true, error: 'Paginated card identity or visible thumbnail readiness timed out.' };
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }, { once: true, capture: true });
    }, { buttonSelector, selector, paginationSelector, project, count, pageSize: fixture.pageSize });
  }
  async function surfaceResult(selector) {
    await page.locator(`${selector} .asset-preview`).first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.__tdSurface?.done, null, { timeout: 20000 });
    const result = await page.evaluate(() => window.__tdSurface);
    if (result.error) throw new Error(result.error);
    return result;
  }
  async function sample(project, count) {
    const switched = await projectSwitch(project, count);
    const libraryStart = await page.evaluate(() => performance.now());
    await page.locator('.workspace-nav [data-view="memory"]').click();
    await armSurface('[data-memory-view="images"]', '#image-library .image-card', '#image-pagination', project, count);
    await page.locator('[data-memory-view="images"]').click();
    const library = await surfaceResult('#image-library .image-card');
    const studioStart = await page.evaluate(() => performance.now());
    await armSurface('.workspace-nav [data-view="sets"]', '#set-detail .studio-asset-card', '#studio-pagination', project, count);
    await page.locator('.workspace-nav [data-view="sets"]').click();
    const studio = await surfaceResult('#set-detail .studio-asset-card');
    return { switchMs: switched.switchMs, libraryMs: library.ms, libraryDriverMs: library.finished - libraryStart,
      switchAndLibraryMs: library.finished - switched.start, studioMs: studio.ms, studioDriverMs: studio.finished - studioStart,
      libraryVisibleThumbnails: library.visibleThumbnails, studioVisibleThumbnails: studio.visibleThumbnails,
      libraryRenderedCards: library.renderedCards, studioRenderedCards: studio.renderedCards, totalAssets: count };
  }
  for (let index = 0; index < fixture.warmup + fixture.samples; index++) {
    const secondary = await sample(fixture.secondary, fixture.secondaryCount);
    const primary = await sample(fixture.primary, fixture.primaryCount);
    if (index >= fixture.warmup) { metrics.secondary.push(secondary); metrics.primary.push(primary); }
  }
  const paginationChecks = [];
  async function checkPagination(selector, paginationSelector) {
    async function checkPage(pageNumber) {
      await page.waitForFunction(({ paginationSelector, pageNumber }) => Number(document.querySelector(paginationSelector)?.dataset.page) === pageNumber,
        { paginationSelector, pageNumber });
      const actual = await page.locator(selector).evaluateAll(cards => cards.map(card => card.dataset.assetId));
      const expected = fixture.primary.assetIds.slice((pageNumber - 1) * fixture.pageSize, pageNumber * fixture.pageSize);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Wrong image identities on ${paginationSelector} page ${pageNumber}.`);
      paginationChecks.push({ surface: paginationSelector, page: pageNumber, ids: actual, count: actual.length });
    }
    await checkPage(1);
    await page.locator(`${paginationSelector} [data-page-action="next"]`).click(); await checkPage(2);
    await page.locator(`${paginationSelector} [data-page-action="last"]`).click(); await checkPage(Math.ceil(fixture.primaryCount / fixture.pageSize));
    await page.locator(`${paginationSelector} [data-page-select]`).selectOption('1'); await checkPage(1);
    await page.locator(`${selector} .asset-preview`).first().scrollIntoViewIfNeeded();
    await page.waitForFunction(selector => [...document.querySelectorAll(`${selector} .asset-preview`)].filter(image => {
      const rect = image.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
    }).every(image => image.complete && image.naturalWidth > 0), selector);
  }
  if (fixture.captureScreenshots) {
    await checkPagination('#set-detail .studio-asset-card', '#studio-pagination');
    await page.screenshot({ path: fixture.studioScreenshot, fullPage: false });
    await page.locator('.workspace-nav [data-view="memory"]').click();
    await page.locator('[data-memory-view="images"]').click();
    await checkPagination('#image-library .image-card', '#image-pagination');
    await page.screenshot({ path: fixture.libraryScreenshot, fullPage: false });
  }
  page.off('pageerror', onPageError);
  return { metrics, errors, paginationChecks, browser: { version: page.context().browser().version(),
    userAgent: await page.evaluate(() => navigator.userAgent), viewport: page.viewportSize(), headless: true },
    finalProjectName: await page.locator('#current-project-name').textContent() };
}

try {
  cliPath = findCli();
  assert.ok(existsSync(cliPath) && path.basename(cliPath) === 'playwright-cli.js');
  phase = 'fixture import';
  app = await startServer({ dataDir: fixtureDirectory, port: 4059, runtime: disabledRuntime });
  const assetService = new AssetService(app.store);
  const primary = app.store.createProject({ name: 'Synthetic benchmark: 1000 tiny PNG assets' });
  const secondary = app.store.createProject({ name: 'Synthetic benchmark: secondary project' });
  const seedStarted = performance.now();
  for (const [project, count] of [[primary, PRIMARY_COUNT], [secondary, SECONDARY_COUNT]]) {
    const concept = app.store.addConcept(project.id, { title: 'Synthetic benchmark idea', angle: 'Synthetic fixture',
      body: 'No customer or provider data.', visualDirection: 'Repeated tiny PNG', rationale: 'Measure local rendering.' });
    const set = app.store.createSet(project.id, { name: 'Synthetic benchmark set', mode: 'organic', conceptIds: [concept.id],
      brief: { goal: 'Measure rendering of actual imported synthetic images.' } });
    for (let index = 0; index < count; index++) {
      await assetService.import(project.id, { name: `Synthetic tiny PNG ${index + 1}`,
        source: 'Benchmark fixture only: repeated 1x1 PNG; no customer material',
        base64: png.toString('base64'), setId: set.id, conceptId: concept.id });
      if (project.id === primary.id && (index + 1) % 250 === 0) process.stderr.write(`Imported ${index + 1}/1000 synthetic primary assets.\n`);
    }
    const records = app.store.rows('assets', project.id);
    assert.equal(records.length, count); assert.equal(new Set(records.map(asset => asset.id)).size, count);
    for (const asset of records) assert.equal(hash(assetService.read(project.id, asset.id)), asset.artifactHash);
    project.assetIds = records.map(asset => asset.id).reverse();
  }
  const seedMs = round(performance.now() - seedStarted);
  {
    phase = 'browser open';
    const cliVersion = (await cli('--version')).trim(); assert.equal(cliVersion, '0.1.22');
    const opened = await cli('open', app.url, '--browser', 'chrome', '--json'); browserOpened = true;
    writeFileSync(path.join(runDirectory, 'open.json'), opened, { flag: 'wx' });
    writeFileSync(path.join(runDirectory, 'initial-snapshot.json'), await cli('snapshot', '--json'), { flag: 'wx' });
    const measured = { metrics: { primary: [], secondary: [] }, errors: [], paginationChecks: [] };
    for (let pair = 0; pair < WARMUP + SAMPLES; pair++) {
      phase = `browser pair ${pair + 1}/${WARMUP + SAMPLES}`;
      const fixture = { primary, secondary, primaryCount: PRIMARY_COUNT, secondaryCount: SECONDARY_COUNT,
        warmup: 0, samples: 1, pageSize: 50, captureScreenshots: pair === WARMUP + SAMPLES - 1,
        studioScreenshot: path.join(runDirectory, 'studio.png'), libraryScreenshot: path.join(runDirectory, 'library.png') };
      const measurementPath = path.join(runDirectory, `measure-${pair + 1}.js`);
      writeFileSync(measurementPath, `async (page) => (${browserMeasurement.toString()})(page, ${JSON.stringify(fixture)})`, { flag: 'wx' });
      const raw = await cli('run-code', '--filename', measurementPath, '--raw');
      writeFileSync(path.join(runDirectory, `pair-${pair + 1}.json`), raw, { flag: 'wx' });
      const batch = JSON.parse(raw);
      assert.ok(batch.metrics, 'CLI did not return the measured result.');
      if (pair >= WARMUP) for (const destination of ['primary', 'secondary']) measured.metrics[destination].push(...batch.metrics[destination]);
      measured.errors.push(...batch.errors); measured.browser = batch.browser; measured.finalProjectName = batch.finalProjectName;
      measured.paginationChecks.push(...batch.paginationChecks);
      process.stderr.write(`${phase} saved (${pair < WARMUP ? 'warmup' : 'measured'}): ${JSON.stringify(batch.metrics.primary[0])}\n`);
    }
    assert.deepEqual(measured.errors, []); assert.equal(providerCalls, 0);
    assert.equal(measured.finalProjectName, primary.name);
    const metrics = {};
    for (const destination of ['primary', 'secondary']) for (const field of ['switchMs', 'libraryMs', 'libraryDriverMs', 'switchAndLibraryMs', 'studioMs', 'studioDriverMs'])
      metrics[`${destination}.${field}`] = statistics(measured.metrics[destination], field);
    const finalSourceHashes = sourceHashes(), unchanged = JSON.stringify(initialSourceHashes) === JSON.stringify(finalSourceHashes);
    const report = { benchmark: 'NFR-07 / T-28 real browser rendering', recordedAt: new Date().toISOString(),
      hardware: { cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), platform: os.platform(), release: os.release(), architecture: os.arch() },
      runtime: { node: process.version, sharp: sharp.versions.sharp, sqlite: app.store.db.prepare('SELECT sqlite_version() AS version').get().version,
        playwrightCli: cliVersion, providerCalls, disabledRuntimeInspections: inspections }, browser: measured.browser,
      fixture: { projects: 2, primaryAssets: PRIMARY_COUNT, secondaryAssets: SECONDARY_COUNT, primarySetAssets: PRIMARY_COUNT,
        dimensions: '1x1', sourceBytes: png.length, sourceHash: hash(png), seedMs, creation: 'Every asset passed through AssetService.import and its persisted file hash was checked.',
        limitation: 'Repeated tiny synthetic PNGs measure metadata and DOM scale; realistic large image decode, memory pressure, and cold disk performance remain unmeasured.',
        cleanupEvidence: path.relative(repository, path.join(runDirectory, 'cleanup.json')) },
      method: { samples: SAMPLES, warmup: WARMUP, percentile: 'nearest rank',
        switchMs: 'Project button click capture event through matching project identity, 1000-or-1 asset total, active Ideas DOM, followed by two animation frames.',
        libraryMs: 'Images button click capture event through correct first-page asset identities, correct 1000-or-1 filtered total, decoded viewport-intersecting thumbnails and two animation frames.',
        libraryDriverMs: 'Includes navigation from Ideas to Knowledge/Images, scroll and browser-driver action overhead.',
        switchAndLibraryMs: 'Whole project switch plus library navigation and visible-thumbnail readiness.',
        studioMs: 'Creative sets button click capture event through correct first-page asset identities and total, scrolling first image into view, decoded visible thumbnails and two animation frames.',
        studioDriverMs: 'Same Studio operation including driver overhead before the click.',
        pagination: '50 images/page, newest first. Next, last and return-to-first page actions checked separately via the real UI, including exact asset identities.',
        comparison: 'Baseline rendered all 1000 cards on both surfaces. This run permits bounded active-view pagination while preserving the true 1000 total. Direct click-capture list timing differs from driver-inclusive baseline; no direct speedup ratio is claimed.',
        cache: 'Fresh browser context; reported samples are warm after three complete alternations. No provider calls or network mocking.' },
      metrics, samples: measured.metrics, paginationChecks: measured.paginationChecks,
      evidenceDirectory: path.relative(repository, runDirectory), sourceHashes: initialSourceHashes,
      sourceUnchangedDuringRun: unchanged, ...(unchanged ? {} : { finalSourceHashes }),
      acceptance: { targetP95Ms: 1000, browser: ['primary', 'secondary'].every(destination => ['switchMs', 'libraryMs', 'studioMs'].every(field => metrics[`${destination}.${field}`].p95Ms <= 1000)) ? 'PASS' : 'FAIL',
        gatedOperations: ['switchMs', 'libraryMs', 'studioMs'], diagnosticsOnly: ['switchAndLibraryMs', 'libraryDriverMs', 'studioDriverMs'],
        sourceStable: unchanged ? 'PASS' : 'FAIL', note: 'Synthetic browser result only; root acceptance must combine with backend evidence and preserve fixture limitations.' } };
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ reportPath, evidenceDirectory: runDirectory, metrics, acceptance: report.acceptance }, null, 2) + '\n');
    if (report.acceptance.browser !== 'PASS' || !unchanged) process.exitCode = 1;
  }
} catch (error) {
  writeFileSync(path.join(runDirectory, 'failure.json'), JSON.stringify({ status: 'EXECUTION_ERROR', phase, recordedAt: new Date().toISOString(),
    message: error.message, providerCalls, sourceHashes: initialSourceHashes, evidenceDirectory: runDirectory }, null, 2) + '\n', { flag: 'wx' });
  throw error;
} finally {
  let browserClosed = !browserOpened;
  if (browserOpened) await cli('close').then(() => { browserClosed = true; }).catch(error => { process.stderr.write(`Benchmark browser cleanup failed: ${error.message}\n`); process.exitCode = 1; });
  if (app) await app.close();
  const target = path.resolve(fixtureDirectory), boundary = path.resolve(benchmarkRoot) + path.sep;
  assert.ok(target.startsWith(boundary) && path.basename(target).startsWith('fixture-'));
  safeDataPath(benchmarkRoot, path.relative(benchmarkRoot, target));
  rmSync(target, { recursive: true, force: true });
  writeFileSync(path.join(runDirectory, 'cleanup.json'), JSON.stringify({ recordedAt: new Date().toISOString(),
    browserSession: session, browserClosed, serviceClosed: true, isolatedFixtureRemoved: !existsSync(target), providerCalls }, null, 2) + '\n', { flag: 'wx' });
}
