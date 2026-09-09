# Capsule — wardrobe foundation

## Run locally

Requires Node.js 24 LTS (minimum 22.13) and npm. From this directory:

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

Open the Local URL printed by the development server. The Sites plugin provides an explicit local sign-in flow using a synthetic development user. Development data is separate from hosted data.

## Validation

```sh
npm run typecheck
npm run lint
npm run build
npm test
```

The integration suite boots the actual Worker output in Miniflare with isolated temporary D1/R2 storage. It exercises unauthenticated requests, cross-account reads/edits/deletion, origin enforcement, real image uploads, MIME spoofing, upload size rejection, idempotent retries (including concurrent retries), metadata validation, byte-for-byte retrieval, persistent updates, and physical blob deletion.

Lint targets authored application, domain, and schema code; the unmodified generated component catalog has upstream lint errors and is excluded. Private image routes use native image elements to avoid shared optimizer caching. Sign-in/out uses top-level navigation as required by Sites.

## Architecture

- React 19 / TypeScript / Vinext, compiled for Cloudflare Workers.
- D1: garment records indexed by owner, deletion state, and creation time.
- R2: original image bytes under private per-owner object keys.
- Dispatch-owned ChatGPT authentication. Every API checks identity on the server. All record operations include owner_id; image URLs never expose storage keys.
- Same-origin checks for mutations; private no-store responses; content signature checks and bounded body reads. The private Sites dispatcher is the trusted identity boundary. Never expose this Worker directly to the public with user-supplied identity headers.
- SQL migrations are generated from db/schema.ts; no runtime schema mutation.

This private preview adapts the previously proposed Python/PostgreSQL architecture to the hosting available here. The existing Python prototype is unchanged. Before a public beta, explicitly choose between this Worker architecture and a separate Python API, and configure a public authentication strategy. Do not assume this owner-only preview already provides public consumer accounts.

## Product boundaries

Implemented: original-photo batch upload, retry, idempotency, item editing, name/notes search, category filters, favorite toggles, laundry and archived views, durable records/images, and delete confirmation.

Not implemented: automatic tagging, background removal, actual AI styling, outfit saving, preferences, gap detection, shopping, full account export/deletion, native mobile, billing.

This initial preview accepts JPEG/PNG/WebP, 12 MB per photo, up to 20 photos per batch and a soft 500-item cap. Original photos are rendered with object-fit:contain. No generative image alteration occurs. Multiple garments in a single photo are not segmented. HEIC needs conversion before upload. Uploads run sequentially in the browser; leaving the page ends the current queue. Server-side idempotency makes a retry safe.

The cap is intentionally a preview guard, not a concurrency-safe billing quota. Add rate limits and enforce storage reservations before public access. A failed storage deletion leaves a tombstone and can be retried with the same ID; add a cleanup job before a public beta. Large images should gain private thumbnails and EXIF-aware metadata handling in the next media-processing iteration.

## Next milestones

1. Media processing: private thumbnails, EXIF stripping in display variants while retaining originals, background removal, user-reviewed AI tagging, durable job status/retries. Requires selecting a processing provider and securely configuring credentials.
2. Outfit loop: three real-item combinations for an occasion, lock/swap items, save and mark worn. Reject non-owned and unavailable garments server-side.
3. Preference profile and feedback, evaluated with actual user wardrobes.
4. Evidence-backed gaps and product-link evaluation, then constrained shopping discovery.

## Validation record

Production build, authored-code lint, TypeScript, and 37 API/storage acceptance assertions passed locally. Browser interaction and responsive visual QA have not been performed; they should be the next review step. The optional WebMCP surface is feature-detected; no supported WebMCP validation context was available, so it is unverified.

Dependency audit on September 9, 2026: production dependencies have zero advisories after patching React Server Components and Vinext. Development tooling retains advisories involving the migration tool's old esbuild and Miniflare's sharp dependency. These are not in the deployed Worker. Do not expose development tooling to untrusted networks. Recheck before public beta.

## Hosting and source

`.openai/hosting.json` names the private Sites project and logical DB/FILES bindings. Sites provisions actual resources. Do not commit credentials. Source can be published from the app subtree while the main GitHub repository retains the old prototype and CI configuration.

See `public/samples/CREDITS.md` for the three illustrative empty-state assets.
