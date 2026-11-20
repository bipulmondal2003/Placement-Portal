import { extname } from 'path';

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_FILES_PER_STUDENT = 20;

export type AllowedMime = 'application/pdf' | 'image/png' | 'image/jpeg';

/** Identifies the file from its leading bytes. The client-supplied type and extension are ignored. */
export function detectFileType(buf: Buffer): { mime: AllowedMime; ext: string } | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  return null;
}

/** Display-safe file name: no paths, no control or markup characters, correct extension, bounded length. */
export function safeFileName(original: string, ext: string): string {
  const base = String(original ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!;
  const stem = base
    .slice(0, base.length - extname(base).length)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^\w .()\-]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${stem || 'certificate'}${ext}`;
}
