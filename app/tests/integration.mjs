import { Miniflare, convertV4MiniflareOptions, FormData } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { testOutfits } from './outfits.mjs';
const root = process.cwd();
const serverRoot = path.join(root, 'dist/server');
const moduleFiles = (await readdir(serverRoot, { recursive: true }))
  .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
  .sort((a, b) =>
    a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b),
  );
// Buffer the bounded test fixtures at the test transport boundary. Otherwise
// early auth/size rejections can close the loopback socket while Undici is
// still uploading on Linux, hiding the handler's response behind ECONNRESET.
// This wrapper exists only in the test manifest, never in the deployed Worker.
const modules = [
  {
    type: 'ESModule',
    path: path.join(serverRoot, '__test_transport.mjs'),
    contents: `import app from './index.js';
export default { async fetch(request, env, ctx) {
  const body = request.body ? await request.arrayBuffer() : undefined;
  return app.fetch(new Request(request.url, {
    method: request.method, headers: request.headers, body,
  }), env, ctx);
}};`,
  },
  ...moduleFiles.map((file) => ({
    type: 'ESModule',
    path: path.join(serverRoot, file),
  })),
];
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules,
    modulesRoot: serverRoot,
    compatibilityDate: '2026-09-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    r2Buckets: ['FILES'],
    cf: false,
  }),
);
const origin = 'http://wardrobe.test';
const user = (id) => ({
  'oai-authenticated-user-id': id,
  'oai-authenticated-user-email': `${id}@example.test`,
});
const request = (url, who = 'alice', options = {}) =>
  mf.dispatchFetch(origin + url, {
    ...options,
    headers: {
      ...(who ? user(who) : {}),
      ...(options.method && options.method !== 'GET' ? { Origin: origin } : {}),
      ...options.headers,
    },
  });
