import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeRuntimeContract } from '../src/runtime-compatibility.mjs';
import { runtimeArguments, runtimeEnvironment, disabledNativeSkills, toolFreeCatalog, RUNTIME_CONFIG_HASH, SUBSCRIPTION_PROVIDER } from '../src/runtime.mjs';

for (const fault of ['ambient instruction', 'top-level instruction', 'explicit skill', 'unexpected tool', 'retry', 'false completion']) {
  test(`offline compatibility rejects ${fault} before approving a runtime`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'third-draft-probe-rejection-'));
    try {
      let requests = 0;
      const result = await probeRuntimeContract({ root, version: '999.0.0', executableHash: 'a'.repeat(64), configHash: RUNTIME_CONFIG_HASH,
        environment: runtimeEnvironment(process.env, join(root, 'codex')), argumentsFor: runtimeArguments,
        providerConfig: SUBSCRIPTION_PROVIDER,
        disableSkills: disabledNativeSkills, catalog: toolFreeCatalog({ models: [{ slug: 'test' }] }),
        async command(args, options) {
          const provider = args.find(arg => arg.startsWith('model_providers.third_draft_subscription='));
          const url = provider.match(/base_url="([^"]+)"/)[1] + '/responses';
          const schema = JSON.parse(await readFile(join(options.cwd, 'schema.json'), 'utf8'));
          const image = await readFile(join(options.cwd, 'input.png'));
          const auth = JSON.parse(await readFile(join(options.environment.CODEX_HOME, 'auth.json'), 'utf8'));
          const body = { store: false, text: { format: { schema } }, tools: fault === 'unexpected tool' ? [{ type: 'web_search' }] : [],
            input: [{ type: 'message', role: 'user', content: [
              { type: 'input_text', text: fault === 'ambient instruction' ? 'THIRD_DRAFT_FORBIDDEN_AMBIENT_CANARY' : 'synthetic' },
              { type: 'input_image', image_url: `data:image/png;base64,${image.toString('base64')}` },
            ] }] };
          if (fault === 'top-level instruction') body.instructions = 'THIRD_DRAFT_FORBIDDEN_AMBIENT_CANARY';
          if (fault === 'explicit skill') body.input.push({ type: 'message', role: 'user', content: [{ type: 'input_text',
            text: '<skill>\n<name>personal-skill</name>\n<path>C:\\personal\\.agents\\skills\\personal-skill\\SKILL.md</path>\nPRIVATE_SKILL_CONTENT_MUST_NOT_APPEAR_IN_DIAGNOSTICS\n</skill>' }] });
          for (let n = 0; n < (fault === 'retry' ? 2 : 1); n++) {
            requests++;
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(body),
              headers: { authorization: `Bearer ${auth.tokens.access_token}`, 'chatgpt-account-id': auth.tokens.account_id } });
            await response.text();
          }
          if (fault !== 'false completion') {
            options.onEvent({ type: 'item.completed', item: { type: 'agent_message', text: '{"title":"Third Draft offline contract probe"}' } });
            options.onEvent({ type: 'turn.completed' });
          }
          return { code: 0, stdout: '', stderr: '' };
        },
      });
      assert.equal(result.status, 'failed');
      assert.equal(result.reason, 'unsupported_capability');
      assert.equal(result.evidenceId, undefined);
      assert.equal(requests, fault === 'retry' ? 2 : 1, 'Fail at the first breached contract; do not continue probing.');
      assert.ok(Object.values(result.checks).every(value => value === false));
      if (fault === 'explicit skill') {
        assert.equal(result.ambientDiagnostics.selectedSkillCount, 1);
        assert.deepEqual(result.ambientDiagnostics.selectedSkillPaths, ['C:\\personal\\.agents\\skills\\personal-skill\\SKILL.md']);
        assert.equal(JSON.stringify(result).includes('PRIVATE_SKILL_CONTENT_MUST_NOT_APPEAR_IN_DIAGNOSTICS'), false);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
