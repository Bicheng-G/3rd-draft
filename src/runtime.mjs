import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, lstat, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

// Isolation was verified against this binary using a loopback transport with dummy
// credentials. A runtime upgrade must repeat that test before widening this pin.
export const SUPPORTED_CODEX_VERSION = '0.159.0-alpha.12.1';
export const VISION_INPUT_LIMITS = Object.freeze({ maxImages: 8,
  maxImageBytes: 10 * 1024 * 1024, maxTotalBytes: 40 * 1024 * 1024 });
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DISABLED_FEATURES = ['apps', 'plugins', 'hooks', 'shell_tool', 'view_image',
  'image_generation', 'computer_use', 'browser_use', 'browser_use_external',
  'in_app_browser', 'memories', 'multi_agent', 'multi_agent_v2', 'goals',
  'sleep_tool', 'code_mode', 'code_mode_host', 'code_mode_only', 'skill_search',
  'skill_mcp_dependency_install', 'workspace_dependencies', 'tool_suggest',
  'shell_snapshot', 'realtime_conversation', 'unbounded_connection_retries'];
const CONFIG = Object.freeze({
  model_provider: 'third_draft_subscription', forced_login_method: 'chatgpt', project_doc_max_bytes: 0,
  // Built-in provider IDs cannot be overridden in the pinned CLI. This process-
  // local alias uses native OpenAI authentication and pins the subscription URL.
  // No API-key source or api.openai.com endpoint exists in this configuration.
  'model_providers.third_draft_subscription': {
    name: 'OpenAI', base_url: 'https://chatgpt.com/backend-api/codex',
    wire_api: 'responses', requires_openai_auth: true,
    request_max_retries: 0, stream_max_retries: 0, supports_websockets: false,
  },
  web_search: 'disabled', 'tools.update_plan.enabled': false,
  'tools.experimental_request_user_input.enabled': false, 'agents.enabled': false,
  'history.persistence': 'none', 'shell_environment_policy.inherit': 'none',
  'features.skip_host_skill_discovery': true,
  ...Object.fromEntries(DISABLED_FEATURES.map(name => [`features.${name}`, false])),
});
const TOOL_METADATA = Object.freeze({ shell_type: 'disabled', apply_patch_tool_type: null,
  experimental_supported_tools: [], supports_search_tool: false,
  supports_experimental_context: false, node_repl_disabled: true, tool_mode: 'direct',
  multi_agent_version: null, include_skills_usage_instructions: false,
  include_plugin_usage_instructions: false, include_apps_usage_instructions: false });
export const RUNTIME_CONFIG_HASH = createHash('sha256')
  .update(JSON.stringify({ version: SUPPORTED_CODEX_VERSION, config: CONFIG,
    toolMetadata: TOOL_METADATA, visionInputLimits: VISION_INPUT_LIMITS }))
  .digest('hex');

export class RuntimeError extends Error {
  constructor(code, message) { super(message); this.name = 'RuntimeError'; this.code = code; }
}

function visionImages(images) {
  if (!Array.isArray(images) || images.length > VISION_INPUT_LIMITS.maxImages)
    throw new RuntimeError('invalid_input', 'Vision input requires at most 8 PNG buffers.');
  let totalBytes = 0;
  for (const bytes of images) {
    // Asset ingestion owns full image decoding/normalization. This transport
    // boundary accepts bytes only, never a caller-controlled host file path.
    if (!Buffer.isBuffer(bytes) || bytes.length < 33 ||
        !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
        bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' ||
        bytes.readUInt32BE(16) === 0 || bytes.readUInt32BE(20) === 0)
      throw new RuntimeError('invalid_input', 'Vision input must contain normalized PNG buffers.');
    totalBytes += bytes.length;
    if (bytes.length > VISION_INPUT_LIMITS.maxImageBytes || totalBytes > VISION_INPUT_LIMITS.maxTotalBytes)
      throw new RuntimeError('invalid_input', 'Vision input exceeds the 10 MiB per image or 40 MiB total limit.');
  }
  // Snapshot caller-owned buffers before awaiting inspection or filesystem I/O.
  return images.map(bytes => Buffer.from(bytes));
}

// Allowlist, rather than a denylist: no API key, endpoint override, provider token,
// proxy credential, inherited agent session, or plugin environment reaches Codex.
export function runtimeEnvironment(source = process.env) {
  const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME',
    'LANG', 'LC_ALL']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
}

