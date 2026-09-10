import { db, owner, json, failure } from '@/lib/server';
import { ApiError, assertId } from '@/lib/wardrobe';
export const dynamic = 'force-dynamic';
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await owner(request, true);
    const { id } = await context.params;
    assertId(id);
    const result = await db()
      .prepare('DELETE FROM outfits WHERE id=? AND owner_id=?')
      .bind(id, uid)
      .run();
    if (!result.meta.changes) throw new ApiError('Outfit not found.', 404);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
