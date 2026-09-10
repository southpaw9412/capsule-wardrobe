import { db, owner, json, failure, readJson } from '@/lib/server';
import { ApiError, assertId } from '@/lib/wardrobe';
import { record, validateWearDate } from '@/lib/outfits';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function change(request: Request, context: Context, remove: boolean) {
  try {
    const uid = await owner(request, true);
    const { id } = await context.params;
    assertId(id);
    const date = validateWearDate(record(await readJson(request)).date);
    const outfit = await db()
      .prepare('SELECT id FROM outfits WHERE id=? AND owner_id=?')
      .bind(id, uid)
      .first();
    if (!outfit) throw new ApiError('Outfit not found.', 404);
    if (remove)
      await db()
        .prepare(
          'DELETE FROM outfit_wears WHERE outfit_id=? AND worn_on=? AND EXISTS(SELECT 1 FROM outfits WHERE id=? AND owner_id=?)',
        )
        .bind(id, date, id, uid)
        .run();
    else {
      // Recording a past wear is allowed for laundry/archived pieces. Deleted pieces cannot be worn again.
      const missing = await db()
        .prepare(
          `SELECT COUNT(*) AS count FROM outfit_items oi LEFT JOIN garments g ON g.id=oi.garment_id AND g.owner_id=? AND g.deleted=0 WHERE oi.outfit_id=? AND g.id IS NULL`,
        )
        .bind(uid, id)
        .first<{ count: number }>();
      if (missing?.count)
        throw new ApiError(
          'This look contains a removed piece. Make a new variation before recording another wear.',
          409,
        );
      const result = await db()
        .prepare(
          `INSERT INTO outfit_wears(outfit_id,worn_on,created_at) SELECT id,?,? FROM outfits WHERE id=? AND owner_id=? AND NOT EXISTS(SELECT 1 FROM outfit_items oi LEFT JOIN garments g ON g.id=oi.garment_id AND g.owner_id=? AND g.deleted=0 WHERE oi.outfit_id=? AND g.id IS NULL) ON CONFLICT(outfit_id,worn_on) DO NOTHING`,
        )
        .bind(date, new Date().toISOString(), id, uid, uid, id)
        .run();
      if (!result.meta.changes) {
        const existing = await db()
          .prepare(
            'SELECT 1 FROM outfit_wears w JOIN outfits o ON o.id=w.outfit_id WHERE w.outfit_id=? AND worn_on=? AND o.owner_id=?',
          )
          .bind(id, date, uid)
          .first();
        if (!existing)
          throw new ApiError('The outfit changed. Refresh and try again.', 409);
      }
    }
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export const PUT = (request: Request, context: Context) =>
  change(request, context, false);
export const DELETE = (request: Request, context: Context) =>
  change(request, context, true);
