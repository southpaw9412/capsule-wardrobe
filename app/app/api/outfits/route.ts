import { db, owner, json, failure, readJson } from '@/lib/server';
import { ApiError, assertId } from '@/lib/wardrobe';
import {
  record,
  validateIds,
  validateSeason,
  validateComposition,
  matchesSeason,
  outfitKey,
} from '@/lib/outfits';
import { wardrobeForOwner, savedOutfits } from '@/lib/outfit-server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    return json({ outfits: await savedOutfits(await owner(request)) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const uid = await owner(request, true);
    const d = record(await readJson(request));
    if (typeof d.id !== 'string')
      throw new ApiError('An outfit ID is required.');
    assertId(d.id);
    const existing = await db()
      .prepare('SELECT id FROM outfits WHERE id=? AND owner_id=?')
      .bind(d.id, uid)
      .first();
    if (existing) return json({ id: d.id });
    const ids = validateIds(d.itemIds);
    const season = validateSeason(d.season);
    if (
      typeof d.name !== 'string' ||
      !d.name.trim() ||
      d.name.trim().length > 100
    )
      throw new ApiError('Name your outfit using 1–100 characters.');
    if (typeof d.notes !== 'string' || d.notes.length > 1000)
      throw new ApiError('Notes must be under 1,000 characters.');
    const wardrobe = await wardrobeForOwner(uid);
    const items = ids.map((id) => wardrobe.find((g) => g.id === id));
    if (
      items.some(
        (i) => !i || i.status !== 'Available' || !matchesSeason(i, season),
      )
    )
      throw new ApiError(
        'A piece is missing, unavailable, or outside this season. Refresh your wardrobe and choose a replacement.',
        409,
      );
    validateComposition(items as NonNullable<(typeof items)[number]>[]);
    const signature = outfitKey(ids);
    const placeholders = ids.map(() => '?').join(',');
    const now = new Date().toISOString();
    const result = await db().batch([
      db()
        .prepare(
          `INSERT INTO outfits(id,owner_id,name,notes,season,signature,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM garments WHERE owner_id=? AND deleted=0 AND status='Available' AND id IN (${placeholders}))=? AND (SELECT COUNT(*) FROM outfits WHERE owner_id=?)<200 ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          d.id,
          uid,
          d.name.trim(),
          d.notes.trim(),
          season,
          signature,
          now,
          uid,
          ...ids,
          ids.length,
          uid,
        ),
      ...ids.map((id, position) =>
        db()
          .prepare(
            `INSERT OR IGNORE INTO outfit_items(outfit_id,garment_id,name,category,color,position) SELECT o.id,g.id,g.name,g.category,g.color,? FROM outfits o JOIN garments g ON g.id=? AND g.owner_id=o.owner_id AND g.deleted=0 WHERE o.id=? AND o.owner_id=? AND o.signature=?`,
          )
          .bind(position, id, d.id, uid, signature),
      ),
    ]);
    const saved = await db()
      .prepare('SELECT id FROM outfits WHERE id=? AND owner_id=?')
      .bind(d.id, uid)
      .first();
    if (!saved)
      throw new ApiError(
        'Could not save this outfit. Refresh your wardrobe; this preview supports up to 200 saved looks.',
        409,
      );
    return json({ id: d.id }, result[0].meta.changes ? 201 : 200);
  } catch (e) {
    return failure(e);
  }
}
