import { createReadStream, createWriteStream, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join, resolve, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';

const ROOT = resolve(config.audio.dir);
mkdirSync(ROOT, { recursive: true });

/**
 * Map of mime types we accept → file extension to use on disk. Browsers
 * report variations; we normalise here. Anything else we still save with
 * a `.bin` extension and trust the stored mime type.
 */
const MIME_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mp4;codecs=mp4a.40.2': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

function extFor(mime: string, fallbackFilename?: string): string {
  const lower = mime.toLowerCase();
  if (MIME_EXT[lower]) return MIME_EXT[lower]!;
  const base = lower.split(';')[0]?.trim();
  if (base && MIME_EXT[base]) return MIME_EXT[base]!;
  if (fallbackFilename) {
    const ext = extname(fallbackFilename).replace(/^\./, '');
    if (ext) return ext.toLowerCase();
  }
  return 'bin';
}

/**
 * Returns a safe file path inside ROOT, anchored to the phone subfolder,
 * with a collision-resistant ISO + random suffix. Eg:
 *   /app/data/audio/919427677680/2026-05-14T18-22-09-3f9a2c.webm
 */
function makePath(phone: string, mimeType: string, fallbackFilename?: string): {
  absolute: string;
  relative: string;
} {
  const safePhone = phone.replace(/[^0-9]/g, '');
  if (!safePhone) throw new Error('invalid phone for audio path');

  const dir = join(ROOT, safePhone);
  mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = randomBytes(3).toString('hex');
  const ext = extFor(mimeType, fallbackFilename);
  const file = `${ts}-${rand}.${ext}`;

  const absolute = join(dir, file);
  const rel = relative(ROOT, absolute).split(sep).join('/');
  return { absolute, relative: rel };
}

export interface SavedAudio {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Stream an incoming audio body into ROOT and return file metadata.
 */
export async function saveAudio(
  phone: string,
  body: NodeJS.ReadableStream,
  mimeType: string,
  fallbackFilename?: string
): Promise<SavedAudio> {
  const { absolute, relative: rel } = makePath(phone, mimeType, fallbackFilename);
  const out = createWriteStream(absolute);
  await pipeline(body, out);
  const { size } = statSync(absolute);
  return {
    relativePath: rel,
    absolutePath: absolute,
    sizeBytes: size,
    mimeType,
  };
}

/**
 * Resolve a stored relative path back to its absolute path inside ROOT.
 * Guards against path traversal — any input that would escape ROOT throws.
 */
export function resolveAudioPath(relativePath: string): string {
  const abs = resolve(ROOT, relativePath);
  const r = relative(ROOT, abs);
  if (r.startsWith('..') || r.startsWith(sep + '..')) {
    throw new Error('path escape attempt');
  }
  return abs;
}

export function openAudioStream(relativePath: string): NodeJS.ReadableStream {
  return createReadStream(resolveAudioPath(relativePath));
}

export function audioStat(relativePath: string) {
  return statSync(resolveAudioPath(relativePath));
}

export function deleteAudio(relativePath: string): void {
  try {
    unlinkSync(resolveAudioPath(relativePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
