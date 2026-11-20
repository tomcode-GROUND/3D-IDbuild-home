# Public release audit

**Historical assessment:** The original preparation findings below are retained for context. Current validation, fixes and the publication gate are in [release-validation.md](release-validation.md). Live OpenAI acceptance was not executed and the owner explicitly waived that publication gate; the newer report supersedes the older test status and checklist below.

## Assessment and findings

The original repository remains private. Its reachable Git history contained one baseline commit at audit time. The assessed working tree also held uncommitted AI implementation changes. The public candidate carries forward that implementation and contains one new Git root commit. It uses an original fictional layout and procedural assets.

| ID | Priority | Category and location | Finding and status | Impact | Resolution or recommendation | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| PRIV-01 | P0 | Privacy · original SH3D fixtures, furnished archive, scene export, design code and history | Confirmed. The actual property layout and identifying data were included in tracked history and build output. | Publishing the original repository would disclose a private floor plan and related material. | Use a separate public repository with original Juniper geometry and fresh history. Preserve the original and its backup privately. | Checked tracked files, archive entries and nested contents, generated output and the public root commit for private markers. |
| DIST-01 | P1 | Runtime · original Node pin | Confirmed. The original runtime pin was Node 20, an end-of-life release. | New installations would use an unsupported runtime. | Pin Node 24.18.0, declare the Node 24 engine range, keep the npm lockfile, and use the same pin in CI. | Clean clone and `npm ci` with Node 24.18.0 and npm 11.16.0. |
| INPUT-01 | P1 | Imported resources · GLB loaders | Confirmed by code review. Model resource resolution previously used unrestricted loader defaults. | A model referencing external resources could trigger unintended resource requests, especially in development. | Require GLB v2, bounded size, embedded resources and a loader URL policy in the editor and verifier. | Tests exercise embedded and external resource references without initiating network requests. |
| INPUT-02 | P2 | Archive parser and render inputs | Confirmed by code review. Legacy manifest state lacked runtime schema validation, and input limits were looser than v3. | Invalid or excessive geometry could cause a rendering or import failure. | Apply the shared scene schema to legacy state, tighten archive entry and total limits, reject unsafe names and XML entity processing, and limit SH3D geometry and PDF image size. | Legacy fixture migration and edit round trips, invalid XML/archive checks and v3 persistence tests pass. Full adversarial parser fuzzing was outside this audit. |
| API-01 | P2 | Credential handling · local API handler | Confirmed by inspection. Provider output was checked before JSON decoding. | An escaped credential in structured output could evade the raw text check. | Check parsed results before returning them, reject credential-like model and message values, and enforce loopback peer and same-origin checks. | Mocked echo test rejects escaped output and confirms the returned error omits the mock key. Loopback smoke validates 401 and 403. |
| API-02 | P1 | OpenAI · live provider validation | Verification gap. No test key was available. | Billing, live model access and visual interpretation are unverified. | Run the owner acceptance check below before release. | Mocked forwarding, access, analysis, error handling and cancellation passed. |
| API-03 | P2 | BYOK · browser and local host | Inherent local BYOK exposure. The key can be seen by authorized browser inspection or extensions. | Untrusted local software with browser access can read the key. | Keep session-memory behaviour, document exposure, and remove the key at session end. | Reviewed HTTP request headers, serialization, app lifecycle and mock credential-exclusion tests. |
| DIST-02 | P1 | Assets and licence · original binary models and plans | Confirmed. The original private package combined plans and third-party assets with varying provenance. | Redistribution rights and privacy would require asset-by-asset approval. | Use original procedural assets. Apply the owner-selected MIT licence to original code and demo. Include dependency notices and licence texts for bundled browser libraries. | Checked public fixtures and runtime assets and traced them to original generator or package distribution. |
| DOC-01 | P2 | Setup, configuration and contribution docs | Confirmed. The original had no agent guide, policy, contribution notes, or environment template. | Reproduction and maintenance depended on prior context. | Add README, AGENTS, contribution guide, policy, Node pin, npm lockfile and port-only example. | Walked the documented install, start and build instructions from a clean checkout. |
| PERF-01 | P3 | Build size · Three.js chunk and PDF worker | Confirmed. Vite warns about minified chunks over 500 kB. | Larger initial 3D payload and PDF feature download. | Keep current lazy loading. Measure before further splitting. | Build succeeded. The Three.js chunk was about 687 kB minified and 172 kB gzip. |

