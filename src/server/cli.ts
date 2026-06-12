#!/usr/bin/env node
// src/server/cli.ts
// npm bin entry point (`npx iread`). Parses flags into the PORT/DB_PATH env
// vars the server reads, defaults NODE_ENV to production so index.ts serves
// the bundled web app, then imports ./index.js which opens the DB and starts
// listening. Plain `pnpm start`/`node dist/server/index.js` still works.

import { readFile } from 'node:fs/promises';

// node:sqlite emits an ExperimentalWarning. The package.json scripts pass
// --disable-warning=ExperimentalWarning, but a bin shebang cannot carry node
// flags portably, so filter that warning here before ./db.js loads the module.
const emitWarning = process.emitWarning.bind(process) as (...args: unknown[]) => void;
process.emitWarning = ((warning: unknown, ...rest: unknown[]) => {
  const second = rest[0];
  const type =
    typeof second === 'string'
      ? second
      : second !== null && typeof second === 'object' && 'type' in second
        ? String((second as { type?: unknown }).type)
        : warning instanceof Error
          ? warning.name
          : undefined;
  if (type === 'ExperimentalWarning') return;
  emitWarning(warning, ...rest);
}) as typeof process.emitWarning;

const HELP = `iread — local, single-user RSS/Atom reader

Usage: iread [options]

Options:
  -p, --port <port>  Port to listen on (default: $PORT or 8787)
      --db <path>    SQLite database file
                     (default: $DB_PATH or ~/.config/iread/iread.db)
  -v, --version      Print the version and exit
  -h, --help         Show this help and exit
`;

function fail(message: string): never {
  console.error(`iread: ${message}\n\n${HELP}`);
  process.exit(1);
}

async function printVersion(): Promise<never> {
  // Emitted file is dist/server/cli.js; package.json sits two levels up at the
  // package root (same relative position when run from src/ via tsx).
  const raw = await readFile(new URL('../../package.json', import.meta.url), 'utf-8');
  const pkg = JSON.parse(raw) as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '-h':
    case '--help':
      console.log(HELP);
      process.exit(0);
      break;
    case '-v':
    case '--version':
      await printVersion();
      break;
    case '-p':
    case '--port': {
      const value = args[++i];
      if (!value || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 65535) {
        fail(`${arg} requires a port number (0-65535)`);
      }
      process.env.PORT = value;
      break;
    }
    case '--db': {
      const value = args[++i];
      if (!value) fail('--db requires a file path');
      process.env.DB_PATH = value;
      break;
    }
    default:
      fail(`unknown option: ${arg}`);
  }
}

// Serve the prebuilt web bundle unless the caller explicitly set NODE_ENV.
process.env.NODE_ENV ??= 'production';

await import('./index.js');
