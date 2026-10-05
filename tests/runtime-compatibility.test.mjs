import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeRuntimeContract } from '../src/runtime-compatibility.mjs';
import { runtimeArguments, runtimeEnvironment, disabledNativeSkills, toolFreeCatalog, RUNTIME_CONFIG_HASH, SUBSCRIPTION_PROVIDER } from '../src/runtime.mjs';

for (const fault of ['ambient instruction', 'top-level instruction', 'staging path', 'unexpected tool', 'retry', 'false completion']) {
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
          if (fault === 'staging path') body.input[0].content.push({ type: 'input_text', text: options.cwd });
          body.input[0].content.push({ type: 'input_text', text: '<skill>Native Skill presence cannot relax hard runtime checks.</skill>' });
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
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('native Skill catalog and explicit loading are observations while hard runtime checks still pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'third-draft-probe-skills-'));
  try {
    let requests = 0;
    const result = await probeRuntimeContract({ root, version: '999.0.0', executableHash: 'a'.repeat(64), configHash: RUNTIME_CONFIG_HASH,
      environment: runtimeEnvironment(process.env, join(root, 'codex')), argumentsFor: runtimeArguments,
      providerConfig: SUBSCRIPTION_PROVIDER, disableSkills: disabledNativeSkills,
      catalog: toolFreeCatalog({ models: [{ slug: 'test' }] }),
      async command(args, options) {
        const auth = JSON.parse(await readFile(join(options.environment.CODEX_HOME, 'auth.json'), 'utf8'));
        if (args[0] === 'login') return { code: 0, stdout: 'Logged in using an API key', stderr: '' };
        if (auth.auth_mode === 'apikey') return { code: 1, stdout: '', stderr: 'API auth refused' };
        const provider = args.find(arg => arg.startsWith('model_providers.third_draft_subscription='));
        const url = provider.match(/base_url="([^"]+)"/)[1] + '/responses';
        const schema = JSON.parse(await readFile(join(options.cwd, 'schema.json'), 'utf8'));
        const image = await readFile(join(options.cwd, 'input.png'));
        const skill = await readFile(join(options.cwd, '.agents', 'skills', 'canary', 'SKILL.md'), 'utf8');
        const body = { store: false, text: { format: { schema } }, tools: [], input: [{ type: 'message', role: 'user', content: [
          { type: 'input_text', text: `<environment_context><cwd>${options.cwd}</cwd></environment_context>\n<image path="${join(options.cwd, 'input.png')}"></image>\n<skills_instructions>(file: ${options.cwd}/.agents/skills/canary/SKILL.md)</skills_instructions>\n<skill>\n<path>${options.cwd}/.agents/skills/canary/SKILL.md</path>\n${skill}\nPRIVATE_SKILL_CONTENT_MUST_NOT_APPEAR_IN_DIAGNOSTICS\n</skill>` },
          { type: 'input_image', image_url: `data:image/png;base64,${image.toString('base64')}` },
        ] }] };
        requests++;
        try {
          const response = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: {
            authorization: `Bearer ${auth.tokens.access_token}`, 'chatgpt-account-id': auth.tokens.account_id } });
          await response.text();
          if (response.ok) {
            options.onEvent({ type: 'item.completed', item: { type: 'agent_message', text: '{"title":"Third Draft offline contract probe"}' } });
            options.onEvent({ type: 'turn.completed' });
            return { code: 0, stdout: '', stderr: '' };
          }
        } catch { /* Deliberately interrupted third response must not complete. */ }
        return { code: 1, stdout: '', stderr: 'Transport did not complete' };
      },
    });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.equal(requests, 3);
    assert.ok(Object.values(result.checks).every(Boolean));
    assert.equal(result.nativeSkills.isolation, 'best-effort');
    assert.equal(result.nativeSkills.observationScope, 'compatibility-probe');
    assert.equal(result.nativeSkills.mayBePresent, true);
    assert.equal(result.nativeSkills.observed, true);
    assert.equal(result.nativeSkills.catalogReferenceCount, 1);
    assert.equal(result.nativeSkills.selectedSkillCount, 1);
    assert.equal(result.nativeSkills.skillCanaryPresent, true);
    assert.match(result.nativeSkills.warning, /may be present/i);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SKILL_CONTENT_MUST_NOT_APPEAR_IN_DIAGNOSTICS'), false);
    assert.equal(JSON.stringify(result).includes(root), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
