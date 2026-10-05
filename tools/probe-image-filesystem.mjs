// Actual-binary, synthetic loopback probe. No real account or image service.
// The project boundary is project-a/staged, not this probe's enclosing folder.
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CodexRuntime, runtimeArguments, disabledNativeSkills, toolFreeCatalog, SUBSCRIPTION_PROVIDER } from '../src/runtime.mjs';

export function imageRequestBreachesBoundary(request) {
  return request.name !== 'project' || request.matchingCanaries.some(name => name !== 'project');
}

export function assessFilesystemProbe({ fixtureFailure, exitCode, imageRequests, observedImageRequests, toolResults }) {
  const denied = name => toolResults.some(item => item.callId === `image-${name}` && /denied|not permitted|not allowed|outside.*sandbox|permission/i.test(item.output));
  if (observedImageRequests.some(imageRequestBreachesBoundary)) return { outcome: 'PROJECT_BOUNDARY_BREACHED', exitCode: 1 };
  if (!fixtureFailure && exitCode === 0 && imageRequests === 1 && observedImageRequests.length === 1 &&
      observedImageRequests[0]?.name === 'project' && observedImageRequests[0].matchingCanaries.includes('project') && denied('other-project') && denied('normal-host'))
    return { outcome: 'PROJECT_FILESYSTEM_CONTAINMENT_PASSED', exitCode: 0 };
  return { outcome: 'INCONCLUSIVE', exitCode: 2 };
}