const photo = await readFile('public/samples/shirt.png');
const id = crypto.randomUUID();
const body = (value = id, bytes = photo, type = 'image/png') => {
  const form = new FormData();
  form.append('id', value);
  form.append('photo', new File([bytes], 'White-shirt.png', { type }));
  return form;
};
let checks = 0;
async function status(response, expected, label) {
  if (response.status !== expected)
    assert.fail(
      `${label}: expected ${expected}, got ${response.status}: ${await response.text()}`,
    );
  checks++;
  return response;
}
try {
  const db = await mf.getD1Database('DB');
  const migrationPiece = crypto.randomUUID();
  for (const file of (await readdir('drizzle'))
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    if (file.startsWith('0001_')) {
      await db
        .prepare(
          'INSERT INTO garments(id,owner_id,name,image_key,mime_type,bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          migrationPiece,
          'upgrade-owner',
          'Existing favorite',
          'existing/photo',
          'image/png',
          123,
          '2026-01-01',
          '2026-01-01',
        )
        .run();
    }
    const sql = await readFile(`drizzle/${file}`, 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((x) => x.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  const preserved = await db
    .prepare('SELECT name,image_key,bytes FROM garments WHERE id=?')
    .bind(migrationPiece)
    .first();
  assert.deepEqual(preserved, {
    name: 'Existing favorite',
    image_key: 'existing/photo',
    bytes: 123,
  });
  checks++;
  await status(await request('/api/garments', null), 401, 'anonymous list');
  await status(
    await request('/api/garments', null, { method: 'POST', body: body() }),
    401,
    'anonymous upload',
  );
  await status(
    await request('/api/garments', 'alice', {
      method: 'POST',
      headers: { Origin: 'https://elsewhere.test' },
      body: body(),
    }),
    403,
    'cross-origin upload',
  );
  await status(
    await request('/api/garments', 'alice', {
      method: 'POST',
      headers: { Origin: '' },
      body: body(),
    }),
    403,
    'missing origin',
  );
  await status(
    await request('/api/garments', 'alice', {
      method: 'POST',
      body: body(crypto.randomUUID(), Buffer.from('<svg/>'), 'image/svg+xml'),
    }),
    400,
    'reject active SVG',
  );
  await status(
    await request('/api/garments', 'alice', {
      method: 'POST',
      body: body(crypto.randomUUID(), Buffer.from('not a photo'), 'image/png'),
    }),
    400,
    'reject spoofed image',
  );
  await status(
    await request('/api/garments', 'alice', {
      method: 'POST',
      body: Buffer.alloc(14 * 1024 * 1024),
    }),
    413,
    'reject oversized body',
  );
  await status(
    await request('/api/garments', 'alice', { method: 'POST', body: body() }),
    201,
    'save real photo',
  );
  await status(
    await request('/api/garments', 'alice', { method: 'POST', body: body() }),
    200,
    'idempotent retry',
  );
  let response = await request('/api/garments');
  await status(response, 200, 'list saved item');
  let data = await response.json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].category, 'Unsorted');
  assert.equal(data.items[0].image_key, undefined);
  assert.equal(data.items[0].owner_id, undefined);
  checks += 4;
  const original = data.items[0];
  response = await request(`/api/garments/${id}/image`);
  await status(response, 200, 'retrieve owned photo');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
  checks += 3;
  response = await request('/api/garments', 'bob');
  assert.equal((await response.json()).items.length, 0);
  checks++;
  await status(
    await request(`/api/garments/${id}/image`, 'bob'),
    404,
    'other user cannot read photo',
  );
  await status(
    await request(`/api/garments/${id}/image`, null),
    401,
    'anonymous cannot read photo',
  );
  const updated = {
    ...original,
    name: 'Favorite white shirt',
    category: 'Tops',
    color: 'White',
    season: 'All seasons',
    status: 'In laundry',
    notes: 'Test fabric note',
    favorite: 1,
  };
  const patch = {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updated),
  };
  await status(
    await request(`/api/garments/${id}`, 'bob', patch),
    404,
    'other user cannot edit',
  );
  await status(
    await request(`/api/garments/${id}`, 'alice', {
      ...patch,
      body: JSON.stringify({ ...updated, category: 'Bogus' }),
    }),
    400,
    'invalid category',
  );
  await status(
    await request(`/api/garments/${id}`, 'alice', patch),
    200,
    'edit details and availability',
  );
  response = await request('/api/garments');
  data = await response.json();
  assert.equal(data.items[0].name, updated.name);
  assert.equal(data.items[0].favorite, 1);
  assert.equal(data.items[0].status, 'In laundry');
  checks += 3;
  await status(
    await request(`/api/garments/${id}`, 'bob', { method: 'DELETE' }),
    404,
    'other user cannot delete',
  );
  const r2 = await mf.getR2Bucket('FILES');
  assert.equal((await r2.list()).objects.length, 1);
  checks++;
  await status(
    await request(`/api/garments/${id}`, 'alice', { method: 'DELETE' }),
    200,
    'delete item and image',
  );
  assert.equal((await (await request('/api/garments')).json()).items.length, 0);
  assert.equal((await r2.list()).objects.length, 0);
  checks += 2;
  await status(
    await request(`/api/garments/${id}/image`),
    404,
    'deleted photo unavailable',
  );
  const same = crypto.randomUUID();
  const concurrent = await Promise.all([
    request('/api/garments', 'alice', { method: 'POST', body: body(same) }),
    request('/api/garments', 'alice', { method: 'POST', body: body(same) }),
  ]);
  assert(concurrent.every((r) => [200, 201].includes(r.status)));
  assert.equal((await (await request('/api/garments')).json()).items.length, 1);
  assert.equal((await r2.list()).objects.length, 1);
  checks += 3;
  await status(
    await request(`/api/garments/${same}`, 'alice', { method: 'DELETE' }),
    200,
    'clean concurrent upload',
  );
  const outfitChecks = await testOutfits({ db, request, status, r2 });
  checks += outfitChecks;
  console.log(
    `PASS: ${checks} checks covering wardrobe storage, upgrade preservation, outfit suggestions, locks, saved looks, wear history, isolation, retries, and deletion.`,
  );
} finally {
  await mf.dispose();
}
