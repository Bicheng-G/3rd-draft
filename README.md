# Third Draft

A local creative workspace for project knowledge, sources, insights, ideas, reusable creative sets, images, and feedback. The product interface is English; each task chooses its own output language.

**Current milestone (2026-10-20): official logo integration and per-image layout implemented and exercised on RidePass.** One real generation, one instruction edit, and a local transparent-overlay version preserve the uploaded logo; private backup/restore and all 142 regression tests pass. The images remain drafts pending review and owner adoption. Full V1 remains unaccepted; see [current evidence and remaining gates](docs/product/validation-v1.md#正式-logo-与-ridepass-工作流2026-10-20).

**Historical v0.1 final acceptance: PASS WITH NON-BLOCKING LIMITATIONS.** [Real RidePass dogfooding](docs/product/validation-v0.1.md#ridepass-最终-dogfood2026-10-05) verified that a saved creative judgement influenced a separate task after a service restart, without being restated, and reached a newly archived image. Two real text runs and two image actions succeeded; all 132 regression tests passed. The owner subsequently authorized the logo and workflow work above.

The smallest native image loop also has prior evidence: explicit Generate, verified immutable archival, and one instruction Edit preserving the original version. Real ChatGPT subscription validation completed on Codex `0.160.0`; evidence and remaining V1 gates are recorded in [V1 validation](docs/product/validation-v1.md). Imported images and local composition are labelled separately.

## Run locally on Windows

Tested foundation: Node.js 22.15.0 and its experimental SQLite interface. Codex compatibility is checked by bounded local probes of the installed binary and the restricted runtime contract. The historical `0.159.0-alpha.12.1` identity is no longer an exact-version admission rule. Install pinned application dependencies first:

```powershell
npm ci
# Only if the required executable is not on PATH:
$env:THIRD_DRAFT_CODEX_PATH = 'C:\path\to\codex.exe'
npm start
```

Open `http://127.0.0.1:4057`. Data defaults to `%LOCALAPPDATA%\ThirdDraft`; `THIRD_DRAFT_DATA_DIR` and `THIRD_DRAFT_PORT` select another directory or port. One service owns a data directory. Stop the service and copy that directory before upgrading. Startup takes its lock before migration; newer database versions are rejected.

Third Draft uses its own profile at `<data directory>\runtime\codex` and separate runtime user/temporary directories. It does not copy or modify your normal Codex configuration, credentials, instructions, rules, skills, or sessions. Your global `AGENTS.md` and `AGENTS.override.md` can remain in place. Native Codex may still discover personal Skills on Windows; suppression is best effort and the connection reports a warning when observed. This does not grant tools or change the application's approval, file, billing, or dispatch controls. Sign in separately from the installation folder, using the same `THIRD_DRAFT_DATA_DIR` setting as the service:

```powershell
npm run runtime:check # Local dummy transport only; no model or sign-in request
npm run runtime:login # Explicit ChatGPT sign-in to the Third Draft profile
```

Refresh the connection after signing in. The login helper gives only its child process the isolated environment; it does not alter your shell's Codex environment. Credentials are stored by Codex in the application profile and excluded from project backups. Profile validation protects runtime configuration and credential paths without recursively scanning unrelated browser caches created during sign-in. API authentication is rejected; there is no automatic billing-route fallback.

A new executable hash or contract configuration requires fresh bounded probes before model use. Passing evidence is reused in the service process; failed or unavailable checks block execution. Restart Third Draft after a Codex upgrade so its executable is resolved again. `runtime:check` checks the text/vision contract; the image capability check separately runs native generation and edit against local dummy responses. Version equality alone never enables a route. These checks do not establish real subscription output quality.

Native production uses an application-authored tool call on a local Responses transport. The sole tool is native image generation; no external model chooses tools or file paths. Third Draft stages validated image buffers inside the current project and forwards image requests only to the fixed ChatGPT subscription endpoint. Each explicit Production Action has a durable limit of two image operations, including retries. Returned image bytes must match the verified native file before archival. This controls the specific production route; it is not a general operating-system sandbox.

## Use the workspace

Official logos: import an image as **Logo** in Knowledge → Images, then explicitly choose **Use as official logo**. Generation, instruction edits, and local composition require this selection. Choose the logo position and size for each native image. The default overlays the uploaded logo on the full image, preserving its transparency; a white footer is optional. **Adjust logo** previews and saves a new layout version locally without a model call. Edits use the saved unbranded source and reapply the current logo; originals remain unchanged. Older native images without a saved source need a new generation. Check for extra or invented brand marks before adoption. Changing the official logo requires a new image version for final delivery. Private backups include the editable source; delivery ZIPs do not.

1. Create a project. In **Knowledge**, import text/Markdown or images and save references. Brand facts remain drafts until you explicitly confirm them. Image extraction produces a draft too.
2. Save research observations or explicitly read one public source URL. Select evidence to synthesize an insight. Creative tasks never start new research automatically.
3. In **Ideas**, request 1–12 candidates (default 6), inspect context, record feedback, and favorite a fixed version. Edit or continue ideas without replacing their history.
4. Add selected ideas to a **Paid** or **Organic** creative set. Select or reject each version separately within each set; this never starts production. Manual ideas retain their creation context and source version. Brief revisions preserve old versions and flag existing images as stale.
5. In Studio, choose a selected concept and explicitly select any reference images, then choose **Generate**. The application freezes the inputs and archives a verified image as a new asset. Choose an existing native image and submit an instruction edit to create a new version; its original remains unchanged. Reference dependencies and the parent version are recorded separately in Project Memory. Production never automatically approves or adopts the result.
6. Alternatively, import a visual and logo and compose a local template with exact headline/CTA text. Supported template ratios are 1:1, 4:5 and 9:16. Images retain their aspect ratio, logos are not cropped, and installed Arial or Georgia is required. PNG/JPEG/WebP imports are fully decoded, re-encoded as PNG, and stripped of metadata.
7. Review an image, explicitly resolve material issues, and choose adoption. Caption changes create a new version without image generation. The image library and Studio show 50 versions per page; filters cover all saved versions. Draft ZIP exports and final adopted deliveries are distinct; final export refuses stale or unresolved work.
8. Import a local Skill package and enable its immutable version per project. Bounded method text and references can enter context; package scripts never execute. Unsupported permissions or capabilities block a task. These application-managed packages are separate from native personal Skill discovery.

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

Fake runtimes test deterministic boundaries, not model quality. Installed-CLI loopback tests use dummy responses and no provider calls. Real subscription and browser evidence is recorded separately. Full paired visual-quality evaluation has not passed.

The native production milestone remains **FEASIBLE**: browser-driven Generate and one instruction Edit each used one native image operation through the application's own ChatGPT profile. Both returned files were verified and archived, with the edit linked to the unchanged original. That evidence was reused by the completed [RidePass v0.1 acceptance](docs/product/validation-v0.1.md); full V1 remains unaccepted. Exact native identities, hashes, and limitations are in [V1 validation](docs/product/validation-v1.md). Earlier Windows sandbox and Skill-isolation failures remain historical evidence; the current route uses controlled native execution and the approved best-effort Skill boundary. Earlier probe scripts preserve those experiments and are not the current acceptance checklist.

Start with [AGENTS.md](AGENTS.md), the [documentation index](docs/README.md), and the [project guide](docs/PROJECT_GUIDE.md). The canonical PRD retains its existing filename and requirement IDs. Cloud hosting, automatic publishing, team accounts, and billing integration are out of scope. Public release and repository license selection remain pending; installed dependency metadata is in [third-party notices](THIRD_PARTY.md).
