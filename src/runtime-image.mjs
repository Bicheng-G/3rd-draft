import { CodexRuntime, RuntimeError } from './runtime.mjs';

// Capability discovery is not an accepted integration. Keep image submission
// closed until the approved two-operation/project-filesystem boundary is proven.
// No fallback to an API key, another provider, or a model-written file exists.
const BLOCKERS = Object.freeze([
  Object.freeze({ code: 'project_filesystem_isolation_unavailable',
    detail: 'Codex 0.160.0 on Windows cannot read even a valid staged project reference with the tested project-only filesystem policy. Elevated mode requires root read access; unelevated mode refuses split read restrictions. Normal host and other-project isolation has not been demonstrated.' }),
]);

const CHECKED_AT = '2026-10-05';
const SOURCE_REVISION = 'ca466061d64f0b44f416135c7fd06aa7af850bbc';
const SOURCE_BASE = `https://github.com/openai/codex/blob/${SOURCE_REVISION}`;
const SOURCES = Object.freeze({
  nativeImages: 'https://learn.chatgpt.com/docs/image-generation',
  referencePaths: `${SOURCE_BASE}/codex-rs/ext/image-generation/src/tool.rs`,
  hookFailureBehavior: `${SOURCE_BASE}/codex-rs/hooks/src/events/pre_tool_use.rs`,
});
const UNAVAILABLE = 'Native image generation is unavailable: the current-project filesystem boundary has not passed validation on the tested runtime. No request was submitted.';

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
        checkedAt: CHECKED_AT, observedCliVersion: '0.160.0', historicalPinnedVersion: '0.159.0-alpha.12.1',
        toolExposure: 'loopback-only', exposedTool: 'image_gen.imagegen',
        appServerResultSchema: 'imageGeneration',
        liveImageAttempts: 0, acceptedNativeImageProbes: 0,
        approvedBoundary: { maxImageOperations: 2, budgetEnforcement: 'harness-or-native',
          readableFiles: 'current-project-isolated-staging', selectedReferenceOnly: false },
        budgetProbe: { status: 'local-harness-demonstrated', script: 'tools/probe-image-budget.mjs',
          exclusiveActionOwner: true, durableReservations: true, productionIntegrated: false },
        filesystemProbe: { status: 'positive-project-read-unavailable', script: 'tools/probe-image-filesystem.mjs',
          elevated: 'requires-root-read', unelevated: 'split-read-policy-unsupported' },
        supersededProbe: { script: 'tools/probe-native-image.mjs', observedImageOperations: 2,
          outsideWorkDirectoryReference: 'inside-the-same-probe-runtime-root', provesCurrentBoundaryFailure: false },
        conclusion: 'blocked', observationScope: 'The tested binary and probe configuration are identified in the V1 validation record. Other binaries are unverified.',
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