The original scan covered tracked and working-tree files, accessible historical blobs, ZIP members and build output. No likely API key pattern was found by that scan. Email-like matches in legacy assets warranted review, and those assets were excluded from the public candidate. The candidate and its production artifacts had no matches for the scanned credential patterns, owner paths, private network addresses or legacy identifiers. The remaining email-like text appeared in third-party licence notices. Pattern scans have limited coverage and cannot establish that arbitrary sensitive material is absent.

## Installation, architecture and BYOK

The deployable unit is the local Node service and Vite-built frontend. The app needs Node, npm and a modern WebGL 2 browser. npm installs runtime and build dependencies. The editor uses React and Three.js, browser IndexedDB, PDF.js for PDF rasterization, and polygon clipping for wall geometry. The renderer converts stored centimetres to metres. Blender is optional for exported models, and the new fixture generator uses Node.

`src/` contains the interface and rendering, geometry, import and persistence modules. `server/` contains the OpenAI adapter and production host. `public/fixtures/` contains the fictional source and legacy project. `scripts/` regenerates fixtures. See the root README and agent guide for entry points and configuration. `.env.example` contains an optional port. The OpenAI key is set separately in the browser panel.

The Models endpoint checks access. The Responses endpoint processes the selected raster input with a schema-constrained response. The browser passes the credential to the local adapter per request. Local storage contains project data. Analysis sends the selected image and conversation to OpenAI and can incur charges.

## Validation evidence

| Check | Result |
| --- | --- |
| Clean local clone, Node and npm, lockfile install | Passed on macOS with Node 24.18.0 and npm 11.16.0. Installed 86 packages. npm printed its install-script approval notice for esbuild and fsevents. |
| Unit and integration tests | 28 passed in five files. Coverage includes mocked OpenAI access and analysis, 401, 402, 429, refusal, malformed output, timeout, cancellation, response credential redaction and origin checks. Also covers scale review, geometry, local persistence, legacy imports and local model-resource policy. |
| Lint and production build | Passed. Vite bundle-size warning remains. |
| npm advisory checks | Production-only and full `npm audit` returned zero advisories at audit time. |
| Clean checkout development and production service | Both served the landing page and exact fictional fixture bytes. Same-origin requests without a key returned 401. Foreign-origin requests returned 403. Production served the GLB viewer and set CSP and no-sniff headers. |
| Browser interaction using production candidate | Landing page, Juniper Apartment WebGL rendering, 2D floor plan, furniture placement, undo and redo, lighting changes and PNG export passed. The README image is the resulting studio PNG. |
| Browser GLB export, portable import and refresh/reopen | Browser continuation expired during the GLB action. The complete browser sequence is unverified. Archive and persistence behaviours passed automated tests. |
| PNG/JPEG/PDF upload through the full browser analysis workflow | Full candidate browser run remains open. File validation, trace-to-model conversion and review logic ran in automated tests. |
| Native Chrome and Safari, GitHub-hosted OS CI | Native browser checks were not completed after browser automation became unavailable. A Linux, macOS and Windows workflow is configured for GitHub execution. |
| Live OpenAI credentials and image analysis | Pending dedicated test key. Automated tests use a mock provider. |

## Release checklist

- [x] Preserve the original privately and generate a fresh publication history.
- [x] Replace private source geometry, older exports and legacy examples with fictional fixtures.
- [x] Add the MIT licence, dependency notices, setup and agent guides.
- [x] Validate clean install, development and production startup, lint, build, tests and browser rendering.
- [x] Compare staged files, fixture contents, fresh history, ignore rules and build artifacts against privacy checks.
- [ ] Complete the OpenAI owner check and remaining browser smoke checks.
- [ ] Create an empty GitHub repository, enable private vulnerability reporting, and publish only the fresh candidate `main` branch. Check the three OS jobs after push.

### Owner acceptance

Run `npm ci`, `npm run build`, and `npm start`. Open the printed loopback address. In **OpenAI key**, enter a dedicated OpenAI project key with the selected model enabled and select **Validate**. Upload `docs/juniper-plan.png` and select **Analyse plan**. Review the result against the drawing, confirm the 880 cm overall span and 270 cm ceiling, generate 3D, and make a small edit. Export and reimport a project, refresh and reopen it, export GLB and open it in `/verify.html`. Repeat browser smoke with PNG, JPEG and a multipage PDF in Chrome and Safari. Remove the test key after validation.

The GitHub remote is now configured. Do not rerun initial remote setup. Consult the current validation report and obtain explicit owner approval after every mandatory check passes before publishing local changes. No push is authorized by this historical document.
