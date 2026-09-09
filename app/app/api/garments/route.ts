import { db, files, owner, json, failure, limitedBody } from '@/lib/server';
import { ApiError, assertId, imageType, MAX_IMAGE_BYTES } from '@/lib/wardrobe';
export const dynamic = 'force-dynamic';
const PUBLIC_FIELDS =
  'id,name,category,color,season,status,notes,favorite,created_at,updated_at';
export async function GET(request: Request) {
  try {
    const uid = await owner(request);
    const rows = await db()
      .prepare(
        `SELECT ${PUBLIC_FIELDS} FROM garments WHERE owner_id=? AND deleted=0 ORDER BY created_at DESC, id DESC`,
      )
      .bind(uid)
      .all();
    return json({
      items: rows.results.map((r) => ({
        ...r,
        image_url: `/api/garments/${String(r.id)}/image`,
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const uid = await owner(request, true);
    const raw = await limitedBody(request, MAX_IMAGE_BYTES + 65536);
    const form = await new Response(raw, {
      headers: { 'content-type': request.headers.get('content-type') || '' },
    })
      .formData()
      .catch(() => {
        throw new ApiError('Use a photo upload.');
      });
    const photo = form.get('photo');
    const rawId = form.get('id');
    const id = typeof rawId === 'string' ? rawId : '';
    assertId(id);
    const existing = await db()
      .prepare(
        `SELECT ${PUBLIC_FIELDS} FROM garments WHERE id=? AND owner_id=? AND deleted=0`,
      )
      .bind(id, uid)
      .first();
    if (existing)
      return json({
        item: { ...existing, image_url: `/api/garments/${id}/image` },
      });
    if (!photo || typeof photo === 'string' || photo.size === 0)
      throw new ApiError('Choose a photo.');
    if (photo.size > MAX_IMAGE_BYTES)
      throw new ApiError('Each photo must be under 12 MB.', 413);
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const mime = imageType(bytes);
    if (!mime || mime !== photo.type)
      throw new ApiError(
        'Use a JPEG, PNG or WebP image. HEIC photos can be exported as JPEG.',
      );
    const count = await db()
      .prepare('SELECT COUNT(*) AS count FROM garments WHERE owner_id=?')
      .bind(uid)
      .first<{ count: number }>();
    if (count && count.count >= 500)
      throw new ApiError(
        'This preview supports 500 pieces. Remove an item before adding another.',
        409,
      );
    const name =
      photo.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]/g, ' ')
        .trim()
        .slice(0, 100) || 'New piece';
    // A fresh storage key prevents concurrent upload retries from deleting each other's image.
    const key = `wardrobe/${encodeURIComponent(uid)}/${id}/${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await files().put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      await db()
        .prepare(
          'INSERT INTO garments (id,owner_id,name,image_key,mime_type,bytes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .bind(id, uid, name, key, mime, bytes.length, now, now)
        .run();
    } catch (error) {
      await files().delete(key);
      const saved = await db()
        .prepare(
          `SELECT ${PUBLIC_FIELDS} FROM garments WHERE id=? AND owner_id=? AND deleted=0`,
        )
        .bind(id, uid)
        .first();
      if (saved)
        return json({
          item: { ...saved, image_url: `/api/garments/${id}/image` },
        });
      throw error;
    }
    return json(
      {
        item: {
          id,
          name,
          category: 'Unsorted',
          color: 'Unknown',
          season: 'All seasons',
          status: 'Available',
          notes: '',
          favorite: 0,
          created_at: now,
          updated_at: now,
          image_url: `/api/garments/${id}/image`,
        },
      },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
