import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { CodexRuntime, RuntimeError } from './runtime.mjs';
import { IMAGE_CONTRACT_HASH, IMAGE_LIMITS, dispatchNativeImage, snapshotImageInput,
  validateProjectDirectory, validatedPng } from './native-image-dispatch.mjs';

export class CodexImageRuntime {
  constructor({ nativeRuntime, ...runtimeOptions } = {}) {
    this.nativeRuntime = nativeRuntime ?? new CodexRuntime(runtimeOptions);
    this.projectsRoot = this.nativeRuntime.runtimeHome ? join(dirname(dirname(this.nativeRuntime.runtimeHome)), 'projects') : null;
  }

  async probeImageContract(native) {
    const key = native.compatibility.executableHash + ':' + IMAGE_CONTRACT_HASH;
    if (this.imageProbe?.key === key) return this.imageProbe;
    if (this.probePending?.key === key) return this.probePending.promise;
    const promise = this.runImageProbe(native).then(result => (this.imageProbe = { ...result, key }));
    this.probePending = { key, promise };
    try { return await promise; } finally { this.probePending = null; }
  }

  async runImageProbe(native) {
    const parent = this.nativeRuntime.environment.TEMP;
    const directory = await mkdtemp(join(parent, 'native-image-probe-'));
    const evidence = { status: 'failed', version: native.version, executableHash: native.compatibility.executableHash,
      configHash: IMAGE_CONTRACT_HASH, checkedAt: new Date().toISOString(), intendedLiveImageRequests: 0,
      networkEvidence: 'loopback dispatcher and in-process synthetic images; no process-wide network trace',
      checks: { generate: false, referenceAndEdit: false, nativeFile: false, nativeAuth: false }, cases: [] };
    let phase = 'isolated-profile';
    try {
      const runtime = new CodexRuntime({ executable: this.nativeRuntime.executable, runtimeHome: join(directory, 'runtime', 'codex') });
      await runtime.prepareProfile();
      const token = 'third-draft-invented-image-probe-token', account = 'third-draft-invented-account';
      const jwt = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      await writeFile(join(runtime.runtimeHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: null,
        tokens: { id_token: `${jwt({ alg: 'none' })}.${jwt({ exp: Math.floor(Date.now() / 1000) + 3600,
          'https://api.openai.com/auth': { chatgpt_account_id: account, chatgpt_plan_type: 'plus' } })}.synthetic`,
        access_token: token, refresh_token: 'invented-unused', account_id: account }, last_refresh: new Date().toISOString() }));
      const projectsRoot = join(directory, 'projects'), projectDirectory = join(projectsRoot, 'probe-project');
      await mkdir(projectDirectory, { recursive: true });
      const fixture = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#2374ab' } }).png().toBuffer();
      const edited = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#e47b20' } }).png().toBuffer();
      for (const mode of ['generate', 'edit']) {
        phase = mode;
        const expected = mode === 'edit' ? edited : fixture;
        let calls = 0, reserved = 0;
        const result = await dispatchNativeImage({ runtime, catalog: this.nativeRuntime.catalog,
          prompt: 'Offline host-controlled native image test.', images: mode === 'edit' ? [fixture] : [],
          projectDirectory, projectsRoot, actionId: `probe-${mode}`, timeoutMs: 20_000,
          onDispatch: ({ ordinal }) => { if (ordinal !== ++reserved) throw new Error('Invalid local reservation.'); },
          imageRequest: async ({ path, headers }) => {
            if (++calls !== 1 || path !== (mode === 'edit' ? '/images/edits' : '/images/generations') ||
                headers.authorization !== `Bearer ${token}` || headers['chatgpt-account-id'] !== account)
              throw new Error('Native image probe route or authentication changed.');
            evidence.checks.nativeAuth = true;
            return { bytes: Buffer.from(JSON.stringify({ created: 1, background: 'opaque', data: [{ b64_json: expected.toString('base64'), generation_id: 'synthetic-only' }] })) };
          } });
        if (calls !== 1 || reserved !== 1 || !result.image.equals(expected)) throw new Error('Native image probe failed.');
        evidence.cases.push({ mode, calls, reservations: reserved, outputBytes: result.image.length, ...result.metadata });
        evidence.checks[mode === 'generate' ? 'generate' : 'referenceAndEdit'] = true;
        evidence.checks.nativeFile = true;
      }
      evidence.status = 'passed';
    } catch (error) {
      evidence.reason = 'unsupported_capability'; evidence.failedPhase = phase;
      evidence.failureCode = ['unsupported_capability', 'invalid_output', 'result_unknown', 'runtime_unavailable', 'auth_required'].includes(error.code) ? error.code : 'probe_failed';
      evidence.detail = 'The installed runtime did not pass the isolated native image contract probe.';
    }
    finally {
      const target = await realpath(directory), boundary = resolve(parent) + sep;
      if (target.startsWith(boundary) && target.slice(boundary.length).startsWith('native-image-probe-')) await rm(target, { recursive: true, force: true });
    }
    return evidence;
  }

  async inspect() {
    const native = await this.nativeRuntime.inspect();
    const base = { available: false, route: 'codex-native', billing: 'subscription', version: native.version ?? null,
      reason: native.reason, detail: native.detail, usage: null, nativeAvailable: native.available,
      nativeReason: native.reason, nativeSkills: native.nativeSkills, configHash: IMAGE_CONTRACT_HASH,
      blockers: [], capabilities: { generate: { available: false }, edit: { available: false }, reference: { available: false } } };
    if (!native.available) return base;
    if (!this.projectsRoot || !native.compatibility?.executableHash || !this.nativeRuntime.catalog)
      return { ...base, reason: 'unsupported_capability', detail: 'Native image compatibility identity is unavailable.' };
    const compatibility = await this.probeImageContract(native);
    const available = compatibility.status === 'passed';
    return { ...base, available, reason: available ? null : 'unsupported_capability', detail: available ? null : compatibility.detail,
      compatibility, capabilities: Object.fromEntries(['generate', 'edit', 'reference'].map(name => [name, { available, probeStatus: compatibility.status }])),
      evidence: { conclusion: available ? 'local-controls-passed' : 'blocked', realProductionValidated: false,
        approvedBoundary: { maxImageOperations: 2, budgetEnforcement: 'host-durable-reservation',
          readableFiles: 'host-staged-current-project-buffers', selectedReferenceOnly: false } } };
  }

  async generate({ projectDirectory, signal, ...request } = {}) {
    const input = snapshotImageInput(request);
    if (!this.projectsRoot) throw new RuntimeError('unsupported_capability', 'Native image profile identity is unavailable.');
    await validateProjectDirectory(projectDirectory, this.projectsRoot);
    for (const image of input.images) await validatedPng(image, IMAGE_LIMITS.maxImageBytes);
    const inspected = await this.inspect();
    if (!inspected.available) throw new RuntimeError(inspected.reason || 'unsupported_capability', inspected.detail || 'Native image production is unavailable.');
    try {
      const result = await dispatchNativeImage({ ...input, projectDirectory, projectsRoot: this.projectsRoot, signal,
        runtime: this.nativeRuntime, catalog: this.nativeRuntime.catalog });
      result.metadata = { ...result.metadata, version: inspected.version, compatibility: inspected.compatibility, nativeSkills: inspected.nativeSkills };
      return result;
    } catch (error) {
      if (error.receipt) error.receipt.metadata = { ...error.receipt.metadata, version: inspected.version,
        compatibility: inspected.compatibility, nativeSkills: inspected.nativeSkills };
      throw error;
    }
  }
}
