/**
 * Extension → Content-Type for the static upload route.
 *
 * The point of this table is that it is *closed*: an extension that is not
 * listed is served as `application/octet-stream` and forced to download. That
 * makes it impossible for an uploaded file with an unexpected extension to be
 * handed a Content-Type the browser will render — which is the whole stored-XSS
 * risk when serving user-supplied bytes from your own origin.
 *
 * Notably absent: `html`, `htm`, `xhtml`, `svg`, `xml`, `js`, `mjs`. None of
 * those are accepted uploads, and if one ever appears on disk it is downloaded,
 * not executed.
 */
export const MIME_BY_PUBLIC_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};
