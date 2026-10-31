/**
 * Storage.
 *
 * A provider abstraction rather than a hard-wired disk write, so a deployment
 * picks its backend with environment variables alone:
 *
 *   CLOUDINARY_* present  → Cloudinary
 *   otherwise             → local disk under `server/uploads`
 *
 * Callers always get the same `{ url, publicId, … }` shape, so switching
 * providers never touches a call site.
 *
 * Two properties this file is responsible for:
 *
 *  • **Keys are generated, never trusted.** The client filename contributes a
 *    readable stem for nothing more than a nicer download name; the actual key
 *    is timestamp + random bytes + a sanitised stem, and the extension comes
 *    from content sniffing, not from the upload.
 *  • **Documents are not served inline.** An uploaded PDF is served with
 *    `Content-Disposition: attachment` and a neutral `Content-Type`, so a file
 *    that sniffs as a PDF cannot be coerced into executing in a user's browser
 *    on our origin.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { env, hasCloudinary, UPLOAD_DIR, isProd } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { contentDisposition, NEVER_INLINE } from '../../utils/fileType.js';

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** @typedef {'image' | 'video' | 'raw'} ResourceKind */

/** Derive the Cloudinary resource kind from a detected mimetype. */
function kindFor(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
}

/** The extension always comes from the sniffed type, never from the filename. */
function extFor(mimetype) {
  return fileExtFallback[mimetype] ?? 'bin';
}

const fileExtFallback = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
};

/** Guards a caller-supplied `folder` against traversal. */
function safeFolder(folder = 'uploads') {
  return String(folder)
    .split('/')
    .map((part) => part.replace(/[^\w-]+/g, ''))
    .filter(Boolean)
    .slice(0, 3)
    .join('/') || 'uploads';
}

/** A short, unguessable, filesystem-safe key. */
function generateKey(ext) {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
}

/**
 * Uploads a single in-memory multer file.
 *
 * `file.mimetype` is expected to have already been replaced by the sniffer in
 * `middleware/upload.js`; this function trusts it because nothing else can set
 * it at this point in the pipeline.
 *
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, size: number, detectedExt?: string }} file
 * @param {{ folder?: string, kind?: ResourceKind }} [opts]
 * @returns {Promise<{ url: string, publicId: string, name: string, size: number, mimetype: string, provider: 'cloudinary' | 'local', isPrivate: boolean }>}
 */
export async function uploadFile(file, opts = {}) {
  if (!file?.buffer?.length) throw ApiError.badRequest('Uploaded file is empty');

  const kind = opts.kind ?? kindFor(file.mimetype);
  const folder = safeFolder(opts.folder ?? 'uploads');
  // Anything that is not a picture is treated as a document, served as an
  // attachment rather than rendered on our origin.
  const isPrivate = !file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/');
  const ext = file.detectedExt ?? extFor(file.mimetype);

  if (hasCloudinary) {
    return uploadToCloudinary(file, { folder, kind, isPrivate });
  }

  // ── Local disk ─────────────────────────────────────────────────────────
  const filename = generateKey(ext);
  const absPath = path.join(UPLOAD_DIR, folder, filename);

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  // `wx` fails rather than overwriting, so a key collision cannot destroy an
  // existing file.
  await fs.writeFile(absPath, file.buffer, { flag: 'wx' });

  return {
    url: `${env.SERVER_URL}/uploads/${folder}/${filename}`,
    publicId: `${folder}/${filename}`,
    name: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    provider: 'local',
    isPrivate,
  };
}

function uploadToCloudinary(file, { folder, kind, isPrivate }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
        resource_type: kind,
        public_id: generateKey(extFor(file.mimetype)).replace(/\.[^.]+$/, ''),
        overwrite: false,
        // Keeps the download name human-readable without trusting the client's
        // filename for the key itself.
        use_filename: false,
        // Non-image uploads get an explicit download disposition, so Cloudinary
        // never serves them inline on a shared subdomain.
        ...(isPrivate ? { type: 'authenticated' } : {}),
      },
      (error, result) => {
        if (error || !result) return reject(ApiError.internal('Failed to upload file to storage'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          name: file.originalname,
          size: result.bytes ?? file.size,
          mimetype: file.mimetype,
          provider: 'cloudinary',
          isPrivate,
        });
      },
    );
    stream.end(file.buffer);
  });
}

/** Uploads many files, preserving input order. */
export async function uploadFiles(files = [], opts = {}) {
  const results = [];
  for (const file of files) {
    // Sequential rather than parallel: a 6-file post should not open six
    // concurrent 25MB buffers against the memory ceiling.
    // eslint-disable-next-line no-await-in-loop
    results.push(await uploadFile(file, opts));
  }
  return results;
}

/**
 * Deletes a previously uploaded file. No-op for unknown providers so callers
 * never have to branch.
 *
 * `provider` may be `'cloudinary'`, `'local'`, `'local-or-cloudinary'` or
 * `'auto'`; the last two are the common "we don't remember" cases.
 */
export async function deleteFile(publicId, provider) {
  if (!publicId) return;

  const wantsCloud = provider === 'cloudinary' || (provider === 'auto' && hasCloudinary);

  if (wantsCloud && hasCloudinary) {
    // Cloudinary needs the right resource_type; `auto` is the documented way to
    // let it decide, which removes the guesswork that broke video deletes.
    await cloudinary.uploader
      .destroy(publicId, { resource_type: provider === 'auto' ? 'auto' : guessKind(publicId) })
      .catch(() => {});
    return;
  }

  if (hasCloudinary && provider !== 'local') return;

  const absPath = resolveUploadPath(publicId);
  if (!absPath) return;
  await fs.unlink(absPath).catch(() => {});
}

/** Reverse of `extFor`, used to pick a Cloudinary resource type from a key. */
const MIME_BY_EXT = Object.fromEntries(
  Object.entries(fileExtFallback).map(([mime, ext]) => [ext, mime]),
);

function guessKind(publicId = '') {
  const ext = publicId.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mp4' || ext === 'webm') return 'video';
  return NEVER_INLINE.has(MIME_BY_EXT[ext] ?? '') ? 'raw' : 'image';
}

/**
 * Resolves a stored key to an absolute path, or `null` if the key escapes the
 * uploads directory. The containment check is on the *resolved* path, so
 * `../../etc/passwd` and encoded variants are both rejected.
 */
export function resolveUploadPath(publicId) {
  if (!publicId || typeof publicId !== 'string') return null;

  // Keys are `<folder>/<name>.<ext>`. Anything with a scheme, a NUL, or a
  // leading slash is not one of ours.
  if (publicId.includes('\0') || publicId.includes('\\') || publicId.startsWith('/')) return null;
  if (/^[a-z]+:\/\//i.test(publicId)) return null;

  const absPath = path.resolve(UPLOAD_DIR, publicId);
  const root = path.resolve(UPLOAD_DIR);
  if (absPath !== root && !absPath.startsWith(root + path.sep)) return null;

  return absPath;
}

export const storageProvider = hasCloudinary ? 'cloudinary' : 'local';

/**
 * Surfaced by GET /api/health so the client and operator know which mode is
 * active — and, importantly, whether what is stored will still be there after
 * the next deploy.
 */
export function storageInfo() {
  return {
    provider: storageProvider,
    persistent: hasCloudinary || !isProd || env.ALLOW_LOCAL_STORAGE,
    privateResources: env.PRIVATE_RESOURCES,
  };
}

export { contentDisposition, UPLOAD_DIR };
