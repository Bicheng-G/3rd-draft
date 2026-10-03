# Third-party dependencies

The application pins `sharp` 0.35.5 and `fflate` 0.8.3 in `package-lock.json`. This table records installed package metadata on Windows x64 on 2026-10-02; it is not a license grant for Third Draft or a redistribution audit. Each installed package includes its own license files. No third-party Skill or user asset is bundled.

| Package | Installed version | Declared license |
|---|---|---|
| sharp | 0.35.5 | Apache-2.0 |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later |
| @img/sharp-wasm32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT |
| @img/colour | 1.1.0 | MIT |
| @emnapi/runtime | 1.11.3 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| semver | 7.8.5 | ISC |
| tslib | 2.8.1 | 0BSD |
| fflate | 0.8.3 | MIT |

The native Codex executable, browser, Windows fonts, and user subscription are external prerequisites, not redistributed by this repository. Template rendering reads installed Arial/Georgia; it does not copy font files into exports or backups. Public packaging and repository license choice remain open in [the roadmap](docs/product/roadmap.md).
