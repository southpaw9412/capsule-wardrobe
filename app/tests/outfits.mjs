import assert from 'node:assert/strict';

export async function testOutfits({ db, request, status, r2 }) {
  let checks = 0;
  const equal = (actual, expected, label) => {
    assert.deepEqual(actual, expected, label);
    checks++;
  };
  const ok = (value, label) => {
    assert(value, label);
    checks++;
  };
  const send = (method, input) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const baseOptions = {
    season: 'Fall / winter',
    includeLayer: true,
    includeAccessory: true,
    lockedIds: [],
    exclude: [],
    seed: 'repeatable-seed',
  };
  const pieces = [];
  const seed = async (
    name,
    category,
    color = 'White',
    season = 'All seasons',
    state = 'Available',
    who = 'alice',
    deleted = 0,
  ) => {
    const id = crypto.randomUUID();
    const row = {
      id,
      name,
      category,
      color,
      season,
      status: state,
      who,
      deleted,
    };
    pieces.push(row);
    await db
      .prepare(
        'INSERT INTO garments(id,owner_id,name,category,color,season,status,image_key,mime_type,bytes,created_at,updated_at,deleted,favorite) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        who,
        name,
        category,
        color,
        season,
        state,
        `test/${id}`,
        'image/png',
        8,
        '2026-01-01',
        '2026-01-01',
        deleted,
        name.includes('Favorite') ? 1 : 0,
      )
      .run();
    return id;
  };
  const top = await seed('Favorite white shirt', 'Tops');
  const otherTop = await seed('Blue knit', 'Tops', 'Blue', 'Fall / winter');
  const bottom = await seed('Navy pants', 'Bottoms', 'Navy');
  await seed('Beige pants', 'Bottoms', 'Beige');
  const shoes = await seed('Black shoes', 'Shoes', 'Black');
  const summerShoes = await seed(
    'Yellow sandals',
    'Shoes',
    'Yellow',
    'Spring / summer',
  );
  const dress = await seed('Green dress', 'Dresses', 'Green');
  await seed('Brown coat', 'Outerwear', 'Brown');
  await seed('Blue bag', 'Accessories', 'Blue');
  const laundry = await seed(
    'Laundry top',
    'Tops',
    'Black',
    'All seasons',
    'In laundry',
  );
  const archived = await seed(
    'Archived shoes',
    'Shoes',
    'White',
    'All seasons',
    'Archived',
  );
  const unsorted = await seed('New upload', 'Unsorted', 'Unknown');
  const deleted = await seed(
    'Deleted top',
    'Tops',
    'White',
    'All seasons',
    'Available',
    'alice',
    1,
  );
  const foreign = await seed(
    'Private bob top',
    'Tops',
    'White',
    'All seasons',
    'Available',
    'bob',
  );

  await status(
    await request('/api/outfits', null),
    401,
    'anonymous outfit list',
  );
  await status(
    await request('/api/outfits/suggest', null, send('POST', baseOptions)),
    401,
    'anonymous suggestions',
  );
  await status(
    await request('/api/outfits', null, send('POST', {})),
    401,
    'anonymous outfit save',
  );
  await status(
    await request('/api/outfits/suggest', 'alice', {
      ...send('POST', baseOptions),
      headers: { Origin: 'https://evil.test' },
    }),
    403,
    'cross-origin suggestions',
  );
  await status(
    await request('/api/outfits', 'alice', {
      ...send('POST', {}),
      headers: { Origin: 'https://evil.test' },
    }),
    403,
    'cross-origin outfit save',
  );
  const empty = await (
    await request(
      '/api/outfits/suggest',
      'empty-user',
      send('POST', baseOptions),
    )
  ).json();
  equal(empty.ideas, [], 'empty wardrobes return no invented clothes');
  ok(
    empty.warnings.some((w) => w.includes('top and bottom')),
    'actionable missing core',
  );

  let response = await status(
    await request('/api/outfits/suggest', 'alice', send('POST', baseOptions)),
    200,
    'generate seasonal outfits',
  );
  let result = await response.json();
  equal(result.engine, 'wardrobe-rules', 'engine is truthfully identified');
  equal(result.ideas.length, 3, 'three suggestions when combinations exist');
  equal(new Set(result.ideas.map((i) => i.key)).size, 3, 'no duplicate ideas');
  const excluded = [summerShoes, laundry, archived, unsorted, deleted, foreign];
  ok(
    result.ideas.every((idea) =>
      idea.items.every((i) => !excluded.includes(i.id)),
    ),
    'filter unavailable, other-owner, unsorted and wrong-season pieces',
  );
  ok(
    result.ideas.every(
      (idea) =>
        idea.items.some((i) => i.category === 'Dresses') ||
        ['Tops', 'Bottoms'].every((c) =>
          idea.items.some((i) => i.category === c),
        ),
    ),
    'every idea has a real core',
  );
  ok(
    result.ideas.every(
      (idea) =>
        idea.items.some((i) => i.category === 'Shoes') &&
        idea.items.some((i) => i.category === 'Outerwear') &&
        idea.items.some((i) => i.category === 'Accessories'),
    ),
    'requested categories included when available',
  );
  ok(
    !JSON.stringify(result).includes('owner_id') &&
      !JSON.stringify(result).includes('image_key'),
    'suggestions do not expose storage or owner fields',
  );
  const same = await (
    await request('/api/outfits/suggest', 'alice', send('POST', baseOptions))
  ).json();
  equal(same.ideas, result.ideas, 'seeded suggestions reproducible');
  const more = await (
    await request(
      '/api/outfits/suggest',
      'alice',
      send('POST', { ...baseOptions, exclude: result.ideas.map((i) => i.key) }),
    )
  ).json();
  ok(
    more.ideas.every((i) => !result.ideas.some((old) => old.key === i.key)),
    'more ideas exclude prior combinations',
  );
  result = await (
    await request(
      '/api/outfits/suggest',
      'alice',
      send('POST', { ...baseOptions, lockedIds: [top] }),
    )
  ).json();
  ok(
    result.ideas.length > 0 &&
      result.ideas.every((i) => i.items.some((g) => g.id === top)),
    'keep control honored in every result',
  );
  for (const locked of [foreign, laundry, summerShoes, deleted])
    await status(
      await request(
        '/api/outfits/suggest',
        'alice',
        send('POST', { ...baseOptions, lockedIds: [locked] }),
      ),
      409,
      'cannot lock a forbidden piece',
    );
  await status(
    await request(
      '/api/outfits/suggest',
      'alice',
      send('POST', { ...baseOptions, lockedIds: [top, dress] }),
    ),
    400,
    'dress and separates incompatible',
  );
  await status(
    await request(
      '/api/outfits/suggest',
      'alice',
      send('POST', { ...baseOptions, lockedIds: [top, otherTop] }),
    ),
    400,
    'two locked tops invalid',
  );
  await status(
    await request(
      '/api/outfits/suggest',
      'alice',
      send('POST', { ...baseOptions, season: 'invalid' }),
    ),
    400,
    'invalid season rejected',
  );
  const onlyDress = await seed(
    'Only dress',
    'Dresses',
    'Unknown',
    'All seasons',
    'Available',
    'small-user',
  );
  result = await (
    await request(
      '/api/outfits/suggest',
      'small-user',
      send('POST', {
        ...baseOptions,
        includeLayer: false,
        includeAccessory: false,
      }),
    )
  ).json();
  equal(
    result.ideas.length,
    1,
    'small wardrobe produces only real possibilities',
  );
  equal(
    result.ideas[0].items.map((i) => i.id),
    [onlyDress],
    'no invented footwear',
  );
  ok(
    result.ideas[0].reasons.some((r) => r.includes('shoes')),
    'incomplete footwear clearly labeled',
  );
  const exhausted = await (
    await request(
      '/api/outfits/suggest',
      'small-user',
      send('POST', { ...baseOptions, exclude: result.ideas.map((i) => i.key) }),
    )
  ).json();
  equal(exhausted.ideas, [], 'exhausted choices do not silently repeat');

  const look = {
    id: crypto.randomUUID(),
    itemIds: [top, bottom, shoes],
    name: 'Everyday, together',
    notes: 'Cuff the sleeves.',
    season: 'All seasons',
  };
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', { ...look, itemIds: [foreign, bottom, shoes] }),
    ),
    409,
    'cannot save another owner piece',
  );
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', { ...look, itemIds: [laundry, bottom, shoes] }),
    ),
    409,
    'cannot save laundry piece',
  );
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', {
        ...look,
        season: 'Fall / winter',
        itemIds: [top, bottom, summerShoes],
      }),
    ),
    409,
    'cannot save season mismatch',
  );
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', { ...look, itemIds: [top, top, bottom] }),
    ),
    400,
    'duplicate garments rejected',
  );
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', { ...look, itemIds: [shoes] }),
    ),
    400,
    'outfit requires core',
  );
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', { ...look, itemIds: [top, dress] }),
    ),
    400,
    'incompatible saved core',
  );
  await status(
    await request(
      '/api/outfits',
      'alice',
      send('POST', { ...look, name: ' ' }),
    ),
    400,
    'empty outfit name',
  );
  await status(
    await request('/api/outfits', 'alice', send('POST', look)),
    201,
    'save outfit',
  );
  await status(
    await request('/api/outfits', 'alice', send('POST', look)),
    200,
    'outfit save retry idempotent',
  );
  let saved = (await (await request('/api/outfits')).json()).outfits;
  equal(saved.length, 1, 'one saved outfit');
  equal(
    saved[0].items.map((i) => i.garment_id),
    look.itemIds,
    'pieces and order persist',
  );
  equal(saved[0].notes, look.notes, 'styling notes persist');
  equal(saved[0].wear_dates, [], 'wear count starts empty');
  ok(
    saved[0].items.every(
      (i) => i.image_url === `/api/garments/${i.garment_id}/image`,
    ),
    'photos stay authenticated',
  );
  equal(saved[0].owner_id, undefined, 'owner hidden');
  equal(
    (await (await request('/api/outfits', 'bob')).json()).outfits,
    [],
    'saved looks isolated by owner',
  );
  await status(
    await request(`/api/outfits/${look.id}`, 'bob', { method: 'DELETE' }),
    404,
    'cannot delete another owner look',
  );
  await status(
    await request(`/api/outfits/${look.id}`, 'alice', {
      method: 'DELETE',
      headers: { Origin: '' },
    }),
    403,
    'outfit delete requires origin',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'bob',
      send('PUT', { date: '2001-02-03' }),
    ),
    404,
    'cannot record another owner wear',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      null,
      send('PUT', { date: '2001-02-03' }),
    ),
    401,
    'anonymous wear denied',
  );
  await status(
    await request(`/api/outfits/${look.id}/wears`, 'alice', {
      ...send('PUT', { date: '2001-02-03' }),
      headers: { Origin: 'https://evil.test' },
    }),
    403,
    'cross-origin wear denied',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('PUT', { date: '2001-02-30' }),
    ),
    400,
    'impossible calendar date rejected',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('PUT', { date: '2999-01-01' }),
    ),
    400,
    'future wear rejected',
  );
  for (let i = 0; i < 2; i++)
    await status(
      await request(
        `/api/outfits/${look.id}/wears`,
        'alice',
        send('PUT', { date: '2001-02-03' }),
      ),
      200,
      'record wear idempotently',
    );
  const simultaneousWears = await Promise.all([
    request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('PUT', { date: '2001-02-04' }),
    ),
    request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('PUT', { date: '2001-02-04' }),
    ),
  ]);
  ok(
    simultaneousWears.every((r) => r.status === 200),
    'concurrent wear retries succeed',
  );
  saved = (await (await request('/api/outfits')).json()).outfits;
  equal(
    saved[0].wear_dates,
    ['2001-02-04', '2001-02-03'],
    'one wear per day, reverse chronological',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'bob',
      send('DELETE', { date: '2001-02-03' }),
    ),
    404,
    'cannot erase another owner wear',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('DELETE', { date: '2001-02-03' }),
    ),
    200,
    'undo wear',
  );
  const duplicate = { ...look, id: crypto.randomUUID() };
  const simultaneousSaves = await Promise.all([
    request('/api/outfits', 'alice', send('POST', duplicate)),
    request('/api/outfits', 'alice', send('POST', duplicate)),
  ]);
  ok(
    simultaneousSaves.every((r) => [200, 201].includes(r.status)),
    'concurrent outfit saves safe',
  );
  equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS count FROM outfit_items WHERE outfit_id=?')
        .bind(duplicate.id)
        .first()
    ).count,
    3,
    'concurrent save has exactly three references',
  );
  await db
    .prepare('UPDATE garments SET status=? WHERE id=?')
    .bind('In laundry', top)
    .run();
  saved = (await (await request('/api/outfits')).json()).outfits;
  equal(
    saved.find((o) => o.id === look.id).items[0].status,
    'In laundry',
    'saved availability follows wardrobe changes',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('PUT', { date: '2001-02-05' }),
    ),
    200,
    'can log historical wear after laundry',
  );
  await r2.put(`test/${top}`, 'test photo');
  await status(
    await request(`/api/garments/${top}`, 'alice', { method: 'DELETE' }),
    200,
    'remove a piece used in saved outfits',
  );
  saved = (await (await request('/api/outfits')).json()).outfits;
  const missing = saved.find((o) => o.id === look.id).items[0];
  equal(missing.status, 'Removed', 'deleted piece stays visible as missing');
  equal(missing.name, 'Favorite white shirt', 'snapshot name retained');
  equal(missing.image_url, null, 'deleted photo is not exposed');
  equal(
    saved.find((o) => o.id === look.id).wear_dates,
    ['2001-02-05', '2001-02-04'],
    'history survives garment deletion',
  );
  await status(
    await request(
      `/api/outfits/${look.id}/wears`,
      'alice',
      send('PUT', { date: '2001-02-06' }),
    ),
    409,
    'cannot wear a removed garment again',
  );
  await status(
    await request(`/api/outfits/${look.id}`, 'alice', { method: 'DELETE' }),
    200,
    'delete saved look',
  );
  equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS count FROM outfit_items WHERE outfit_id=?')
        .bind(look.id)
        .first()
    ).count,
    0,
    'delete cascades outfit references',
  );
  equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS count FROM outfit_wears WHERE outfit_id=?')
        .bind(look.id)
        .first()
    ).count,
    0,
    'delete cascades wear history',
  );
  ok(
    await db.prepare('SELECT id FROM garments WHERE id=?').bind(bottom).first(),
    'deleting a look preserves garments',
  );
  return checks;
}
