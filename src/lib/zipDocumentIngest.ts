/**
 * P3: Expand zip / multi-file selection into uploadable files for property docs.
 * External systems later = connectors; this path keeps data inside Liljeblads.
 */
import JSZip from 'jszip';

export const INGEST_MAX_FILES = 40;
export const INGEST_MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const INGEST_MAX_ZIP_BYTES = 80 * 1024 * 1024; // 80 MB zip

const ALLOWED_EXT = new Set([
  'pdf',
  'txt',
  'md',
  'csv',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

export type ExpandedIngestFile = {
  file: File;
  relativePath: string;
};

export type ExpandResult = {
  files: ExpandedIngestFile[];
  skipped: Array<{ name: string; reason: string }>;
  source: 'upload' | 'zip' | 'folder';
};

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase();
}

function isAllowedName(name: string): boolean {
  const base = name.split('/').pop() || name;
  if (!base || base.startsWith('.')) return false;
  if (name.includes('__MACOSX')) return false;
  if (base === 'Thumbs.db' || base === 'desktop.ini') return false;
  return ALLOWED_EXT.has(extOf(base));
}

function mimeFor(name: string): string {
  const e = extOf(name);
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  return map[e] || 'application/octet-stream';
}

/** Expand a FileList/array that may include .zip archives into flat files. */
export async function expandIngestFiles(
  input: File[] | FileList,
): Promise<ExpandResult> {
  const list = Array.from(input);
  const files: ExpandedIngestFile[] = [];
  const skipped: ExpandResult['skipped'] = [];
  let source: ExpandResult['source'] = 'upload';

  for (const raw of list) {
    const name = raw.name || 'fil';
    const isZip =
      extOf(name) === 'zip' ||
      raw.type === 'application/zip' ||
      raw.type === 'application/x-zip-compressed';

    if (isZip) {
      source = 'zip';
      if (raw.size > INGEST_MAX_ZIP_BYTES) {
        skipped.push({
          name,
          reason: `Zip för stor (max ${INGEST_MAX_ZIP_BYTES / 1024 / 1024} MB)`,
        });
        continue;
      }
      try {
        const zip = await JSZip.loadAsync(raw);
        const entries = Object.keys(zip.files);
        for (const path of entries) {
          const entry = zip.files[path];
          if (!entry || entry.dir) continue;
          if (!isAllowedName(path)) {
            skipped.push({ name: path, reason: 'Filtyp eller systemfil hoppas över' });
            continue;
          }
          if (files.length >= INGEST_MAX_FILES) {
            skipped.push({ name: path, reason: `Max ${INGEST_MAX_FILES} filer per batch` });
            continue;
          }
          const blob = await entry.async('blob');
          if (blob.size > INGEST_MAX_FILE_BYTES) {
            skipped.push({
              name: path,
              reason: `Fil för stor (max ${INGEST_MAX_FILE_BYTES / 1024 / 1024} MB)`,
            });
            continue;
          }
          const base = path.split('/').pop() || path;
          const file = new File([blob], base, {
            type: mimeFor(base),
            lastModified: Date.now(),
          });
          files.push({ file, relativePath: path.replace(/\\/g, '/') });
        }
      } catch (e) {
        skipped.push({
          name,
          reason: e instanceof Error ? e.message : 'Kunde inte läsa zip',
        });
      }
      continue;
    }

    // Regular file
    if (!isAllowedName(name)) {
      skipped.push({ name, reason: 'Filtyp stöds inte' });
      continue;
    }
    if (raw.size > INGEST_MAX_FILE_BYTES) {
      skipped.push({
        name,
        reason: `Fil för stor (max ${INGEST_MAX_FILE_BYTES / 1024 / 1024} MB)`,
      });
      continue;
    }
    if (files.length >= INGEST_MAX_FILES) {
      skipped.push({ name, reason: `Max ${INGEST_MAX_FILES} filer per batch` });
      continue;
    }
    // webkitRelativePath when folder selected
    const rel =
      (raw as File & { webkitRelativePath?: string }).webkitRelativePath || name;
    if (rel.includes('/')) source = 'folder';
    files.push({ file: raw, relativePath: rel.replace(/\\/g, '/') });
  }

  return { files, skipped, source };
}

export const INGEST_ACCEPT =
  '.pdf,.txt,.md,.csv,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.zip,application/pdf,application/zip';
