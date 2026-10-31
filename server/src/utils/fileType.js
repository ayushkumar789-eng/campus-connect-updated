import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from '../utils/ApiError.js';

const TEXTUAL = new Set(['text/plain']);

const NEVER_INLINE = new Set([
  'text/plain',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return suspicious / Math.max(sample.length, 1) < 0.05;
}

export async function sniffBuffer(buffer) {
  if (!buffer?.length) return null;

  const detected = await fileTypeFromBuffer(buffer);
  if (detected) return { mime: detected.mime, ext: detected.ext };

  if (looksLikeText(buffer)) return { mime: 'text/plain', ext: 'txt' };

  return null;
}

export function contentDisposition(mime) {
  return NEVER_INLINE.has(mime) ? 'attachment' : 'inline';
}

export async function verifyFile(file, opts = {}) {
  const detected = await sniffBuffer(file.buffer);
  if (!detected) {
    throw ApiError.badRequest('That file type is not supported');
  }

  const allowed = opts.allow;
  if (allowed && !allowed.has(detected.mime)) {
    throw ApiError.badRequest(
      `Unsupported file type. Allowed here: ${[...allowed].join(', ')}.`
    );
  }

  if (TEXTUAL.has(detected.mime) && !looksLikeText(file.buffer)) {
    throw ApiError.badRequest('That file is not valid text');
  }

  file.detectedMime = detected.mime;
  file.mimetype = detected.mime;
  file.detectedExt = detected.ext;
  file.originalname = `${sanitiseStem(file.originalname)}.${detected.ext}`;

  return file;
}

export { TEXTUAL, NEVER_INLINE };

export function sanitiseStem(name = '') {
  const stem = String(name)
    .replace(/\.[^.]*$/, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40);
  return stem || 'file';
}

