# Third Draft

A local creative workspace for project knowledge, sources, insights, ideas, reusable creative sets, images, and feedback. The product interface is English; each task chooses its own output language.

**V1 is in development, not accepted.** The earlier [v0.1 memory loop passed](docs/product/validation-v0.1.md). Current implementation and remaining gates are recorded in [V1 validation](docs/product/validation-v1.md). Native image generation and instruction-based image editing remain unavailable: the installed runtime has not passed the required call-budget and reference-isolation controls. Imported images and local composition are labelled separately.

## Run locally on Windows

Tested foundation: Node.js 22.15.0 and its experimental SQLite interface. Codex compatibility is checked by bounded local probes of the installed binary and the restricted runtime contract. The historical `0.159.0-alpha.12.1` identity is no longer an exact-version admission rule. Install pinned application dependencies first:

```powershell
npm ci
# Only if the required executable is not on PATH:
$env:THIRD_DRAFT_CODEX_PATH = 'C:\path\to\codex.exe'
npm start
```

Open `http://127.0.0.1:4057`. Data defaults to `%LOCALAPPDATA%\ThirdDraft`; `THIRD_DRAFT_DATA_DIR` and `THIRD_DRAFT_PORT` select another directory or port. One service owns a data directory. Stop the service and copy that directory before upgrading. Startup takes its lock before migration; newer database versions are rejected.

Third Draft uses its own profile at `<data directory>\runtime\codex` and separate runtime user/temporary directories. Your normal Codex configuration, credentials, `AGENTS.md`, `AGENTS.override.md`, rules, skills, and sessions stay outside this profile. Do not change them to make Third Draft work. Sign in separately from the installation folder, using the same `THIRD_DRAFT_DATA_DIR` setting as the service:

```powershell
npm run runtime:check # Local dummy transport only; no model or sign-in request
npm run runtime:login # Explicit ChatGPT sign-in to the Third Draft profile
```

Refresh the connection after signing in. The login helper gives only its child process the isolated environment; it does not alter your shell's Codex environment. Credentials are stored by Codex in the application profile and excluded from project backups. API authentication is rejected; there is no automatic billing-route fallback.

A new executable hash or contract configuration requires fresh bounded probes before model use. Passing evidence is reused in the service process; failed or unavailable checks block execution. Restart Third Draft after a Codex upgrade so its executable is resolved again. Text/vision compatibility and native image production are separate. On the inspected `0.160.0` binary, image controls failed a local adversarial probe, so generation/editing remain disabled. Local dummy responses do not establish real subscription output quality.

## Use the workspace

1. Create a project. In **Knowledge**, import text/Markdown or images and save references. Brand facts remain drafts until you explicitly confirm them. Image extraction produces a draft too.
2. Save research observations or explicitly read one public source URL. Select evidence to synthesize an insight. Creative tasks never start new research automatically.
3. In **Ideas**, request 1–12 candidates (default 6), inspect context, record feedback, and favorite a fixed version. Edit or continue ideas without replacing their history.
4. Add selected ideas to a **Paid** or **Organic** creative set. Select or reject each version separately within each set; this never starts production. Manual ideas retain their creation context and source version. Brief revisions preserve old versions and flag existing images as stale.
5. Import a visual and logo; compose a local template with exact headline/CTA text. Supported ratios are 1:1, 4:5 and 9:16. Images retain their aspect ratio, logos are not cropped, and installed Arial or Georgia is required. PNG/JPEG/WebP imports are fully decoded, re-encoded as PNG, and stripped of metadata.
6. Review an image, explicitly resolve material issues, and choose adoption. Caption changes create a new version without image generation. The image library and Studio show 50 versions per page; filters cover all saved versions. Draft ZIP exports and final adopted deliveries are distinct; final export refuses stale or unresolved work.
7. Import a local Skill package and enable its immutable version per project. Bounded method text and references can enter context; package scripts never execute. Unsupported permissions or capabilities block a task.

Selected context and selected image copies are sent to the signed-in service. Vision copies fit inside 1024×1024; original archived images remain unchanged and both hashes are recorded. Review cannot prove details that become unreadable at that resolution. Unknown quota or cost data is displayed as unknown.

**Activity** exposes durable runs, context, usage, pause, and best-effort interruption. Closing the browser does not stop a task. Unknown external results are not reissued automatically. Received results awaiting local archival can be recovered after restart. Dispatch is conservatively limited to one agent task at a time.

## Backup and restore

A private `.tdbackup` ZIP preserves one project's versions, sources, insights, ideas, favorite reasons, set links, images, task history, and referenced Skill packages. It excludes other projects, credentials, runtime files, and application settings. Do not put backups in Git or send them as customer deliveries.

Restore validates hashes, paths, schema, and references before writing a **separate new data directory**. It never merges with or overwrites the active workspace. Stop the current service and open the returned path:

```powershell
$env:THIRD_DRAFT_DATA_DIR = 'C:\the\returned\restore-directory'
npm start
```

Current limits: 64 MiB total, 20 MiB per file, 512 ZIP entries, and 10,000 rows. Running or pending-archival projects cannot be backed up. A later disk failure may leave a new partial restore directory for inspection; it is not reported as successful.

## Validate and contribute

```powershell
npm test
# Historical v0.1 fixture only; read-only, no model calls:
npm run validate:live
```

Fake runtimes test deterministic boundaries, not model quality. Installed-CLI loopback tests use dummy responses and no provider calls. Real subscription and browser evidence is recorded separately. Full paired visual-quality evaluation and the native image-production gate have not passed.

Current milestone: domain corrections and isolated runtime compatibility, with native image production **BLOCKED**. Exact regression counts, binary/configuration identities and limits are in [V1 validation](docs/product/validation-v1.md). The five real subscription tasks and 1,000-image browser benchmark from October 2 remain historical evidence, not tests of the new isolated login. Reproduce the image boundary diagnostic with `node tools/probe-native-image.mjs`: it uses fabricated credentials and loopback image responses, never accepts native production, and retains its report under `.workbench/native-image-probe/`.

Start with [AGENTS.md](AGENTS.md), the [documentation index](docs/README.md), and the [project guide](docs/PROJECT_GUIDE.md). The canonical PRD retains its existing filename and requirement IDs. Cloud hosting, automatic publishing, team accounts, and billing integration are out of scope. Public release and repository license selection remain pending; installed dependency metadata is in [third-party notices](THIRD_PARTY.md).
