import { CodexRuntime, RuntimeError, SUPPORTED_CODEX_VERSION } from './runtime.mjs';

// Capability discovery is not an accepted integration. Keep image submission
// closed until both controls are enforced before the native tool executes.
// No fallback to an API key, another provider, or a model-written file exists.
const BLOCKERS = Object.freeze([
  Object.freeze({ code: 'image_call_budget_unenforced',
    detail: 'No hard one-image-call limit has been verified. The inspected public hook implementation fails open on execution or parsing failures.' }),
  Object.freeze({ code: 'reference_read_isolation_unverified',
    detail: 'The native image tool accepts arbitrary local reference paths. Approved-reference isolation has not passed an end-to-end native probe.' }),
]);

const CHECKED_AT = '2026-10-02';
const SOURCE_REVISION = 'ca466061d64f0b44f416135c7fd06aa7af850bbc';
const SOURCE_BASE = `https://github.com/openai/codex/blob/${SOURCE_REVISION}`;
const SOURCES = Object.freeze({
  nativeImages: 'https://learn.chatgpt.com/docs/image-generation',
  referencePaths: `${SOURCE_BASE}/codex-rs/ext/image-generation/src/tool.rs`,
  hookFailureBehavior: `${SOURCE_BASE}/codex-rs/hooks/src/events/pre_tool_use.rs`,
});
const UNAVAILABLE = 'Native image generation is unavailable: the image-call limit and reference isolation have not passed validation. No request was submitted.';

export class CodexImageRuntime {
  constructor({ nativeRuntime, ...runtimeOptions } = {}) {
    this.nativeRuntime = nativeRuntime ?? new CodexRuntime(runtimeOptions);
  }

  async inspect() {
    const native = await this.nativeRuntime.inspect();
    return {
      available: false, route: 'codex-native', billing: 'subscription',
      version: native.version ?? null, reason: 'unsupported_capability',
      detail: UNAVAILABLE, usage: null,
      nativeAvailable: native.available === true,
      nativeReason: native.reason ?? null,
      capabilities: {
        generate: { available: false, probeStatus: 'blocked' },
        edit: { available: false, probeStatus: 'blocked' },
        reference: { available: false, probeStatus: 'blocked' },
      },
      blockers: BLOCKERS.map(blocker => ({ ...blocker })),
      evidence: {
        checkedAt: CHECKED_AT, verifiedCliVersion: SUPPORTED_CODEX_VERSION,
        toolExposure: 'loopback-only', exposedTool: 'image_gen.imagegen',
        appServerResultSchema: 'imageGeneration',
        liveImageAttempts: 0, acceptedNativeImageProbes: 0,
        // Public source is explanatory evidence, not an assertion that its
        // revision is the installed desktop binary's build revision.
        publicSourceRevision: SOURCE_REVISION,
        publicSourceMatchesBinary: 'not-established', sources: { ...SOURCES },
      },
    };
  }

  async generate() {
    // Deliberately reject before inspecting, staging files, or spawning a
    // process. A healthy text connection does not authorize an unverified tool.
    throw new RuntimeError('unsupported_capability', UNAVAILABLE);
  }
}
