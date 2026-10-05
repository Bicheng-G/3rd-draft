// Reproducible actual-binary probe of the SAME image dispatcher used by the
// product. Invented auth and synthetic image transport only; no provider calls.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexRuntime, toolFreeCatalog, RUNTIME_CONFIG_HASH } from '../src/runtime.mjs';
import { CodexImageRuntime } from '../src/runtime-image.mjs';
import { IMAGE_CONTRACT_HASH } from '../src/native-image-dispatch.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)), '.workbench/controlled-native-image-probe');
await mkdir(root, { recursive: true });
const boundary = await realpath(root), directory = await mkdtemp(join(boundary, 'probe-'));
const report = { checkedAt: new Date().toISOString(), outcome: 'INCONCLUSIVE',
  scope: 'shared-product-dispatcher; actual-native-binary; synthetic-loopback-images',
  intendedRealProviderCalls: 0, realCredentialsUsed: false, productionAcceptance: false,
  baseContractHash: RUNTIME_CONFIG_HASH, imageContractHash: IMAGE_CONTRACT_HASH,
  limitations: ['Synthetic image bytes are not real production or subscription billing evidence.',
    'Application tool/argument containment, not an OS-level filesystem sandbox.',
    'Native Skill discovery/loading remains best effort.',
    'Budget and denied staging cases are covered by focused tests and the separate budget probe.'] };
try {
  const runtime = new CodexRuntime({ runtimeHome: join(directory, 'runtime', 'codex') });
  await runtime.prepareProfile();
  const identity = await runtime.executableIdentity(); runtime.executable = identity.path;
  report.binarySha256 = identity.executableHash;
  report.version = (await runtime.command(['--version'])).stdout.trim();
  runtime.catalog = toolFreeCatalog(JSON.parse((await runtime.command(['debug', 'models', '--bundled'], { maxOutputBytes: 8 * 1024 * 1024 })).stdout));
  const imageRuntime = new CodexImageRuntime({ nativeRuntime: runtime });
  report.evidence = await imageRuntime.runImageProbe({ version: report.version, compatibility: { executableHash: identity.executableHash } });
  if (report.evidence.status !== 'passed') throw new Error(`Native image contract probe failed during ${report.evidence.failedPhase}.`);
  report.outcome = 'CONTROLLED_NATIVE_DISPATCH_DEMONSTRATED';
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  const target = await realpath(directory);
  if (!target.startsWith(boundary + sep) || !target.slice((boundary + sep).length).startsWith('probe-')) throw new Error('Refusing cleanup outside probe directory.');
  await rm(target, { recursive: true, force: true });
}
const bytes = JSON.stringify(report, null, 2) + '\n';
const filename = join(boundary, `result-${report.checkedAt.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}.json`);
await writeFile(filename, bytes, { flag: 'wx' });
console.log(JSON.stringify({ reportPath: filename, reportSha256: createHash('sha256').update(bytes).digest('hex'),
  outcome: report.outcome, version: report.version, checks: report.evidence?.checks, failure: report.failure }));
