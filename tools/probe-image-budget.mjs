// Two-operation native image budget investigation. Both transports are local;
// invented ChatGPT credentials never authenticate with a real provider.
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexRuntime, runtimeArguments, toolFreeCatalog, disabledNativeSkills,
  SUBSCRIPTION_PROVIDER, RUNTIME_CONFIG_HASH } from '../src/runtime.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(repo, '.workbench/image-budget-probe');
await mkdir(root, { recursive: true });
const boundary = await realpath(root), directory = await mkdtemp(join(boundary, 'probe-'));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const token = 'third-draft-invented-chatgpt-access-token', account = 'third-draft-invented-account';
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const listen = server => new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const close = server => new Promise(accept => { server.closeAllConnections(); server.close(accept); });
const report = { checkedAt: new Date().toISOString(), scope: 'native-runtime-and-host-gate-loopback-only',
  approvedImageOperations: 2, intendedRealProviderCalls: 0, realCredentialsUsed: false,
  networkEvidence: 'Configured transport endpoints are loopback; no process-wide network trace.',
  productionAcceptance: false, limitations: ['No staged filesystem isolation proof in this diagnostic.',
    'No actual subscription billing or real generated image proof.',
    'Diagnostic JSON write-ahead receipts are not integrated with production SQLite run state.',
    'Cancellation cannot retract a request already received upstream.'], cases: [], outcome: 'INCONCLUSIVE' };

