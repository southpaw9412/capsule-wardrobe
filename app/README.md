# Capsule — wardrobe and outfits

## Run locally

Requires Node.js 24 LTS (minimum 22.13) and npm. From this directory:

```sh
npm ci
npm run build
npm run db:local
npx wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0001_red_raider.sql
npm run dev
```

Open the Local URL printed by the development server. The Sites plugin provides an explicit local sign-in flow using a synthetic development user. Development data is separate from hosted data.

The local SQL setup commands above are for a fresh database. If the wardrobe table already exists from the first preview, apply only `0001_red_raider.sql` once. Hosted Sites records and applies migrations automatically; do not reapply or edit the original migration.

## Validation

```sh
npm run typecheck
npm run lint
npm run build
npm test
```

The integration suite boots the actual Worker output in Miniflare with isolated temporary D1/R2 storage. It exercises unauthenticated requests, cross-account reads/edits/deletion, origin enforcement, real image uploads, MIME spoofing, upload size rejection, idempotent retries (including concurrent retries), metadata validation, byte-for-byte retrieval, persistent updates, and physical blob deletion. Outfit checks cover migration preservation, seasonal and availability filtering, locked pieces, exhausted small wardrobes, real item IDs, saves and concurrent retries, daily wear deduplication, calendar validation, ownership, missing garment references, and cascading outfit deletion.

Lint targets authored application, domain, and schema code; the unmodified generated component catalog has upstream lint errors and is excluded. Private image routes use native image elements to avoid shared optimizer caching. Sign-in/out uses top-level navigation as required by Sites.

## Architecture

- React 19 / TypeScript / Vinext, compiled for Cloudflare Workers.
- D1: garment records indexed by owner, deletion state, and creation time; saved outfits, ordered garment references, and wear dates. Outfit deletion cascades through its references/history. Garment deletion preserves a caption snapshot in saved looks and removes access to its image.
- R2: original image bytes under private per-owner object keys.
- Dispatch-owned ChatGPT authentication. Every API checks identity on the server. All record operations include owner_id; image URLs never expose storage keys.
- Same-origin checks for mutations; private no-store responses; content signature checks and bounded body reads. The private Sites dispatcher is the trusted identity boundary. Never expose this Worker directly to the public with user-supplied identity headers.
- SQL migrations are generated from db/schema.ts; no runtime schema mutation.

This private preview adapts the previously proposed Python/PostgreSQL architecture to the hosting available here. The existing Python prototype is unchanged. Before a public beta, explicitly choose between this Worker architecture and a separate Python API, and configure a public authentication strategy. Do not assume this owner-only preview already provides public consumer accounts.

## Product boundaries

Implemented: original-photo batch upload, retry, idempotency, item editing, name/notes search, category filters, favorite toggles, laundry and archived views, durable records/images, and delete confirmation. The Outfits area supplies up to three combinations, season/layer/accessory controls, a manual builder, swapping, kept pieces during remix, naming and saving looks, variations, wear logging and undo, and saved-look deletion.

Not implemented: automatic tagging, background removal, actual AI styling, learned preferences, occasion/dress-code matching, gap detection, shopping, full account export/deletion, native mobile, billing. No AI service or API credentials are configured, and the UI explicitly identifies the current recommendations as based on saved details.

Suggestions are deterministic for a given seed, filtered to owned, available, categorized garments and the chosen season. A core is a dress or one top plus one bottom. Shoes are included when available, otherwise explicitly called out as missing. Layers/accessories are optional, and all candidates are real garment IDs. Matching uses simple neutral/tonal palette rules, favorites, and variety; it cannot infer fit, fabric, dress code, gender, or visual style from a photo. Candidate pools and beam sizes are bounded for Worker execution; “More ideas” excludes the last 24 shown combinations, not an exhaustive catalog of every possible outfit. Saved looks are limited to 200 in this private preview. A saved composition is kept intact; “Make a variation” creates a new look. One wear per outfit per calendar day is enforced by the database; logging a past wear does not change laundry status. Deleted clothing remains labeled as removed in saved looks, with its previous wear history retained.

This initial preview accepts JPEG/PNG/WebP, 12 MB per photo, up to 20 photos per batch and a soft 500-item cap. Original photos are rendered with object-fit:contain. No generative image alteration occurs. Multiple garments in a single photo are not segmented. HEIC needs conversion before upload. Uploads run sequentially in the browser; leaving the page ends the current queue. Server-side idempotency makes a retry safe.

The cap is intentionally a preview guard, not a concurrency-safe billing quota. Add rate limits and enforce storage reservations before public access. A failed storage deletion leaves a tombstone and can be retried with the same ID; add a cleanup job before a public beta. Large images should gain private thumbnails and EXIF-aware metadata handling in the next media-processing iteration.

## Next milestones

1. Media processing: private thumbnails, EXIF stripping in display variants while retaining originals, background removal, user-reviewed AI tagging, durable job status/retries. Requires selecting a processing provider and securely configuring credentials.
2. Extend the completed outfit loop with user-reviewed occasion/formality details and provider-backed styling explanations.
3. Preference profile and explicit outfit feedback, evaluated with actual user wardrobes.
4. Evidence-backed gaps and product-link evaluation, then constrained shopping discovery.

## Validation record

The wardrobe foundation passed local and GitHub Linux checks, and the user confirmed real uploads. The expanded suite validates the outfit round against the compiled Worker with isolated storage and an existing-data upgrade fixture. Browser interaction and responsive visual QA have not been performed for the outfit round. The optional wardrobe WebMCP surface is feature-detected; no supported WebMCP validation context was available, so it is unverified.

Dependency audit on September 9, 2026: production dependencies have zero advisories after patching React Server Components and Vinext. Development tooling retains advisories involving the migration tool's old esbuild and Miniflare's sharp dependency. These are not in the deployed Worker. Do not expose development tooling to untrusted networks. Recheck before public beta.

## Hosting and source

`.openai/hosting.json` names the private Sites project and logical DB/FILES bindings. Sites provisions actual resources. Do not commit credentials. Source can be published from the app subtree while the main GitHub repository retains the old prototype and CI configuration.

See `public/samples/CREDITS.md` for the three illustrative empty-state assets.
