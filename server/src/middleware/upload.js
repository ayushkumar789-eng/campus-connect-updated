import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyFile, sniffBuffer } from '../utils/fileType.js';

export const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

/** Avatars are pictures only — no PDFs in a profile picture slot. */
export const IMAGE_ONLY = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/** Post attachments: images, video or a document, but not a bare .txt. */
export const MEDIA_OR_DOC = new Set([...ACCEPTED_MIME]);

/** Files are held in memory; the storage service decides where they land. */
const memory = multer.memoryStorage();

const limits = { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 6 };

/**
 * Multipart metadata is a claim, not evidence, so the declared MIME type is
 * only used to reject early. The authoritative check is `verifyFile`, which
 * runs on the bytes.
 */
const fileFilter = (_req, file, cb) => {
  if (!ACCEPTED_MIME.has(file.mimetype)) {
    return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
};

export const uploadAvatar = multer({ storage: memory, fileFilter, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
export const uploadMedia = multer({ storage: memory, fileFilter, limits });
export const uploadResource = multer({ storage: memory, fileFilter, limits: { fileSize: limits.fileSize, files: 1 } });

/** Translates a multer failure into our error shape. */
function translateMulterError(err) {
  if (!(err instanceof multer.MulterError)) return err;

  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiError.badRequest(`File is too large. Max size is ${env.MAX_UPLOAD_MB}MB.`);
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return ApiError.badRequest('Too many files in one upload');
  }
  return ApiError.badRequest('Upload failed. Please try a different file.');
}

/**
 * Runs multer and then sniffs every received buffer, rejecting the whole
 * request if any single file fails.
 *
 * Sniffing happens here rather than inside `fileFilter` because `fileFilter`
 * only sees the multipart headers, not the content.
 */
function withVerification(uploader, field, run, allow) {
  return (req, res, next) => {
    run(uploader, field, req, res, async (err) => {
      if (err) return next(translateMulterError(err));

      const files = (req.files ?? []).concat(req.file ? [req.file] : []);
      try {
        for (const file of files) await verifyFile(file, allow ? { allow } : undefined);
      } catch (verifyError) {
        return next(verifyError);
      }

      next();
    });
  };
}

/** Wraps multer so its errors become our ApiError shape. */
export function handleUpload(uploader, field = 'files', allow = MEDIA_OR_DOC) {
  return withVerification(uploader, field, (u, f, rq, rs, done) => u.array(f, limits.files)(rq, rs, done), allow);
}

/** Single-file variant for avatars and note files. */
export function handleSingleUpload(uploader, field = 'file', allow = IMAGE_ONLY) {
  return withVerification(uploader, field, (u, f, rq, rs, done) => u.single(f)(rq, rs, done), allow);
}

/** Exposed for the storage layer, which sets `Content-Type` on what it serves. */
export { sniffBuffer };