async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; check(size <= 2 * 1024 * 1024, 'Request byte limit exceeded.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function json(response, status, value) { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }
function sse(response, items, id) {
  const event = (type, value) => `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(event('response.created', { response: { id, status: 'in_progress', output: [] } }) +
    items.map((item, output_index) => event('response.output_item.done', { output_index, item })).join('') +
    event('response.completed', { response: { id, status: 'completed', output: items,
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }));
}

// Intentionally local-only prototype. Reservation occurs synchronously before
// any await or upstream dispatch; errors/cancellation never refund a slot.
async function budgetGate(upstream, { enabled = true, onImageDispatch = () => {}, receiptPath, actionId } = {}) {
  check(new URL(upstream).hostname === '127.0.0.1', 'Diagnostic upstream must be loopback.');
  // A single process-local counter is insufficient when two gates share an
  // Action. An exclusive lease also refuses stale owners after process loss.
  const leasePath = receiptPath && `${receiptPath}.lease`, leaseId = randomUUID();
  if (leasePath) {
    let descriptor;
    try { descriptor = openSync(leasePath, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Action lease already exists; active or uncertain owner.'); throw error; }
    try { writeFileSync(descriptor, JSON.stringify({ actionId, leaseId })); fsyncSync(descriptor); }
    finally { closeSync(descriptor); }
  }
  let consumed = 0, reopenedPending = false;
  const appendReceipt = record => {
    const descriptor = openSync(receiptPath, 'a');
    try { writeFileSync(descriptor, JSON.stringify(record) + '\n'); fsyncSync(descriptor); }
    finally { closeSync(descriptor); }
  };
  if (receiptPath) {
    if (existsSync(receiptPath)) {
      const content = readFileSync(receiptPath, 'utf8');
      check(content.endsWith('\n'), 'Incomplete budget receipt fails closed.');
      const records = content.trimEnd().split('\n').map(line => JSON.parse(line));
      check(records[0].actionId === actionId && records[0].limit === 2, 'Action budget identity changed.');
      for (const record of records.slice(1)) {
        check(record.actionId === actionId && record.ordinal === consumed + 1 && record.state === 'submitted_or_unknown', 'Invalid reservation receipt fails closed.');
        consumed++;
      }
      reopenedPending = consumed > 0;
    } else appendReceipt({ actionId, limit: 2 });
  }
  const prefix = `/gate/${randomUUID()}`, pending = new Set();
  const state = { reserved: consumed, reopenedPending, denied: 0, requests: 0, imageRequests: 0, upstreamDispatches: 0, redirectsBlocked: 0,
    maxConcurrentImages: 0, open: true, paths: [] };
  let inFlightImages = 0;
  const server = http.createServer(async (request, response) => {
    let outbound;
    try {
      check(state.open && ++state.requests <= 24, 'Action transport is closed or over request bound.');
      check(request.method === 'POST' && request.url.startsWith(prefix + '/'), 'Invalid gate method or capability.');
      const path = request.url.slice(prefix.length);
      check(['/responses', '/images/generations', '/images/edits'].includes(path), 'Native route is not allowlisted.');
      check(request.headers.authorization === `Bearer ${token}` && request.headers['chatgpt-account-id'] === account,
        'Isolated dummy native ChatGPT authentication missing.');
      const image = path.startsWith('/images/');
      const bytes = await body(request);
      check(state.open, 'Action gate closed while request was being received.');
      if (image) {
        state.imageRequests++;
        if (state.reopenedPending) { state.denied++; return json(response, 409, { error: { message: 'Prior action result unknown; automatic replay prohibited.' } }); }
        if (enabled && state.reserved >= 2) { state.denied++; return json(response, 403, { error: { message: 'Action image budget exhausted.' } }); }
        state.reserved++;
        if (receiptPath) appendReceipt({ actionId, ordinal: state.reserved, state: 'submitted_or_unknown' });
        inFlightImages++; state.maxConcurrentImages = Math.max(state.maxConcurrentImages, inFlightImages);
      }
      state.paths.push(path); state.upstreamDispatches++;
      outbound = http.request(new URL('/v1' + path, upstream), { method: 'POST', headers: {
        'content-type': 'application/json', 'content-length': bytes.length,
        authorization: request.headers.authorization, 'chatgpt-account-id': request.headers['chatgpt-account-id'],
        ...(request.headers['x-codex-image-turn-id'] ? { 'x-codex-image-turn-id': request.headers['x-codex-image-turn-id'] } : {}) } }, incoming => {
        if (incoming.statusCode >= 300 && incoming.statusCode < 400) {
          state.redirectsBlocked++; incoming.resume();
          return json(response, 502, { error: { message: 'Upstream redirect rejected; reservation retained.' } });
        }
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
        incoming.on('error', () => response.destroy());
      });
      pending.add(outbound);
      outbound.once('close', () => { pending.delete(outbound); if (image) inFlightImages--; });
      outbound.once('error', () => { if (!response.headersSent) json(response, 502, { error: { message: 'Upstream result unknown; reservation retained.' } }); else response.destroy(); });
      outbound.end(bytes);
      if (image) onImageDispatch();
    } catch (error) { state.failure = error.message; if (!response.headersSent) json(response, 403, { error: { message: 'Action transport rejected request.' } }); else response.destroy(); }
  });
  await listen(server);
  return { state, baseUrl: `http://127.0.0.1:${server.address().port}${prefix}`,
    async close() {
      if (!state.open) return;
      state.open = false; for (const request of pending) request.destroy(); await close(server);
      if (leasePath) {
        check(JSON.parse(readFileSync(leasePath, 'utf8')).leaseId === leaseId, 'Action lease owner changed; refuse lease removal.');
        unlinkSync(leasePath);
      }
    } };
}