export async function assertNativeInstructionIsolation(environment = process.env) {
  const nativeHome = environment.CODEX_HOME || join(environment.USERPROFILE || environment.HOME || homedir(), '.codex');
  // --ignore-user-config does NOT suppress global AGENTS files in this CLI.
  // There is no supported override. Refuse an unsafe profile without reading,
  // copying, rewriting, or deleting the user's instructions or credentials.
  for (const name of ['AGENTS.md', 'AGENTS.override.md']) {
    let info;
    try { info = await lstat(join(nativeHome, name)); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new RuntimeError('unsupported_capability', 'Cannot verify that global Codex instructions are absent.');
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > 0)
      throw new RuntimeError('unsupported_capability', 'This Codex profile has global AGENTS instructions. The isolated creative runtime requires an empty or absent global instruction file.');
  }
}

export async function disabledNativeSkills(environment = process.env) {
  const userHome = environment.USERPROFILE || environment.HOME || homedir();
  const nativeHome = environment.CODEX_HOME || join(userHome, '.codex');
  // The pinned CLI may install its bundled skills on first launch, after this
  // scan. Include these verified built-ins even when their files do not yet exist.
  const disabled = ['imagegen', 'openai-docs', 'skill-creator', 'skill-installer']
    .map(name => ({ path: join(nativeHome, 'skills', '.system', name, 'SKILL.md'), enabled: false }));
  let scanned = 0;
  async function scan(directory) {
    if (++scanned > 1500) throw new RuntimeError('unsupported_capability', 'Native skill discovery exceeds the isolation limit.');
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      throw new RuntimeError('unsupported_capability', 'Cannot verify native skill isolation.');
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new RuntimeError('unsupported_capability', 'Linked native skills cannot be isolated by this runtime version.');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') disabled.push({ path, enabled: false });
    }
  }
  await scan(join(nativeHome, 'skills'));
  await scan(join(userHome, '.agents', 'skills'));
  return [...new Map(disabled.map(entry => [entry.path, entry])).values()]
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function toolFreeCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0)
    throw new RuntimeError('unsupported_capability', 'Codex bundled model catalog is invalid.');
  return { ...catalog, models: catalog.models.map(model => {
    if (typeof model.slug !== 'string') throw new RuntimeError('unsupported_capability', 'Codex model identity is missing.');
    return { ...model, ...TOOL_METADATA };
  }) };
}

function toml(value) {
  if (Array.isArray(value)) return `[${value.map(toml).join(',')}]`;
  if (value && typeof value === 'object' && !Array.isArray(value))
    return `{${Object.entries(value).map(([key, item]) => `${key}=${toml(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function runtimeArguments(directory, overrides = {}) {
  const config = { ...CONFIG, model_catalog_json: join(directory, 'models.json'), ...overrides };
  return ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral',
    '--skip-git-repo-check', '--strict-config', '--json', '--color', 'never',
    '-s', 'read-only', '-C', directory, '--output-schema', join(directory, 'schema.json'),
    ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]), '-'];
}

function failureCode(message, submitted) {
  if (/not logged in|authentication|unauthorized|401|login required|sign in/i.test(message)) return 'auth_required';
  if (/quota|usage limit|credits exhausted/i.test(message)) return 'quota_exhausted';
  if (/rate.limit|429/i.test(message)) return 'rate_limited';
  if (/unknown configuration|invalid configuration|Error loading config|unsupported|model.*not found/i.test(message)) return 'unsupported_capability';
  return submitted ? 'result_unknown' : 'runtime_unavailable';
}

// This validates the deliberately small schema vocabulary used by this milestone.
// Business reference validation remains the domain service's responsibility.
export function validateOutput(value, schema, path = '$') {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const permitted = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!permitted.includes(type) && !(Number.isInteger(value) && permitted.includes('integer')))
    throw new RuntimeError('invalid_output', `${path}: output has an invalid type.`);
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value)))
    throw new RuntimeError('invalid_output', `${path}: output has an invalid value.`);
  if (type === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key))
      throw new RuntimeError('invalid_output', `${path}: required field ${key} is missing.`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) validateOutput(item, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false)
        throw new RuntimeError('invalid_output', `${path}: unexpected field ${key}.`);
    }
  }
  if (type === 'array') {
    if ((schema.minItems !== undefined && value.length < schema.minItems) ||
        (schema.maxItems !== undefined && value.length > schema.maxItems))
      throw new RuntimeError('invalid_output', `${path}: invalid number of items.`);
    if (schema.items) value.forEach((item, index) => validateOutput(item, schema.items, `${path}[${index}]`));
  }
  if (type === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength) ||
      (schema.maxLength !== undefined && value.length > schema.maxLength)))
    throw new RuntimeError('invalid_output', `${path}: invalid text length.`);
  if (type === 'number' && (!Number.isFinite(value) ||
      (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum)))
    throw new RuntimeError('invalid_output', `${path}: invalid numeric value.`);
  return value;
}

