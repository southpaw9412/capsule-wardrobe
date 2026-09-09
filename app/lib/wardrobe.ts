export const CATEGORIES = [
  'Unsorted',
  'Tops',
  'Bottoms',
  'Dresses',
  'Shoes',
  'Outerwear',
  'Accessories',
] as const;
export const COLORS = [
  'Unknown',
  'Black',
  'White',
  'Gray',
  'Blue',
  'Navy',
  'Brown',
  'Beige',
  'Green',
  'Red',
  'Pink',
  'Purple',
  'Yellow',
  'Orange',
  'Multicolor',
] as const;
export const SEASONS = [
  'All seasons',
  'Spring / summer',
  'Fall / winter',
] as const;
export const STATUSES = ['Available', 'In laundry', 'Archived'] as const;
export interface Garment {
  id: string;
  name: string;
  category: string;
  color: string;
  season: string;
  status: string;
  notes: string;
  favorite: number;
  created_at: string;
  updated_at: string;
  image_url: string;
}
export type GarmentDetails = Pick<
  Garment,
  'name' | 'category' | 'color' | 'season' | 'status' | 'notes' | 'favorite'
>;
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function validateDetails(input: unknown): GarmentDetails {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApiError('Item details are required.');
  const d = input as Record<string, unknown>;
  if (
    typeof d.name !== 'string' ||
    !d.name.trim() ||
    d.name.trim().length > 100
  )
    throw new ApiError('Use an item name between 1 and 100 characters.');
  for (const [field, values] of [
    ['category', CATEGORIES],
    ['color', COLORS],
    ['season', SEASONS],
    ['status', STATUSES],
  ] as const) {
    if (
      typeof d[field] !== 'string' ||
      !(values as readonly string[]).includes(d[field] as string)
    )
      throw new ApiError(`Choose a valid ${field}.`);
  }
  if (typeof d.notes !== 'string' || d.notes.length > 1000)
    throw new ApiError('Notes must be under 1,000 characters.');
  if (d.favorite !== 0 && d.favorite !== 1)
    throw new ApiError('Choose a valid favorite value.');
  return {
    name: d.name.trim(),
    category: d.category as string,
    color: d.color as string,
    season: d.season as string,
    status: d.status as string,
    notes: d.notes.trim(),
    favorite: d.favorite,
  };
}
export function imageType(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return 'image/jpeg';
  if (
    b.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
  )
    return 'image/png';
  if (
    b.length > 12 &&
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export function assertId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new ApiError('Invalid item ID.');
}