try {
  const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
  await runtime.prepareProfile();
  const identity = await runtime.executableIdentity(); runtime.executable = identity.path;
  report.binarySha256 = identity.executableHash; report.version = (await runtime.command(['--version'])).stdout.trim();
  const catalog = toolFreeCatalog(JSON.parse((await runtime.command(['debug', 'models', '--bundled'], { maxOutputBytes: 8 * 1024 * 1024 })).stdout));
  const jwt = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  await writeFile(join(runtime.runtimeHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: null,
    tokens: { id_token: `${jwt({ alg: 'none' })}.${jwt({ exp: Math.floor(Date.now()/1000)+3600,
      'https://api.openai.com/auth': { chatgpt_account_id: account, chatgpt_plan_type: 'plus' } })}.synthetic`,
    access_token: token, refresh_token: 'invented-unused', account_id: account }, last_refresh: new Date().toISOString() }));
  const workspace = join(directory, 'work'); await mkdir(workspace);
  await writeFile(join(workspace, 'models.json'), JSON.stringify(catalog));
  await writeFile(join(workspace, 'schema.json'), JSON.stringify({ type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false }));
  await writeFile(join(workspace, 'reference.png'), Buffer.from(png, 'base64'));
  const disabledSkills = await disabledNativeSkills(runtime.environment);
  report.contractHash = hash(JSON.stringify({ baseContractHash: RUNTIME_CONFIG_HASH, imageGeneration: true,
    budget: 2, actionLease: 'exclusive-create; duplicate-or-stale-owner-refused', durableReservation: 'append-and-fsync-before-dispatch; reopen-pending-fails-closed', redirects: 'refused', nativeProvider: SUBSCRIPTION_PROVIDER, allUpstreams: 'loopback-only', scenarios: ['ungated-control', 'sequential', 'same-turn-batch', '503-retries', 'reset-retries', 'cancel-after-dispatch', 'concurrent-host-requests', 'duplicate-owner', 'durable-reopen', 'redirect'] }));
  for (const mode of ['ungated-control', 'sequential', 'same-turn-batch', '503-retries', 'reset-retries', 'cancel-after-dispatch', 'concurrent-host-requests', 'duplicate-owner', 'durable-reopen', 'redirect']) {
    let responses = 0, images = 0, verifiedAuth = true, upstreamFailure = null;
    const controller = new AbortController();
    const upstream = http.createServer(async (request, response) => {
      try {
        const value = JSON.parse(await body(request));
        verifiedAuth &&= request.headers.authorization === `Bearer ${token}` && request.headers['chatgpt-account-id'] === account;
        if (request.url.startsWith('/v1/images/')) {
          images++;
          if (mode === '503-retries') return json(response, 503, { error: { message: 'Synthetic retry failure.' } });
          if (mode === 'reset-retries') return response.destroy();
          if (mode === 'durable-reopen') return response.destroy();
          if (mode === 'redirect') { response.writeHead(307, { location: `http://127.0.0.1:${upstream.address().port}/bypass` }); return response.end(); }
          if (mode === 'cancel-after-dispatch') { controller.abort(); return; }
          if (mode === 'concurrent-host-requests') await new Promise(accept => setTimeout(accept, 60));
          return json(response, 200, { created: 1, background: 'opaque', data: [{ b64_json: png, generation_id: `synthetic-${images}` }] });
        }
        check(request.url === '/v1/responses' && ++responses <= 5, 'Unexpected fixture response request.');
        const imageCall = number => ({ type: 'function_call', id: `fc-${number}`, call_id: `image-${number}`, namespace: 'image_gen', name: 'imagegen', arguments: JSON.stringify({ prompt: 'Synthetic native budget probe.', ...(number === 2 ? { referenced_image_paths: [join(workspace, 'reference.png')] } : {}) }) });
        const calls = mode === 'same-turn-batch' ? (responses === 1 ? [1,2,3].map(imageCall) : []) : responses <= 3 ? [imageCall(responses)] : [];
        sse(response, calls.length ? calls : [{ type: 'message', id: 'final', role: 'assistant', content: [{ type: 'output_text', text: '{"message":"synthetic done"}' }] }], `response-${responses}`);
      } catch (error) { upstreamFailure = error.message; response.destroy(); }
    });
    await listen(upstream);
    const receiptPath = join(directory, `budget-${mode}.jsonl`), actionId = randomUUID();
    let gate = await budgetGate(`http://127.0.0.1:${upstream.address().port}`, { enabled: mode !== 'ungated-control', receiptPath, actionId });
    let exitCode = null, runtimeFailure = null, postCloseRejected = false, duplicateOwnerRefused = null;
    try {
      if (mode === 'durable-reopen') {
        const request = () => fetch(gate.baseUrl + '/images/generations', { method: 'POST', headers: {
          'content-type': 'application/json', authorization: `Bearer ${token}`, 'chatgpt-account-id': account }, body: '{"prompt":"synthetic"}' }).then(async response => { await response.text(); return response.status; });
        check(await request() === 502 && images === 1 && gate.state.reserved === 1, 'Ambiguous first dispatch was not charged.');
        await gate.close();
        gate = await budgetGate(`http://127.0.0.1:${upstream.address().port}`, { receiptPath, actionId });
        check(await request() === 409 && images === 1 && gate.state.reserved === 1 && gate.state.reopenedPending, 'Reopen refunded or replayed an uncertain dispatch.');
      } else if (['concurrent-host-requests', 'duplicate-owner'].includes(mode)) {
        if (mode === 'duplicate-owner') {
          try { await budgetGate(`http://127.0.0.1:${upstream.address().port}`, { receiptPath, actionId }); duplicateOwnerRefused = false; }
          catch (error) { duplicateOwnerRefused = error.message.includes('Action lease already exists'); }
          check(duplicateOwnerRefused && images === 0, 'A second owner acquired the same action before dispatch.');
        }
        const codes = await Promise.all(Array.from({ length: 6 }, () => fetch(gate.baseUrl + '/images/generations', { method: 'POST', headers: {
          'content-type': 'application/json', authorization: `Bearer ${token}`, 'chatgpt-account-id': account }, body: '{"prompt":"synthetic"}' }).then(async response => { await response.text(); return response.status; })));
        check(codes.filter(code => code === 200).length === 2 && codes.filter(code => code === 403).length === 4, 'Concurrent gate reservations failed.');
      } else {
        const args = runtimeArguments(workspace, { 'skills.config': disabledSkills, 'features.image_generation': true,
          'model_providers.third_draft_subscription': { ...SUBSCRIPTION_PROVIDER, base_url: gate.baseUrl,
            request_max_retries: ['503-retries', 'reset-retries'].includes(mode) ? 2 : 0 } });
        try { exitCode = (await runtime.command(args, { input: 'Explicit synthetic Production Action: at most two image operations.', cwd: workspace,
          signal: controller.signal, timeoutMs: 20_000, maxOutputBytes: 2 * 1024 * 1024 })).code; }
        catch (error) { runtimeFailure = error.code || error.name; }
      }
    } finally {
      await gate.close();
      try { await fetch(gate.baseUrl + '/images/generations', { method: 'POST', body: '{}' }); } catch { postCloseRejected = true; }
      await close(upstream);
    }
    const result = { mode, upstreamImageRequests: images, responses, gate: gate.state, exitCode, runtimeFailure,
      verifiedDummyNativeAuth: verifiedAuth, postCloseRejected, duplicateOwnerRefused, upstreamFailure };
    report.cases.push(result);
    check(!upstreamFailure && verifiedAuth && postCloseRejected, `${mode} fixture or gate-close contract failed.`);
    if (mode === 'ungated-control') check(images === 3, 'Ungated control did not attempt three images.');
    else if (mode === 'cancel-after-dispatch') check(images === 1 && runtimeFailure === 'result_unknown', 'Cancellation truthfulness failed.');
    else if (mode === 'durable-reopen') check(images === 1 && gate.state.reopenedPending && gate.state.denied === 1, 'Durable pending action was replayed.');
    else check(images === 2 && gate.state.denied >= 1, `${mode} did not enforce or exercise the two-dispatch boundary.`);
    if (mode === 'redirect') check(gate.state.redirectsBlocked === 2, 'Native client was allowed to follow a redirect around the budget gate.');
  }
  report.outcome = 'LOCAL_BUDGET_GATE_DEMONSTRATED';
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  const target = await realpath(directory);
  check(target.startsWith(boundary + sep) && target.slice((boundary + sep).length).startsWith('probe-'), 'Refusing cleanup outside probe directory.');
  await rm(target, { recursive: true, force: true });
}
const bytes = JSON.stringify(report, null, 2) + '\n';
const filename = join(boundary, `result-${report.checkedAt.replaceAll(':','-').replaceAll('.','-')}-${randomUUID()}.json`);
await writeFile(filename, bytes, { flag: 'wx' });
console.log(JSON.stringify({ reportPath: filename, reportSha256: hash(bytes), outcome: report.outcome,
  version: report.version, cases: report.cases.map(({ mode, upstreamImageRequests, runtimeFailure }) => ({ mode, upstreamImageRequests, runtimeFailure })), failure: report.failure }));
