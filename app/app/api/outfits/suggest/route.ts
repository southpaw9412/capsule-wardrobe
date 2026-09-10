import { owner, json, failure, readJson } from '@/lib/server';
import { generateOutfits, validateOptions } from '@/lib/outfits';
import { wardrobeForOwner } from '@/lib/outfit-server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const uid = await owner(request, true);
    const options = validateOptions(await readJson(request));
    return json(generateOutfits(await wardrobeForOwner(uid), options));
  } catch (e) {
    return failure(e);
  }
}