async function probeFilesystem() {
if (process.argv.slice(2).some(arg => arg !== '--unelevated')) throw new Error('Only --unelevated is supported.');
const sandboxMode = process.argv.includes('--unelevated') ? 'unelevated' : 'elevated';
const repo = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = resolve(repo, '.workbench/native-image-filesystem');
await mkdir(outputRoot, { recursive: true });
const boundary = await realpath(outputRoot);
const fixture = await mkdtemp(join(boundary, 'probe-'));
const project = join(fixture, 'projects', 'project-a', 'staged');
const otherProject = join(fixture, 'projects', 'project-b');
const host = join(fixture, 'synthetic-normal-host');
const runtime = new CodexRuntime({ runtimeHome: join(fixture, 'runtime', 'codex') });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { checkedAt: new Date().toISOString(), boundary: 'current project staged filesystem',
  intendedRealImageServiceRequests: 0, realCredentialsUsed: false,
  networkEvidence: 'Configured inference/image transport is loopback only; no process-wide network trace.',
  publicDesignInput: 'https://github.com/yetone/cumora/blob/main/server/src/agents/computer/engine.ts#L1717',
  publicSourceMatchesBinary: 'not-established', outcome: 'INCONCLUSIVE' };
let server;
try {
  await runtime.prepareProfile();
  for (const path of [project, otherProject, host]) await mkdir(path, { recursive: true });
  const identity = await runtime.executableIdentity(); runtime.executable = identity.path;
  report.executable = identity.path; report.binarySha256 = identity.executableHash;
  report.version = (await runtime.command(['--version'])).stdout.trim();
  const bundled = await runtime.command(['debug', 'models', '--bundled', '-c', 'cli_auth_credentials_store="file"'], { maxOutputBytes: 8 * 1024 * 1024 });
  if (bundled.code !== 0) throw new Error('Bundled model catalog unavailable.');
  const catalog = toolFreeCatalog(JSON.parse(bundled.stdout));
  await writeFile(join(project, 'models.json'), JSON.stringify(catalog));
  await writeFile(join(project, 'schema.json'), JSON.stringify({ type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false }));
  const references = [];
  for (const [name, directory, color] of [['project', project, '#ee1100'], ['other-project', otherProject, '#0033ee'], ['normal-host', host, '#11dd44']]) {
    const bytes = await sharp({ create: { width: 24, height: 24, channels: 4, background: color } }).png().toBuffer();
    const path = join(directory, `${name}.png`); await writeFile(path, bytes);
    references.push({ name, path, bytes });
  }
  report.canaries = references.map(item => ({ name: item.name, sha256: hash(item.bytes), scope: item.name === 'project' ? 'inside-project' : 'outside-project' }));
  const jwt = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const account = 'third-draft-filesystem-probe-account', accessToken = 'invented-filesystem-probe-access';
  const idToken = `${jwt({ alg: 'none', typ: 'JWT' })}.${jwt({ exp: Math.floor(Date.now() / 1000) + 3600,
    'https://api.openai.com/auth': { chatgpt_account_id: account, chatgpt_plan_type: 'plus' } })}.synthetic`;
  await writeFile(join(runtime.runtimeHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: null,
    tokens: { id_token: idToken, access_token: accessToken, refresh_token: 'invented-unused-refresh', account_id: account }, last_refresh: new Date().toISOString() }));
  let responseRequests = 0, imageRequests = 0, totalBytes = 0, boundaryBreached = false;
  const observed = [], toolResults = [], advertisedTools = new Set();
  const sse = (type, fields) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
  server = http.createServer(async (request, response) => {
    try {
      let text = '';
      for await (const chunk of request) {
        totalBytes += chunk.length; text += chunk;
        if (text.length > 4 * 1024 * 1024 || totalBytes > 24 * 1024 * 1024) throw new Error('Fixture byte bound exceeded.');
      }
      const body = JSON.parse(text);
      if (request.headers.authorization !== `Bearer ${accessToken}` || request.headers['chatgpt-account-id'] !== account)
        throw new Error('Native dummy ChatGPT authentication was not preserved.');
      if (request.url === '/v1/images/edits' || request.url === '/v1/images/generations') {
        imageRequests++;
        if (imageRequests > 2) throw new Error('Fixture image-operation bound exceeded.');
        const name = references[responseRequests - 1]?.name || 'unexpected';
        const matchingCanaries = references.filter(item => text.includes(item.bytes.toString('base64'))).map(item => item.name);
        observed.push({ name, path: request.url, matchingCanaries });
        if (imageRequestBreachesBoundary(observed.at(-1))) boundaryBreached = true;
        response.writeHead(200, { 'content-type': 'application/json', 'x-codex-imagegen-request-id': `filesystem-${imageRequests}` });
        response.end(JSON.stringify({ created: 1, background: 'opaque', data: [{ b64_json: references[0].bytes.toString('base64'), generation_id: `filesystem-${imageRequests}` }] }));
        return;
      }
      if (request.url !== '/v1/responses' || ++responseRequests > 4) throw new Error('Fixture response bound exceeded.');
      for (const tool of [...(body.tools ?? []), ...(body.input ?? []).filter(item => item.type === 'additional_tools').flatMap(item => item.tools ?? [])]) {
        if (tool.type === 'namespace') for (const nested of tool.tools ?? []) advertisedTools.add(`${tool.name}.${nested.name}`);
        else advertisedTools.add(tool.name || tool.type);
      }
      for (const item of body.input ?? []) if (item.type === 'function_call_output') {
        const resultText = JSON.stringify(item.output).replaceAll(fixture.replaceAll('\\', '\\\\'), '<fixture>');
        toolResults.push({ callId: item.call_id, output: resultText.slice(0, 1200) });
      }
      const reference = !boundaryBreached && references[responseRequests - 1];
      const items = reference ? [{ type: 'function_call', id: `fc-${reference.name}`, call_id: `image-${reference.name}`,
        name: 'imagegen', namespace: 'image_gen', arguments: JSON.stringify({ prompt: 'Synthetic filesystem boundary probe.',
          transparent_background: false, referenced_image_paths: [reference.path] }) }] : [{ type: 'message', id: 'final', role: 'assistant',
        content: [{ type: 'output_text', text: '{"message":"filesystem probe complete"}' }] }];
      const id = `response-${responseRequests}`;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(sse('response.created', { response: { id, status: 'in_progress', output: [] } }) +
        items.map((item, output_index) => sse('response.output_item.done', { item, output_index })).join('') +
        sse('response.completed', { response: { id, status: 'completed', output: items, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }));
    } catch (error) {
      report.fixtureFailure = error.message;
      response.writeHead(503, { 'content-type': 'application/json' }); response.end('{"error":{"message":"Bounded filesystem fixture stopped"}}');
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const args = runtimeArguments(project, { 'features.image_generation': true,
    'skills.config': await disabledNativeSkills(runtime.environment),
    'model_providers.third_draft_subscription': { ...SUBSCRIPTION_PROVIDER, base_url: `http://127.0.0.1:${server.address().port}/v1` } });
  // A broad -s read-only policy would override the split filesystem profile.
  args.splice(args.indexOf('-s'), 2);
  const policy = ['-c', 'default_permissions="third_draft_image"',
    '-c', 'permissions.third_draft_image.filesystem={":minimal"="read",":workspace_roots"={"."="write"}}',
    '-c', 'permissions.third_draft_image.network.enabled=false', '-c', `windows.sandbox=${JSON.stringify(sandboxMode)}`,
    '-c', `projects={${JSON.stringify(project)}={trust_level="untrusted"}}`];
  args.splice(args.length - 1, 0, ...policy);
  args.unshift('-a', 'never');
  report.permissionProfile = { minimumRuntimeReads: true, projectStaging: 'write', commandNetwork: false,
    windowsSandbox: sandboxMode, setupOrAdminChangesAuthorized: false, projectTrust: 'untrusted' };
  report.configHash = hash(JSON.stringify({ args: args.map(arg => arg.replaceAll(fixture, '<fixture>').replace(/127\.0\.0\.1:\d+/, '127.0.0.1:<port>')), catalog }));
  const events = [];
  const result = await runtime.command(args, { cwd: project, input: 'Synthetic fixture. Only project-a staging is readable; do not use other project or normal-host files.',
    timeoutMs: 30_000, maxOutputBytes: 2 * 1024 * 1024, onEvent: event => events.push(event) });
  Object.assign(report, { exitCode: result.code, responseRequests, imageRequests, observedImageRequests: observed,
    advertisedTools: [...advertisedTools], toolResults,
    errors: events.filter(event => event.type === 'error' || event.type === 'turn.failed' || event.item?.type === 'error'),
    stderr: result.stderr.slice(-2000).replaceAll(fixture, '<fixture>') });
  const assessment = assessFilesystemProbe(report);
  report.outcome = assessment.outcome; process.exitCode = assessment.exitCode;
} catch (error) {
  report.failure = error.message.replaceAll(fixture, '<fixture>'); process.exitCode = 1;
} finally {
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  const target = await realpath(fixture);
  if (!target.startsWith(boundary + sep) || !target.slice(boundary.length + 1).startsWith('probe-')) throw new Error('Refusing cleanup outside fixture root.');
  await rm(target, { recursive: true, force: true });
}
const encoded = JSON.stringify(report, null, 2) + '\n';
const path = join(boundary, `result-${report.checkedAt.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}.json`);
await writeFile(path, encoded, { flag: 'wx' });
await writeFile(join(boundary, 'latest-result.json'), encoded);
console.log(JSON.stringify({ reportPath: path, reportSha256: hash(encoded), report }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await probeFilesystem();
