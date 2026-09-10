import { db } from './server';
import type { Garment } from './wardrobe';
import type { SavedOutfit, SavedPiece } from './outfits';

export async function wardrobeForOwner(uid: string): Promise<Garment[]> {
  const rows = await db()
    .prepare(
      'SELECT id,name,category,color,season,status,notes,favorite,created_at,updated_at FROM garments WHERE owner_id=? AND deleted=0 ORDER BY created_at DESC,id DESC',
    )
    .bind(uid)
    .all<Omit<Garment, 'image_url'>>();
  return rows.results.map((r) => ({
    ...r,
    image_url: `/api/garments/${r.id}/image`,
  }));
}
export async function savedOutfits(uid: string): Promise<SavedOutfit[]> {
  // Batch reads share a database snapshot and every join is constrained to the owner.
  const [looks, pieces, wears] = await db().batch<Record<string, unknown>>([
    db()
      .prepare(
        'SELECT id,name,notes,season,created_at FROM outfits WHERE owner_id=? ORDER BY created_at DESC,id DESC',
      )
      .bind(uid),
    db()
      .prepare(
        `SELECT oi.outfit_id,oi.garment_id,COALESCE(g.name,oi.name) AS name,COALESCE(g.category,oi.category) AS category,COALESCE(g.color,oi.color) AS color,COALESCE(g.status,'Removed') AS status,g.id AS image_id FROM outfit_items oi JOIN outfits o ON o.id=oi.outfit_id LEFT JOIN garments g ON g.id=oi.garment_id AND g.owner_id=o.owner_id AND g.deleted=0 WHERE o.owner_id=? ORDER BY oi.position`,
      )
      .bind(uid),
    db()
      .prepare(
        'SELECT w.outfit_id,w.worn_on FROM outfit_wears w JOIN outfits o ON o.id=w.outfit_id WHERE o.owner_id=? ORDER BY w.worn_on DESC',
      )
      .bind(uid),
  ]);
  const byOutfit = new Map<string, SavedPiece[]>();
  for (const row of pieces.results) {
    const key = String(row.outfit_id);
    const list = byOutfit.get(key) || [];
    list.push({
      garment_id: String(row.garment_id),
      name: String(row.name),
      category: String(row.category),
      color: String(row.color),
      status: String(row.status),
      image_url:
        typeof row.image_id === 'string'
          ? `/api/garments/${row.image_id}/image`
          : null,
    });
    byOutfit.set(key, list);
  }
  return looks.results.map((row) => ({
    ...row,
    items: byOutfit.get(String(row.id)) || [],
    wear_dates: wears.results
      .filter((w) => w.outfit_id === row.id)
      .map((w) => String(w.worn_on)),
  })) as SavedOutfit[];
}
