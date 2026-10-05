import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { CodexRuntime } from '../src/runtime.mjs';

// An explicit terminal action. Never imports personal Codex credentials or
// changes the parent shell's environment. --check performs only local probes.
const runtime = new CodexRuntime(process.env.THIRD_DRAFT_DATA_DIR
  ? { runtimeHome: join(process.env.THIRD_DRAFT_DATA_DIR, 'runtime', 'codex') } : {});
const compatibility = await runtime.probeCompatibility();
console.log(JSON.stringify({ runtimeHome: runtime.runtimeHome, compatibility }, null, 2));
if (compatibility.status !== 'passed') process.exitCode = 1;
else if (!process.argv.includes('--check')) {
  console.log('Sign in with ChatGPT for Third Draft. Credentials stay in the application profile.');
  const child = spawn(runtime.executable, ['login', '-c', 'cli_auth_credentials_store="file"',
    '-c', 'forced_login_method="chatgpt"'], { cwd: runtime.runtimeHome,
    env: runtime.environment, shell: false, windowsHide: true, stdio: 'inherit' });
  process.exitCode = await new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('close', code => accept(code ?? 1));
  });
}
