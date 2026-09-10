import { db, files, owner, json, failure, limitedBody } from '@/lib/server';
import { ApiError, assertId, validateDetails } from '@/lib/wardrobe';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const uid = await owner(request, true);
    const { id } = await context.params;
    assertId(id);
    const raw = await limitedBody(request, 8192);
    let input;
    try {
      input = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new ApiError('Invalid item details.');
    }
    const d = validateDetails(input);
    const result = await db()
      .prepare(
        'UPDATE garments SET name=?,category=?,color=?,season=?,status=?,notes=?,favorite=?,updated_at=? WHERE id=? AND owner_id=? AND deleted=0',
      )
      .bind(
        d.name,
        d.category,
        d.color,
        d.season,
        d.status,
        d.notes,
        d.favorite,
        new Date().toISOString(),
        id,
        uid,
      )
      .run();
    if (!result.meta.changes) throw new ApiError('Item not found.', 404);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const uid = await owner(request, true);
    const { id } = await context.params;
    assertId(id);
    const item = await db()
      .prepare('SELECT image_key FROM garments WHERE id=? AND owner_id=?')
      .bind(id, uid)
      .first<{ image_key: string }>();
    if (!item) throw new ApiError('Item not found.', 404);
    await db()
      .prepare('UPDATE garments SET deleted=1 WHERE id=? AND owner_id=?')
      .bind(id, uid)
      .run();
    await files().delete(item.image_key);
    await db()
      .prepare('DELETE FROM garments WHERE id=? AND owner_id=?')
      .bind(id, uid)
      .run();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
