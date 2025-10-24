import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const index = trimmed.indexOf('=');
  if (index === -1) {
    return null;
  }
  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1).trim();
  const unquoted = value.replace(/^['"]|['"]$/g, '');
  return [key, unquoted];
}

export function loadEnvFile(fileName = '.env') {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }
  const contents = readFileSync(filePath, 'utf8');
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) continue;
    const [key, value] = entry;
    if (value === '') {
      continue;
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
