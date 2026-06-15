import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Feed } from '../shared/types.js';
import { dbPath } from './db.js';
import { exportOpml } from './opml.js';

function resolveMirrorPath(): string | null {
  const override = process.env.OPML_PATH;
  if (override !== undefined) {
    const trimmed = override.trim();
    return trimmed === '' ? null : resolve(process.cwd(), trimmed);
  }
  return join(dirname(dbPath), 'feeds.opml');
}

export const opmlMirrorPath = resolveMirrorPath();

function withoutDateCreated(xml: string): string {
  return xml.replace(/[ \t]*<dateCreated>.*?<\/dateCreated>\r?\n?/, '');
}

export function writeOpmlSnapshot(feeds: Feed[]): void {
  if (!opmlMirrorPath) return;
  try {
    const xml = exportOpml(feeds);
    let existing: string | null = null;
    try {
      existing = readFileSync(opmlMirrorPath, 'utf-8');
    } catch {
      existing = null;
    }
    if (existing !== null && withoutDateCreated(existing) === withoutDateCreated(xml)) {
      return;
    }
    mkdirSync(dirname(opmlMirrorPath), { recursive: true });
    const tmp = `${opmlMirrorPath}.tmp`;
    writeFileSync(tmp, xml, 'utf-8');
    renameSync(tmp, opmlMirrorPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[iread] could not write OPML mirror at ${opmlMirrorPath}: ${message}`);
  }
}
