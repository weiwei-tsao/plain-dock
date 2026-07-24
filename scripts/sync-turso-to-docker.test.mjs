import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBackupIfExists, loadEnvFile, resolveConfig } from './sync-turso-to-docker.mjs';

test('resolveConfig requires TURSO_DATABASE_URL', () => {
  assert.throws(
    () => resolveConfig({ TURSO_AUTH_TOKEN: 'token' }, '/repo'),
    /TURSO_DATABASE_URL is required/,
  );
});

test('resolveConfig requires TURSO_AUTH_TOKEN', () => {
  assert.throws(
    () => resolveConfig({ TURSO_DATABASE_URL: 'libsql://example.turso.io' }, '/repo'),
    /TURSO_AUTH_TOKEN is required/,
  );
});

test('resolveConfig defaults Docker database path to data/notes.db', () => {
  const config = resolveConfig(
    {
      TURSO_DATABASE_URL: 'libsql://example.turso.io',
      TURSO_AUTH_TOKEN: 'token',
    },
    '/repo',
  );

  assert.equal(config.targetDatabasePath, path.join('/repo', 'data', 'notes.db'));
  assert.equal(config.targetDatabaseUrl, `file:${path.join('/repo', 'data', 'notes.db')}`);
  assert.equal(config.backupDir, path.join('/repo', 'data', 'backups'));
});

test('loadEnvFile reads quoted values from .env and preserves shell overrides', async () => {
  const root = path.join(tmpdir(), `plaindock-env-${Date.now()}`);
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, '.env'),
    [
      '# Turso sync settings',
      'TURSO_DATABASE_URL="libsql://from-env.turso.io"',
      'TURSO_AUTH_TOKEN="from-env-token"',
      'DOCKER_DATABASE_PATH="./custom.db"',
      '',
    ].join('\n'),
  );

  const env = await loadEnvFile(root, { TURSO_AUTH_TOKEN: 'from-shell-token' });

  assert.equal(env.TURSO_DATABASE_URL, 'libsql://from-env.turso.io');
  assert.equal(env.TURSO_AUTH_TOKEN, 'from-shell-token');
  assert.equal(env.DOCKER_DATABASE_PATH, './custom.db');

  await rm(root, { recursive: true, force: true });
});

test('loadEnvFile tolerates a missing .env file', async () => {
  const root = path.join(tmpdir(), `plaindock-env-missing-${Date.now()}`);

  const env = await loadEnvFile(root, { TURSO_AUTH_TOKEN: 'token' });

  assert.deepEqual(env, { TURSO_AUTH_TOKEN: 'token' });
});

test('createBackupIfExists copies an existing database into data/backups', async () => {
  const root = path.join(tmpdir(), `plaindock-sync-${Date.now()}`);
  const databasePath = path.join(root, 'data', 'notes.db');
  const now = new Date('2026-07-23T12:34:56Z');

  await mkdir(path.dirname(databasePath), { recursive: true });
  await writeFile(databasePath, 'sqlite bytes');

  const backupPath = await createBackupIfExists(databasePath, now);

  assert.equal(backupPath, path.join(root, 'data', 'backups', 'notes-20260723-123456.db'));
  assert.equal(await readFile(backupPath, 'utf8'), 'sqlite bytes');

  await rm(root, { recursive: true, force: true });
});

test('createBackupIfExists copies SQLite WAL sidecar files when present', async () => {
  const root = path.join(tmpdir(), `plaindock-sync-sidecars-${Date.now()}`);
  const databasePath = path.join(root, 'data', 'notes.db');
  const now = new Date('2026-07-23T12:34:56Z');

  await mkdir(path.dirname(databasePath), { recursive: true });
  await writeFile(databasePath, 'sqlite bytes');
  await writeFile(`${databasePath}-wal`, 'wal bytes');
  await writeFile(`${databasePath}-shm`, 'shm bytes');

  const backupPath = await createBackupIfExists(databasePath, now);

  assert.equal(await readFile(backupPath, 'utf8'), 'sqlite bytes');
  assert.equal(await readFile(`${backupPath}-wal`, 'utf8'), 'wal bytes');
  assert.equal(await readFile(`${backupPath}-shm`, 'utf8'), 'shm bytes');

  await rm(root, { recursive: true, force: true });
});

test('createBackupIfExists returns null when database does not exist', async () => {
  const root = path.join(tmpdir(), `plaindock-sync-missing-${Date.now()}`);
  const databasePath = path.join(root, 'data', 'notes.db');

  const backupPath = await createBackupIfExists(databasePath, new Date('2026-07-23T12:34:56Z'));

  assert.equal(backupPath, null);
});

test('package exposes the manual Docker sync command', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(
    packageJson.scripts['docker:sync-from-turso'],
    'node scripts/sync-turso-to-docker.mjs',
  );
});
