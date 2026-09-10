import { ApiError, SEASONS, assertId, type Garment } from './wardrobe';

export type SuggestionOptions = {
  season: string;
  includeLayer: boolean;
  includeAccessory: boolean;
  lockedIds: string[];
  exclude: string[];
  seed: string;
};
export type OutfitIdea = { key: string; items: Garment[]; reasons: string[] };
export type SavedPiece = {
  garment_id: string;
  name: string;
  category: string;
  color: string;
  status: string;
  image_url: string | null;
};
export type SavedOutfit = {
  id: string;
  name: string;
  notes: string;
  season: string;
  created_at: string;
  items: SavedPiece[];
  wear_dates: string[];
};
export const outfitKey = (ids: string[]) => [...ids].sort().join(':');
export const matchesSeason = (item: Pick<Garment, 'season'>, season: string) =>
  season === 'All seasons' ||
  item.season === 'All seasons' ||
  item.season === season;
const categories = [
  'Tops',
  'Bottoms',
  'Dresses',
  'Shoes',
  'Outerwear',
  'Accessories',
];
const neutrals = new Set(['Black', 'White', 'Gray', 'Navy', 'Brown', 'Beige']);

export function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApiError('Details are required.');
  return input as Record<string, unknown>;
}
export function validateSeason(value: unknown): string {
  if (!(SEASONS as readonly unknown[]).includes(value))
    throw new ApiError('Choose a valid season.');
  return value as string;
}
export function validateIds(input: unknown): string[] {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 5 ||
    input.some((x) => typeof x !== 'string')
  )
    throw new ApiError('Choose between one and five pieces.');
  const ids = input as string[];
  ids.forEach(assertId);
  if (new Set(ids).size !== ids.length)
    throw new ApiError('Each piece can appear only once.');
  return ids;
}
export function validateComposition(
  items: Pick<Garment, 'category'>[],
  complete = true,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!categories.includes(item.category))
      throw new ApiError('Add a category to every piece first.');
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }
  if ([...counts.values()].some((n) => n > 1))
    throw new ApiError('Choose one piece per category.');
  if (counts.has('Dresses') && (counts.has('Tops') || counts.has('Bottoms')))
    throw new ApiError('Choose a dress or a top and bottom.');
  if (
    complete &&
    !counts.has('Dresses') &&
    !(counts.has('Tops') && counts.has('Bottoms'))
  )
    throw new ApiError('Start with a dress or a top and bottom.');
}
export function validateOptions(input: unknown): SuggestionOptions {
  const d = record(input);
  const season = validateSeason(d.season);
  if (
    typeof d.includeLayer !== 'boolean' ||
    typeof d.includeAccessory !== 'boolean'
  )
    throw new ApiError('Choose your layering preferences.');
  const lockedIds =
    Array.isArray(d.lockedIds) && d.lockedIds.length === 0
      ? []
      : validateIds(d.lockedIds);
  if (
    !Array.isArray(d.exclude) ||
    d.exclude.length > 24 ||
    d.exclude.some((x) => typeof x !== 'string' || x.length > 200)
  )
    throw new ApiError('Invalid previous suggestions.');
  if (typeof d.seed !== 'string' || d.seed.length > 64 || !d.seed.length)
    throw new ApiError('Invalid suggestion request.');
  return {
    season,
    includeLayer: d.includeLayer,
    includeAccessory: d.includeAccessory,
    lockedIds,
    exclude: d.exclude,
    seed: d.seed,
  };
}
function noise(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}
function pairScore(a: string, b: string) {
  if (a === 'Unknown' || b === 'Unknown') return 0;
  if (a === b && a !== 'Multicolor') return 3;
  if (neutrals.has(a) && neutrals.has(b)) return 2.5;
  if (neutrals.has(a) || neutrals.has(b)) return 2;
  return -0.5;
}
function score(items: Garment[], seed: string) {
  let color = 0,
    pairs = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      color += pairScore(items[i].color, items[j].color);
      pairs++;
    }
  return (
    color / Math.max(pairs, 1) +
    items.filter((i) => i.favorite).length / items.length +
    noise(seed + outfitKey(items.map((i) => i.id))) * 1.5
  );
}
export function describeOutfit(
  items: Pick<Garment, 'color' | 'favorite' | 'category'>[],
): string[] {
  const known = items.map((i) => i.color).filter((c) => c !== 'Unknown');
  const reasons: string[] = [];
  if (known.length >= 2 && known.every((c) => neutrals.has(c)))
    reasons.push('A neutral palette keeps the pieces easy to combine.');
  else if (
    known.length >= 2 &&
    new Set(known).size === 1 &&
    known[0] !== 'Multicolor'
  )
    reasons.push('Repeating one color gives this look a tonal feel.');
  else if (
    known.some((c) => neutrals.has(c)) &&
    known.some((c) => !neutrals.has(c))
  )
    reasons.push('Neutral pieces give the color room to stand out.');
  else reasons.push('A starting combination from your categorized pieces.');
  if (items.some((i) => i.favorite))
    reasons.push('Includes a piece you’ve favorited.');
  if (!items.some((i) => i.category === 'Shoes'))
    reasons.push('Finish with shoes — none are included in this look.');
  if (items.some((i) => i.color === 'Unknown'))
    reasons.push('Add missing colors for better palette matching.');
  return reasons;
}

