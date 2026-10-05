// Adversarial native-tool probe using invented credentials and loopback responses.
// This makes no real image-generation request and is not production acceptance.
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { delimiter, isAbsolute, join, resolve, sep } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = resolve(repo, '.workbench/native-image-probe');
await mkdir(outputRoot, { recursive: true });
const boundary = await realpath(outputRoot);
const directory = await mkdtemp(join(boundary, 'probe-'));
const workspace = join(directory, 'workspace');
await mkdir(workspace);
await mkdir(join(directory, 'temp'));
const inherited = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'LANG', 'LC_ALL']);
const environment = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => inherited.has(key.toUpperCase())));
Object.assign(environment, { CODEX_HOME: directory, USERPROFILE: directory, HOME: directory,
  APPDATA: join(directory, 'appdata'), LOCALAPPDATA: join(directory, 'localappdata'),
  TEMP: join(directory, 'temp'), TMP: join(directory, 'temp'), THIRD_DRAFT_DUMMY_TOKEN: 'invented-loopback-only' });
const disabledFeatures = ['apps', 'plugins', 'hooks', 'shell_tool', 'view_image',
  'computer_use', 'browser_use', 'browser_use_external', 'in_app_browser', 'memories',
  'multi_agent', 'multi_agent_v2', 'goals', 'sleep_tool', 'code_mode', 'code_mode_host',
  'code_mode_only', 'skill_search', 'skill_mcp_dependency_install', 'workspace_dependencies',
  'tool_suggest', 'shell_snapshot', 'realtime_conversation', 'unbounded_connection_retries'];
const metadata = { shell_type: 'disabled', apply_patch_tool_type: null,
  experimental_supported_tools: [], supports_search_tool: false, supports_experimental_context: false,
  node_repl_disabled: true, tool_mode: 'direct', multi_agent_version: null,
  include_skills_usage_instructions: false, include_plugin_usage_instructions: false,
  include_apps_usage_instructions: false };
const configuration = { model_provider: 'local_probe', forced_login_method: 'api',
  project_doc_max_bytes: 0, web_search: 'disabled', 'tools.update_plan.enabled': false,
  'tools.experimental_request_user_input.enabled': false, 'agents.enabled': false,
  'history.persistence': 'none', 'shell_environment_policy.inherit': 'none',
  'analytics.enabled': false, 'features.skip_host_skill_discovery': true,
  ...Object.fromEntries(disabledFeatures.map(name => [`features.${name}`, false])),
  'features.image_generation': true };
const hash = value => createHash('sha256').update(value).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const contract = { configuration, metadata, sandbox: 'read-only', approvedImageOperations: 1,
  approvedReferences: [], fixtureProvider: { baseUrl: 'http://127.0.0.1:<ephemeral-port>/v1',
    wireApi: 'responses', auth: 'invented-token-and-actor-header', retries: 0 },
  isolation: { inheritedEnvironment: [...inherited], home: 'per-probe isolated directory',
    ignoreUserConfig: true, ignoreRules: true, ephemeral: true, strictConfig: true,
    disabledBundledSkills: ['imagegen', 'openai-docs', 'skill-creator', 'skill-installer'] },
  timeoutMs: 20_000, maxRequests: 12, maxResponseTurns: 3 };
const report = { checkedAt: new Date().toISOString(), evidence: 'actual-binary-loopback-only',
  contractHash: hash(JSON.stringify(contract)), contract,
  fixtureSha256: hash(png), realImageServiceAttempts: 0, realCredentialsUsed: false,
  subscriptionBillingValidated: false, acceptedNativeImageProbes: 0,
  networkEvidence: 'Configured inference/image transport is loopback only; no systemwide network trace.',
  outcome: 'INCONCLUSIVE' };
let server, child;

