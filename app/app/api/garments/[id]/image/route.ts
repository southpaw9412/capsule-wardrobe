import { db, files, owner, failure } from '@/lib/server';
import { ApiError, assertId } from '@/lib/wardrobe';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await owner(request);
    const { id } = await context.params;
    assertId(id);
    const item = await db()
      .prepare(
        'SELECT image_key,mime_type FROM garments WHERE id=? AND owner_id=? AND deleted=0',
      )
      .bind(id, uid)
      .first<{ image_key: string; mime_type: string }>();
    if (!item) throw new ApiError('Photo not found.', 404);
    const photo = await files().get(item.image_key);
    if (!photo) throw new ApiError('Photo not found.', 404);
    return new Response(photo.body, {
      headers: {
        'Content-Type': item.mime_type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Content-Disposition': 'inline',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