export function generateOutfits(
  wardrobe: Garment[],
  options: SuggestionOptions,
) {
  const available = wardrobe.filter(
    (i) =>
      i.status === 'Available' &&
      categories.includes(i.category) &&
      matchesSeason(i, options.season),
  );
  const locked = options.lockedIds.map((id) =>
    available.find((i) => i.id === id),
  );
  if (locked.some((i) => !i))
    throw new ApiError(
      'A kept piece is unavailable or outside this season. Release it and try again.',
      409,
    );
  const keeps = locked as Garment[];
  validateComposition(keeps, false);
  const pool = (category: string) => {
    const keep = keeps.find((i) => i.category === category);
    return keep
      ? [keep]
      : available
          .filter((i) => i.category === category)
          .sort(
            (a, b) =>
              b.favorite +
              noise(options.seed + b.id) -
              (a.favorite + noise(options.seed + a.id)),
          )
          .slice(0, 32);
  };
  let candidates: Garment[][] = [];
  if (!keeps.some((i) => i.category === 'Dresses'))
    for (const top of pool('Tops'))
      for (const bottom of pool('Bottoms')) candidates.push([top, bottom]);
  if (!keeps.some((i) => i.category === 'Tops' || i.category === 'Bottoms'))
    candidates.push(...pool('Dresses').map((d) => [d]));
  const warnings: string[] = [];
  const unsorted = wardrobe.filter(
    (i) => i.status === 'Available' && i.category === 'Unsorted',
  ).length;
  if (unsorted)
    warnings.push(
      `${unsorted} ${unsorted === 1 ? 'piece needs a category' : 'pieces need categories'} before we can use them. Open your wardrobe to add details.`,
    );
  const rank = (values: Garment[][]) =>
    values
      .sort((a, b) => score(b, options.seed) - score(a, options.seed))
      .slice(0, 160);
  candidates = rank(candidates);
  for (const category of ['Shoes', 'Outerwear', 'Accessories']) {
    const enabled =
      category === 'Shoes' ||
      keeps.some((i) => i.category === category) ||
      (category === 'Outerwear'
        ? options.includeLayer
        : options.includeAccessory);
    if (!enabled) continue;
    const choices = pool(category).slice(0, 16);
    if (!choices.length) {
      warnings.push(
        category === 'Shoes'
          ? 'No available shoes match this season. These ideas leave footwear for you to finish.'
          : `No available ${category.toLowerCase()} match this season.`,
      );
      continue;
    }
    candidates = rank(
      candidates.flatMap((base) => choices.map((i) => [...base, i])),
    );
  }
  if (!candidates.length)
    warnings.push(
      'To start an outfit, add an available top and bottom, or a dress, for this season.',
    );
  const remaining = candidates.filter(
    (c) => !options.exclude.includes(outfitKey(c.map((i) => i.id))),
  );
  if (candidates.length && !remaining.length)
    warnings.push(
      'You’ve seen the current combinations. Change the season, release a kept piece, or start again.',
    );
  const chosen: Garment[][] = [];
  while (remaining.length && chosen.length < 3) {
    // Encourage alternatives to use different pieces rather than only changing a shoe.
    remaining.sort((a, b) => {
      const diverseScore = (items: Garment[]) =>
        score(items, options.seed) -
        chosen.reduce(
          (sum, look) =>
            sum +
            items.filter(
              (i) =>
                look.some((x) => x.id === i.id) &&
                !options.lockedIds.includes(i.id),
            ).length *
              2,
          0,
        );
      return diverseScore(b) - diverseScore(a);
    });
    chosen.push(remaining.shift()!);
  }
  return {
    ideas: chosen.map((items) => ({
      key: outfitKey(items.map((i) => i.id)),
      items,
      reasons: describeOutfit(items),
    })),
    warnings,
    eligibleCount: available.length,
    engine: 'wardrobe-rules' as const,
  };
}

export function validateWearDate(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input))
    throw new ApiError('Choose a valid wear date.');
  const date = new Date(input + 'T12:00:00Z');
  // Tomorrow UTC can already be today in the user's timezone.
  const latest = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input ||
    input < '1970-01-01' ||
    input > latest
  )
    throw new ApiError('Choose today or a past date.');
  return input;
}