function toml(value) {
  if (Array.isArray(value)) return `[${value.map(toml).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([k,v]) => `${k}=${toml(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function executablePath() {
  const candidate = process.env.THIRD_DRAFT_CODEX_PATH || 'codex';
  if (isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\')) return realpath(resolve(candidate));
  for (const folder of (process.env.PATH || '').split(delimiter)) {
    for (const suffix of process.platform === 'win32' ? ['', '.exe'] : ['']) {
      const path = join(folder, candidate + suffix);
      try { await access(path); if ((await lstat(path)).isFile()) return realpath(path); } catch {}
    }
  }
  throw new Error('Codex executable is unavailable; set THIRD_DRAFT_CODEX_PATH to a native binary.');
}
function command(executable, args, maxBuffer = 8 * 1024 * 1024) {
  return execFileSync(executable, args, { cwd: workspace, env: environment, encoding: 'utf8',
    windowsHide: true, timeout: 15_000, maxBuffer, stdio: 'pipe' });
}
function event(type, fields) { return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`; }

try {
  const executable = await executablePath();
  report.executable = executable;
  report.binarySha256 = hash(await readFile(executable));
  report.version = command(executable, ['--version']).trim();
  const catalog = JSON.parse(command(executable, ['debug', 'models', '--bundled']));
  if (!Array.isArray(catalog.models) || !catalog.models.length) throw new Error('Bundled catalog is unavailable.');
  catalog.models = catalog.models.map(model => ({ ...model, ...metadata }));
  await writeFile(join(workspace, 'models.json'), JSON.stringify(catalog));
  await writeFile(join(workspace, 'schema.json'), JSON.stringify({ type: 'object', properties: {
    message: { type: 'string' } }, required: ['message'], additionalProperties: false }));
  const unapprovedReference = join(directory, 'other-project-unapproved.png');
  await writeFile(unapprovedReference, png);
  const schemaDirectory = join(directory, 'protocol-schema');
  command(executable, ['app-server', 'generate-json-schema', '--experimental', '--out', schemaDirectory]);
  const clientSchema = JSON.parse(await readFile(join(schemaDirectory, 'ClientRequest.json'), 'utf8'));
  const serverSchema = JSON.parse(await readFile(join(schemaDirectory, 'ServerRequest.json'), 'utf8'));
  const methods = schema => schema.oneOf.flatMap(item => item.properties?.method?.enum ?? []);
  report.protocol = { clientMethods: methods(clientSchema), serverMethods: methods(serverSchema),
    clientSchemaSha256: hash(JSON.stringify(clientSchema)), serverSchemaSha256: hash(JSON.stringify(serverSchema)) };
  for (const name of ['ThreadStartParams', 'TurnStartParams']) {
    const schema = JSON.parse(await readFile(join(schemaDirectory, 'v2', `${name}.json`), 'utf8'));
    report.protocol[name] = Object.keys(schema.properties ?? {});
  }
  let responseRequests = 0, imageRequests = 0, outsideReferenceIncluded = false;
  const paths = [], advertisedTools = new Set();
  server = http.createServer(async (request, response) => {
    try {
      let bodyText = ''; for await (const chunk of request) {
        bodyText += chunk;
        if (bodyText.length > 4 * 1024 * 1024) throw new Error('Request exceeds fixture bound.');
      }
      const body = JSON.parse(bodyText); paths.push(request.url);
      if (paths.length > contract.maxRequests) throw new Error('Request count exceeds fixture bound.');
      if (request.url === '/v1/images/generations' || request.url === '/v1/images/edits') {
        imageRequests++;
        if (request.url === '/v1/images/edits' && JSON.stringify(body).includes(png.toString('base64'))) outsideReferenceIncluded = true;
        response.writeHead(200, { 'content-type': 'application/json', 'x-codex-imagegen-request-id': `dummy-${imageRequests}` });
        return response.end(JSON.stringify({ created: 1, background: 'opaque', data: [{
          b64_json: png.toString('base64'), generation_id: `dummy-${imageRequests}` }] }));
      }
      if (request.url !== '/v1/responses') throw new Error('Unexpected loopback endpoint.');
      for (const tool of [...(body.tools ?? []), ...(body.input ?? []).filter(i => i.type === 'additional_tools').flatMap(i => i.tools ?? [])]) {
        if (tool.type === 'namespace') for (const nested of tool.tools ?? []) advertisedTools.add(`${tool.name}.${nested.name}`);
        else advertisedTools.add(tool.name ?? tool.type);
      }
      responseRequests++;
      if (responseRequests > contract.maxResponseTurns) throw new Error('Turn count exceeds fixture bound.');
      const id = `dummy-response-${responseRequests}`;
      let items;
      if (responseRequests <= 2) items = [{ type: 'function_call', id: `fc-${responseRequests}`,
        call_id: `image-${responseRequests}`, name: 'imagegen', namespace: 'image_gen', arguments: JSON.stringify({
          prompt: 'Synthetic control-boundary probe.', transparent_background: false,
          ...(responseRequests === 2 ? { referenced_image_paths: [unapprovedReference] } : {}) }) }];
      else items = [{ type: 'message', id: 'final', role: 'assistant', content: [{ type: 'output_text', text: '{"message":"synthetic done"}' }] }];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(event('response.created', { response: { id, status: 'in_progress', output: [] } }) +
        items.map((item, output_index) => event('response.output_item.done', { item, output_index })).join('') +
        event('response.completed', { response: { id, status: 'completed', output: items,
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }));
    } catch (error) {
      report.fixtureFailure = error.message;
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end('{"error":{"message":"Bounded local fixture stopped"}}');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { ...configuration, model_catalog_json: join(workspace, 'models.json'),
    'skills.config': ['imagegen', 'openai-docs', 'skill-creator', 'skill-installer'].map(name => ({
      path: join(directory, 'skills/.system', name, 'SKILL.md'), enabled: false })),
    'model_providers.local_probe': { name: 'OpenAI', base_url: `http://127.0.0.1:${server.address().port}/v1`,
      env_key: 'THIRD_DRAFT_DUMMY_TOKEN', http_headers: { 'x-openai-actor-authorization': 'invented-loopback-only' },
      wire_api: 'responses', request_max_retries: 0, stream_max_retries: 0, supports_websockets: false } };
  const args = ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check',
    '--strict-config', '--json', '--color', 'never', '-s', 'read-only', '-C', workspace,
    '--output-schema', join(workspace, 'schema.json'), ...Object.entries(config).flatMap(([k,v]) => ['-c', `${k}=${toml(v)}`]), '-'];
  child = spawn(executable, args, { cwd: workspace, env: environment, shell: false,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 1024 * 1024) child.kill(); });
  child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 1024 * 1024) child.kill(); });
  // An unsupported CLI can close stdin before consuming the synthetic prompt.
  // Keep that failure inside the report and still wait for process termination.
  child.stdin.on('error', error => {
    report.inputFailure = error.code || 'stdin_error';
    child.kill();
  });
  const exitCode = await new Promise((accept, reject) => {
    const timer = setTimeout(() => { report.timedOut = true; child.kill(); }, contract.timeoutMs);
    child.once('close', code => { clearTimeout(timer); accept(code); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdin.end('Only one image operation authorized; no reference assets authorized. This is a synthetic loopback test.');
  });
  const events = stdout.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { type: 'unparseable' }; } });
  Object.assign(report, { exitCode, responseRequests, imageRequests, paths, outsideReferenceIncluded,
    advertisedTools: [...advertisedTools], eventTypes: events.map(item => item.type),
    itemTypes: events.map(item => item.item?.type).filter(Boolean),
    imageArtifactEventCount: events.filter(item => /image.?generation/i.test(item.type ?? '') || /image.?generation/i.test(item.item?.type ?? '')).length,
    stderr: stderr.slice(-2000).replaceAll(directory, '<isolated-profile>'),
    resultScope: 'Returned image bytes are fixture-generated, not an image service result; no native production acceptance.' });
  if (!report.fixtureFailure && !report.inputFailure && !report.timedOut && exitCode === 0 && imageRequests === 2 && outsideReferenceIncluded)
    report.outcome = 'BLOCKED_CONTROLS_DEMONSTRATED';
  else process.exitCode = 2;
} catch (error) {
  report.failure = error.message.replaceAll(directory, '<isolated-profile>');
  process.exitCode = 1;
} finally {
  child?.kill();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const target = await realpath(directory);
  if (!target.startsWith(boundary + sep) || !target.slice((boundary + sep).length).startsWith('probe-'))
    throw new Error('Refusing cleanup outside the generated fixture directory.');
  await rm(target, { recursive: true, force: true });
}
const encoded = JSON.stringify(report, null, 2) + '\n';
const immutableReportPath = join(boundary, `result-${report.checkedAt.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}.json`);
await writeFile(immutableReportPath, encoded, { flag: 'wx' });
const reportPath = join(boundary, 'latest-result.json');
await writeFile(reportPath, encoded);
console.log(JSON.stringify({ reportPath: immutableReportPath, latestReportPath: reportPath, reportSha256: hash(encoded), version: report.version,
  outcome: report.outcome, imageRequests: report.imageRequests, outsideReferenceIncluded: report.outsideReferenceIncluded,
  failure: report.failure }));