export class CodexRuntime {
  constructor({ executable = process.env.THIRD_DRAFT_CODEX_PATH || 'codex',
    spawnProcess = spawn, environment = process.env, timeoutMs = 180_000,
    maxOutputBytes = 2 * 1024 * 1024 } = {}) {
    this.executable = executable;
    this.spawnProcess = spawnProcess;
    this.environment = runtimeEnvironment(environment);
    this.timeoutMs = Math.min(timeoutMs, 180_000);
    this.maxOutputBytes = maxOutputBytes;
  }

  async command(args, { input, cwd, signal, onEvent, timeoutMs = 15_000,
    maxOutputBytes = this.maxOutputBytes } = {}) {
    if (signal?.aborted) throw new RuntimeError('cancelled', 'Cancelled before runtime submission.');
    return new Promise((accept, reject) => {
      let child;
      try { child = this.spawnProcess(this.executable, args, { env: this.environment,
        cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
      catch { reject(new RuntimeError('runtime_unavailable', 'Cannot start Codex.')); return; }
      let stdout = '', stderr = '', lineBuffer = '', bytes = 0, submitted = false, finished = false;
      const finish = (error, result) => {
        if (finished) return;
        finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error) { child.kill(); reject(error); } else accept(result);
      };
      const abort = () => finish(new RuntimeError(submitted ? 'result_unknown' : 'cancelled',
        submitted ? 'Runtime interrupted after submission; usage or result may exist. Do not retry automatically.' : 'Cancelled before submission.'));
      const timer = setTimeout(() => finish(new RuntimeError(submitted ? 'result_unknown' : 'runtime_unavailable',
        submitted ? 'Runtime deadline reached after submission; do not retry automatically.' : 'Runtime inspection timed out.')), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      const consume = (chunk, isError) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxOutputBytes) { finish(new RuntimeError(submitted ? 'result_unknown' : 'runtime_unavailable', 'Runtime output exceeded the limit.')); return; }
        const text = chunk.toString('utf8');
        if (isError) stderr += text;
        else {
          stdout += text;
          if (onEvent) {
            lineBuffer += text;
            let newline;
            while ((newline = lineBuffer.indexOf('\n')) >= 0) {
              const line = lineBuffer.slice(0, newline).trim(); lineBuffer = lineBuffer.slice(newline + 1);
              if (!line) continue;
              try { onEvent(JSON.parse(line)); }
              catch (error) { finish(error instanceof RuntimeError ? error : new RuntimeError('result_unknown', 'Runtime event protocol is invalid.')); return; }
            }
          }
        }
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => consume(chunk, false));
      child.stderr.on('data', chunk => consume(chunk, true));
      child.stdin.on('error', () => finish(new RuntimeError(submitted ? 'result_unknown' : 'runtime_unavailable', 'Runtime input stream closed.')));
      child.on('error', () => finish(new RuntimeError('runtime_unavailable', 'Codex executable is unavailable.')));
      child.on('close', code => {
        if (onEvent && lineBuffer.trim()) {
          try { onEvent(JSON.parse(lineBuffer)); }
          catch { finish(new RuntimeError('result_unknown', 'Runtime event protocol is incomplete.')); return; }
        }
        finish(null, { code, stdout, stderr });
      });
      if (input !== undefined) { submitted = true; child.stdin.end(input); }
      else child.stdin.end();
    });
  }

  async inspect() {
    const base = { available: false, route: 'codex-native', billing: 'subscription',
      version: null, reason: null, usage: null, configHash: RUNTIME_CONFIG_HASH,
      capabilities: { vision_input: { available: false, format: 'image/png',
        validation: 'local-transport', ...VISION_INPUT_LIMITS } } };
    try {
      await assertNativeInstructionIsolation(this.environment);
      await disabledNativeSkills(this.environment);
      const versionResult = await this.command(['--version']);
      const version = versionResult.stdout.trim().replace(/^codex-cli\s+/, '');
      base.version = version;
      if (versionResult.code !== 0 || version !== SUPPORTED_CODEX_VERSION)
        return { ...base, reason: 'unsupported_capability', detail: `Tool isolation is verified only for Codex ${SUPPORTED_CODEX_VERSION}.` };
      const login = await this.command(['login', 'status']);
      if (login.code !== 0 || !/^Logged in using ChatGPT\s*$/m.test(`${login.stdout}\n${login.stderr}`))
        return { ...base, reason: 'auth_required', detail: 'Native ChatGPT login is unavailable to this process. API authentication is not accepted.' };
      return { ...base, available: true,
        capabilities: { vision_input: { ...base.capabilities.vision_input, available: true } } };
    } catch (error) { return { ...base, reason: error.code ?? 'runtime_unavailable', detail: error.message }; }
  }

  async generate({ prompt, schema, signal, images = [] } = {}) {
    if (typeof prompt !== 'string' || !prompt.trim() || !schema || schema.type !== 'object')
      throw new RuntimeError('invalid_input', 'A prompt and object output schema are required.');
    if (Buffer.byteLength(prompt, 'utf8') > 256 * 1024)
      throw new RuntimeError('invalid_input', 'Runtime input exceeds 256 KiB.');
    const inputImages = visionImages(images);
    const inspected = await this.inspect();
    if (!inspected.available) throw new RuntimeError(inspected.reason, inspected.detail);
    const catalogResult = await this.command(['debug', 'models', '--bundled'], { signal, maxOutputBytes: 5 * 1024 * 1024 });
    let catalog;
    try { if (catalogResult.code !== 0) throw new Error(); catalog = toolFreeCatalog(JSON.parse(catalogResult.stdout)); }
    catch (error) { throw error instanceof RuntimeError ? error : new RuntimeError('unsupported_capability', 'Cannot inspect the bundled Codex model catalog.'); }
    const directory = await mkdtemp(join(tmpdir(), 'third-draft-runtime-'));
    try {
      await writeFile(join(directory, 'models.json'), JSON.stringify(catalog), 'utf8');
      await writeFile(join(directory, 'schema.json'), JSON.stringify(schema), 'utf8');
      const imagePaths = [];
      for (const [index, bytes] of inputImages.entries()) {
        const path = join(directory, `input-${index + 1}.png`);
        await writeFile(path, bytes, { flag: 'wx' });
        imagePaths.push(path);
      }
      await assertNativeInstructionIsolation(this.environment);
      const disabledSkills = await disabledNativeSkills(this.environment);
      const args = runtimeArguments(directory, { 'skills.config': disabledSkills });
      args.splice(args.length - 1, 0, ...imagePaths.flatMap(path => ['-i', path]));
      if (args.join(' ').length > 28_000)
        throw new RuntimeError('unsupported_capability', 'Native skill isolation exceeds the Windows command-line limit.');
      let finalText = null, usage = null, threadId = null, completed = false, failure = null;
      // This receipt records an observed completed turn, not acceptance of its
      // work product. It excludes prompts, rejected output and temporary paths.
      const receipt = () => ({ usage, metadata: { route: inspected.route, billing: inspected.billing,
        version: inspected.version, configHash: createHash('sha256').update(RUNTIME_CONFIG_HASH + JSON.stringify(disabledSkills)).digest('hex'),
        baseConfigHash: RUNTIME_CONFIG_HASH, disabledSkillCount: disabledSkills.length, threadId,
        model: null, modelSelection: 'runtime-default', tools: [], ephemeral: true,
        visionInput: { count: inputImages.length,
          totalBytes: inputImages.reduce((total, bytes) => total + bytes.length, 0),
          format: 'image/png', transport: 'cli-local-image', validation: 'local-transport' },
        catalogHash: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') } });
      try {
        const result = await this.command(args, { input: prompt, cwd: directory,
          signal, timeoutMs: this.timeoutMs, onEvent: event => {
            if (event.type === 'thread.started') threadId = event.thread_id;
            if (event.type === 'item.completed' && event.item?.type === 'agent_message') finalText = event.item.text;
            if (event.type === 'item.started' || event.type === 'item.completed') {
              const itemType = event.item?.type;
              if (itemType && !['agent_message', 'reasoning', 'error'].includes(itemType))
                throw new RuntimeError('result_unknown', 'Unexpected runtime tool activity; execution stopped.');
            }
            if (event.type === 'turn.failed') failure = event.error?.message ?? 'Runtime turn failed.';
            if (event.type === 'turn.completed') { completed = true; usage = event.usage ?? null; }
          } });
        if (result.code !== 0 || failure || !completed) {
          const diagnostic = failure ?? result.stderr;
          throw new RuntimeError(failureCode(diagnostic, true), 'Runtime did not complete a verified result. No automatic retry was made.');
        }
        let output;
        try { output = JSON.parse(finalText); }
        catch { throw new RuntimeError('invalid_output', 'Runtime did not return valid JSON.'); }
        validateOutput(output, schema);
        return { output, ...receipt() };
      } catch (error) {
        if (completed && error instanceof RuntimeError) error.receipt = receipt();
        throw error;
      }
    } finally {
      const target = resolve(directory), boundary = resolve(tmpdir()) + sep;
      if (target.startsWith(boundary) && target.slice(boundary.length).startsWith('third-draft-runtime-'))
        await rm(target, { recursive: true, force: true });
    }
  }
}
