import fs from 'fs';

// Evidence files are identified by their leading bytes, never by the filename or
// the MIME type the browser claimed, both of which the uploader controls.
const READ_BYTES = 16;

const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    mime: 'image/gif',
    test: (b) => b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a'
  },
  {
    mime: 'image/webp',
    test: (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' }
];

// Returns the detected MIME type, or null when the bytes match nothing allowed.
export async function detectFileType(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, READ_BYTES, 0);
    const head = buffer.subarray(0, bytesRead);
    const match = SIGNATURES.find((signature) => signature.test(head));
    return match ? match.mime : null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

// A display name only: the stored file on disk is named by multer's random id,
// so this never influences the path. Path separators and control characters are
// stripped so the name stays safe in headers and tables.
export function sanitizeFileName(name) {
  const cleaned = String(name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'evidence';
}
