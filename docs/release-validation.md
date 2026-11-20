# Local release validation — 20 November 2026

**Publication decision: owner authorized committing and pushing this local-use source release after the final security checks.** The owner explicitly waived the dedicated-key acceptance gate. Live OpenAI validation is **NOT TESTED**, not a passed check. The original private project and backup remain untouched; no history rewrite or force push is authorized.

Baseline: `main`, commit `80e7b673fdc129b9c48c00133ca29e0b5c2f3eb7`, tracking `origin/main`. The configured remote is `https://github.com/tomcode-GROUND/3D-IDbuild-home.git`. This report records the release fixes on top of that baseline. Publication must be verified against the resulting commit and GitHub CI.

## Follow-up: source publication readiness

The owner confirmed that this release is for people to download and run locally. Hosted multi-user deployment is not part of this release. The existing loopback Node service, local project library and BYOK instructions match that scope.

A fresh follow-up run passed all 40 tests, lint, TypeScript/Vite production build and the full dependency audit (zero advisories). The current files/build/nested archives and reachable history were rescanned; only the previously investigated deliberate test string and generated hexadecimal-table matches remained. `git diff --check` and Git object integrity checks passed.

The actual GitHub repository was queried read-only: it is public, unarchived and defaults to `main`. `git ls-remote` confirmed remote `main` still points to `80e7b673fdc129b9c48c00133ca29e0b5c2f3eb7`, matching local HEAD. Its [existing CI run](https://github.com/tomcode-GROUND/3D-IDbuild-home/actions/runs/44703498572) completed successfully. This result applies to the baseline commit, not the uncommitted fixes or their expanded test suite.

**Historical decision:** this follow-up initially held publication pending a dedicated-key test. The owner subsequently instructed the release manager to skip that test, complete the final credential/privacy review, commit and push. That explicit authorization supersedes the earlier publication hold; the missing live test remains disclosed below. Verify remote contents and CI on the new commit.

## Results

PASS means executed and verified within the stated scope. Mocked provider results do not establish live OpenAI access, billing, or image interpretation accuracy.

| Validation area | Status | Evidence / findings |
| --- | --- | --- |
| OpenAI live API integration | **NOT TESTED** | Owner explicitly waived the dedicated-key acceptance check and authorized source publication. No real OpenAI request was made. |
| API key security | **PASS** | Code and mocked forwarding/error tests reviewed. A synthetic session value was absent from IndexedDB, localStorage, sessionStorage and downloaded archives in both browsers. Remove and page navigation/refresh clear session credentials. Browser developer tools can inspect the intended authorization header; this is documented local BYOK exposure. Real-key runtime validation was waived and remains unverified. |
| GLB export and validation | **PASS** | Actual UI downloads in Chrome and Safari; non-zero files; GLB v2 header/length/JSON/BIN checks; Khronos Validator returned zero errors and warnings. Separate viewer reimport decoded 128 demo meshes and eight traced-room meshes, with embedded textures and PBR materials. |
| Chrome browser testing | **PASS** | Actual Google Chrome 157.0.8103.80 on macOS, including the non-live workflows below. AI interaction used an isolated mock provider. Live interaction was waived and remains unverified. |
| Safari browser testing | **PASS** | Actual macOS Safari 17.5, not Playwright WebKit. Equivalent non-live journeys, render/edit/recovery and export checks ran. PDF main-thread fallback warning remains. |
| Automated tests | **PASS** | Final clean installation: 40 tests in eight files. Original 28 retained; 12 new cases cover export, camera fitting, CSP-safe validation and provider errors. |
| Production build | **PASS** | TypeScript and Vite build succeeded. Existing large-chunk warning remains; Three.js/environment chunk is approximately 687 kB minified / 173 kB gzip. |
| Clean installation and lint | **PASS** | `npm ci` installed 86 packages; `npm run lint` passed. Node 24.18.0, npm 11.16.0. npm's install-script approval notice for esbuild/fsevents did not prevent the executed tests or build. |
| Development and production startup | **PASS** | Both restarted after the final clean install. Landing page, verifier, favicon and exact demo bytes returned HTTP 200. Missing-key API requests returned 401; foreign-origin requests returned 403. Production CSP retains its prohibition on JavaScript `unsafe-eval`. |
| Dependency security | **PASS** | Fresh full `npm audit --json`: zero advisories at validation time, including development dependencies. |
| Git and secrets review | **PASS** | Clean baseline inspected, then local diff and untracked additions reviewed. All reachable history scanned (67 historical blobs), staged state checked, and `git fsck --full --no-reflogs --unreachable` returned no problems or unreachable objects. No likely real credential was found. |
| Privacy review | **PASS** | Current files, generated bundles, nested public archives and test exports inspected for owner paths, private project markers, internal endpoints and identifying data. Public fixtures remain fictional; the original demo SH3D checksum is unchanged. Pattern scans have limits and are not a guarantee against every possible secret. |

## Browser workflow evidence

Both browsers were operated through their real macOS UI and developer tools. File-input change events with real local fixture bytes were used to exercise the upload pipeline; Safari's native file chooser was also used for GLB reimport. Browser-console automation only used a clearly synthetic session value. No private credential, personal property plan, raw authorization capture or browser profile was included in publication files.

An isolated loopback harness served the production build and injected a fake provider into the existing `createAiHandler` seam. The production provider endpoint and implementation were not replaced or given a mock switch. The harness and its fictional files are temporary local QA tools, outside the repository, and are stopped after testing.

| Workflow | Chrome | Safari | Observations |
| --- | --- | --- | --- |
| Landing page, brand, navigation and demo | PASS | PASS | Juniper demo: seven walls, three openings, two room polygons and 14 furniture items. |
| PNG, JPEG and two-page PDF input | PASS | PASS | Valid preview in all three formats. PDF had two selectable pages; page two preview was verified in Safari. Corrupt PNG showed a recoverable error and retained the accepted project. |
| Analysis, missing dimensions and conversation | PASS (mock) | PASS (mock) | Review initially prevented approval/generation without scale and height. Supplied a 400 cm labelled span and 285 cm ceiling, sent measurement instructions, approved, and created an editable model. PNG, JPEG and PDF journeys reached scene generation. |
| Generated geometry and dimensional consistency | PASS | PASS | Four walls, one room, one opening, 400 cm north wall and 285 cm wall height. Downloaded archives confirm these values and exact original PNG/JPEG/PDF bytes. No apartment-specific furniture was added to traced plans. |
| 2D/3D, selection and furniture edit | PASS | PASS | Switched plan and 3D views; selected the sofa and committed numeric position edits. |
| Undo/redo | PASS | PASS | Chrome committed X=180, undo restored 140, redo restored 180. Safari committed X=160, undo restored 140, redo restored 160. |
| Lighting | PASS | PASS | Evening preset changed daylight strength to 0.2. Safari retained it on reopen. |
| Save, refresh, reopen and portable import | PASS | PASS | Browser-library recovery and portable archive import restored scenes. Chrome import increased project count from six to seven without duplicate IDs. Safari also had seven unique saved project IDs. |
| Credential controls and errors | PASS (mock) | PASS (mock) | Masked entry, configured/validated state, rejected-key and network-failure messages; removal/session clearing. Model-access, billing, rate-limit, refusal, malformed output, cancellation and timeout paths additionally covered by automated tests. Show/hide is retained but was not separately exercised as a browser acceptance test. |
| Credential exclusion | PASS (synthetic value) | PASS (synthetic value) | Browser storage and decompressed project archives did not contain the synthetic session value. No real secret was available to test. |
| PNG export | PASS | PASS | Downloaded files decoded as valid, non-empty PNGs using Pillow verification. |
| GLB export and separate viewer | PASS | PASS | Actual downloads, Khronos validation and visible reimport; details below. |
| Desktop and narrow layout | PASS | PASS | Chrome 400 px responsive viewport; Safari 390 × 600 responsive mode. Landing and editor controls/rendering fit these viewports. Side collection panels are hidden by the existing narrow layout; this is still primarily a desktop editor. |
| Console and network review | PASS | PASS with warning | Final Chrome load had no CSP page error after remediation. Optional form id/name recommendations remain. Safari rendered PDFs via PDF.js's fake-worker fallback; no fatal error prevented preview/generation. Intentional 401/502 responses were verified during negative tests. |
| Live OpenAI vision response | NOT TESTED | NOT TESTED | Skipped at the owner’s explicit instruction; mocked results do not establish real provider behavior. |

Observed demo and traced-room render counters were approximately 59–60 fps in Balanced mode on this Mac. These are short smoke observations, not a sustained performance benchmark or a hardware compatibility guarantee. Physical mobile devices, drag-and-drop gestures, every structural editing control, and long-session stress were not separately tested in this release pass.

## GLB evidence

Khronos `gltf-validator` version `2.0.0-dev.3.10` was installed temporarily and its `validateBytes` API executed on the actual downloads. It was not added as an application dependency. The first export was also manually checked for `glTF`, version 2, exact declared length, aligned JSON/BIN chunk boundaries and JSON parsing. The validator additionally checked buffer/accessor bounds and scene/mesh/material/resource references on each listed file.

| Export | Bytes | Decoded meshes | Errors | Warnings | Informational diagnostics |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial Chrome furnished demo | 3,639,936 | 128 | 0 | 0 | 26 |
| Corrected Safari furnished demo | 3,514,356 | 128 | 0 | 0 | 26 |
| Chrome traced room | 454,184 | 8 | 0 | 0 | 3 |
| Safari traced room | 405,300 | 8 | 0 | 0 | 3 |

The demo includes 62 materials and six embedded texture images. Informational diagnostics concerned unused UV attributes and empty grouping/target nodes. Different browsers encode canvas PNG textures differently, so byte size differs without implying different dimensions. Reimports visibly retained the walls, openings, furniture and material families. HDR environments, ambient/hemisphere lighting and browser post-processing are not glTF scene content; recreate these when rendering elsewhere. Exportable punctual lights remain included, with sun direction corrected.

Empty and fully hidden scenes now reject export with a useful error, verified by regression tests. A missing viewer can no longer report an export success. External-resource GLBs remain rejected by the existing loader policy and tests.

## Fixes and files changed

| Finding | Priority | Correction and affected files | Verification |
| --- | --- | --- | --- |
| REL-01: Export could lose directional-light orientation and attempted unsupported hemisphere lighting | P2 | `src/lib/glbExport.ts` creates an export copy, aligns punctual lights to glTF local -Z and omits unsupported ambient lighting. Integrated in `src/components/SceneViewer.tsx`; live scene stays untouched. | Orientation and source-immutability test; actual browser export; zero validator errors/warnings. |
| REL-02: Empty/not-ready exports could be reported as successful | P2 | Reject no visible mesh geometry and require a viewer before success in `src/App.tsx`. | Empty/hidden geometry regression test; furnished and traced exports still work. |
| REL-03: Fixed camera height made small plans and viewer reimports unnecessarily tiny | P2 | Shared `src/lib/cameraFit.ts` uses bounds, real wall heights, FOV and aspect ratio in the editor and `src/verify.ts`. | Three aspect-ratio tests with small/large translated bounds; small-room and narrow-browser visual checks. |
| REL-04: Optional schema JIT probe triggered a strict-CSP diagnostic | P3 | `src/lib/validation.ts` configures Zod's supported interpreter mode. Shared schemas, project parsing and the server use it. CSP is unchanged. | Dynamic-code-disabled validation regression; final Chrome no longer reports that CSP page error. |
| REL-05: Verifier requested an absent default favicon | P3 | `verify.html` now references the supplied favicon. | Built verifier and icon return HTTP 200; final asset paths checked. |
| REL-06: Additional provider failure paths lacked explicit coverage | P2 | Expanded `server/ai.test.ts` for model denial, missing model, provider 500, incomplete output, malformed JSON and redacted network exceptions. | All 40 tests passed, compared with the original 28. |
| REL-07: Browser QA artifacts could be accidentally added | P3 | `.gitignore` now excludes HAR files, auth profiles and common QA evidence/report directories. | `git check-ignore` confirmed the rules; no evidence or synthetic session values added to tracked files. |

New regression files are `src/lib/glbExport.test.ts`, `src/lib/cameraFit.test.ts` and `src/lib/validation.test.ts`. Documentation changes are this report, the historical-audit pointer and README link. Package manifest, lockfile, dependency versions, fixtures and MIT licence are unchanged.

## Security review detail

The scan covered current tracked and untracked repository files, ignored build output, nested ZIP/SH3D/project entries, all reachable historical blobs and selected fresh QA exports. Installed third-party source trees were handled through the lockfile/advisory audit rather than claimed as a complete source-code audit of dependencies. Reports, static assets and explicit project serialization were also reviewed.

Three pattern hits were investigated: the storage-exclusion test's deliberate non-secret string, the same string in its historical blob, and an IP-shaped substring in Three.js's generated hexadecimal lookup table. None was a credential or internal endpoint. No real secret was found and no credential rotation/history rewrite is indicated by this scan. The pattern scan cannot certify that arbitrary unrecognized sensitive content is absent.

No `.env` credential file was used. The example contains only an optional local port. Production serves the `dist` tree with path/realpath checks. Provider calls use a fixed OpenAI endpoint, redirect rejection, bounded inputs, timeout/cancellation and sanitized errors. There is no application request logging of credentials. Keys deliberately remain observable to sufficiently privileged browser tools/extensions and local software; this local BYOK application does not protect a user from compromised browser extensions or their own developer tools.

## Outstanding checks and owner action

1. **NOT TESTED / P1 — live OpenAI acceptance (owner-waived gate).** Create a dedicated, limited test project key in your own OpenAI account. Enter it directly in the app's masked key panel; never paste it into a chat, command, report or `.env`. Validate model access, upload a small fictional plan, run one analysis, confirm a valid response appears in review, and inspect the selected image request. Check redacted errors and credential exclusion with that session, then remove/revoke the test key. The owner accepted publication without this test. Model availability, billing and interpretation accuracy remain unverified; do not describe these as live-tested.
2. **P3 — Safari PDF worker fallback.** Two-page PDF preview, selection and scene generation passed despite the warning. Worker execution and performance on larger supported PDFs merit a later compatibility/performance investigation.
3. **P3 — bundle size and form metadata.** Keep the existing lazy-loading approach; profile before splitting further. Chrome's optional id/name recommendations do not prevent the tested labelled controls from functioning.

Some intermediate test runs encountered stale dynamic chunks while a production build was being replaced, plus test-console selector mistakes. Those runs were not counted as passes. The final build was held stable, pages refreshed, selectors corrected and the affected workflows repeated. One sandbox write attempt after a new user turn failed because the previous turn's filesystem grant expired; permission was renewed and the checks rerun successfully.

## Reproduction and publication gate

Use the pinned Node runtime, then run:

```sh
npm ci
npm test
npm run lint
npm run build
npm audit
npm run dev
```

For production, stop development if necessary and run `npm start` after building. An optional `IDBUILD_PORT` selects a free loopback port. Rebuild with test pages closed or refresh them afterward, so an old page does not request removed hashed chunks. Use the fictional demo for editing and exports, then reopen a GLB at `/verify.html`. Preserve editable `.fdwz3d` archives separately from rendering exports and browser storage.

The owner explicitly authorized an ordinary commit and push after final security review while skipping the live-key check. Preserve the unverified live-API status in public documentation. Publish only the reviewed code, tests, fictional assets and documentation; exclude local uploads, credential files, browser profiles and raw QA evidence. Verify the pushed commit and CI afterward. No force push, history rewrite, hosted deployment or private-project publication is authorized.
