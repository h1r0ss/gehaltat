import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Strict reader for files our own scripts write (one JSON object per line, last line wins per key).
export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

// Tolerant reader for agent-written files: keeps line numbers and reports bad lines instead of throwing.
export function readJsonlLoose(path) {
  const rows = [];
  const errors = [];
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (!line.trim()) return;
      try {
        rows.push({ value: JSON.parse(line), line: index + 1 });
      } catch (error) {
        errors.push({ line: index + 1, message: error.message });
      }
    });
  return { rows, errors };
}

export function writeJsonl(path, rows) {
  writeAtomic(path, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

export function writeJson(path, value) {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function listFiles(dir, extension) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => join(dir, name));
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}
