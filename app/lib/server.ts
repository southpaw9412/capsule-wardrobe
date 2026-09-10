import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ApiError } from './wardrobe';
export const db = () => env.DB;
export const files = () => env.FILES;
export async function readJson(request: Request) {
  const raw = await limitedBody(request, 16384);
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new ApiError('Send valid details.');
  }
}
export async function owner(request: Request, write = false): Promise<string> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError('Please sign in to access your wardrobe.', 401);
  if (write) {
    const origin = request.headers.get('origin');
    if (
      !origin ||
      origin !== new URL(request.url).origin ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new ApiError('This request must come from your wardrobe.', 403);
  }
  return user.userId;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  console.error(
    'Wardrobe request failed',
    error instanceof Error ? error.message : 'Unknown error',
  );
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}
export async function limitedBody(request: Request, max: number) {
  const length = Number(request.headers.get('content-length'));
  if (length > max) throw new ApiError('This file is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('An upload is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError('This file is too large.', 413);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
