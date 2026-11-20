# Working on 3D IDbuild home

Use Node 24 from `.nvmrc` and npm. Install with `npm ci`. Keep the lockfile in sync with dependency changes. Run `npm run lint`, `npm test` and `npm run build` before handoff. Run `npm run dev` during development and `npm start` after building for the local production server. The API tests bind temporary loopback ports and inject a mock provider.

- `src/main.tsx` starts React. `Studio.tsx` handles uploads, measurements, project libraries and session credentials. `App.tsx` is the model editor.
- `src/lib/planFiles.ts` decodes PNG, JPEG and PDF. `planAnalysis.ts` validates normalized traces and converts approved geometry to centimetres. Preserve the scale and ceiling confirmation gate, and keep inferred dimensions provisional.
- `src/lib/sh3d.ts` imports SH3D and legacy project archives. `projects.ts` handles IndexedDB and portable v3 archives. Keep public interchange identifiers stable and preserve old archive readers, source bytes and project ID isolation.
- `PlanView.tsx` renders the plan. `SceneViewer.tsx` renders the Three.js scene in metres. `geometry.ts` and `architecture.ts` are responsible for wall and opening geometry. `furniture.ts` handles procedural fixtures and embedded models.
- `server/ai.ts` is the shared same-origin OpenAI API handler. `vite.config.ts` mounts it for development and preview. `server/start.ts` serves the build and API on loopback. `IDBUILD_PORT` is the optional production port.
- Use existing TypeScript types and component conventions. Exercise import, editing and save/reopen when changing model types or archive rules. Regenerate the fictional fixtures with `npm run make-fixtures` after changing their source or generated demo.

Keep provider credentials in session memory and out of Git, URLs, bundles, errors, logs, fixtures and saved projects. Use a fake provider in tests. Browser file imports are untrusted. Keep archive/resource limits, GLB embedding rules, and same-origin API checks in place. Use only fictional layouts and redistributable assets in public examples. Document dependency and asset licences before adding them.
