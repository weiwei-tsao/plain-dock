import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export async function loadEnvFile(cwd = process.cwd(), baseEnv = process.env) {
  const envPath = path.join(cwd, '.env');

  let raw;
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    return { ...baseEnv };
  }

  const parsed = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key) continue;

    parsed[key] = parseEnvValue(trimmed.slice(equalsIndex + 1));
  }

  return { ...parsed, ...baseEnv };
}

export function resolveConfig(env = process.env, cwd = process.cwd()) {
  const sourceDatabaseUrl = env.TURSO_DATABASE_URL;
  if (!sourceDatabaseUrl) {
    throw new Error('TURSO_DATABASE_URL is required to sync from Turso.');
  }

  const sourceAuthToken = env.TURSO_AUTH_TOKEN;
  if (!sourceAuthToken) {
    throw new Error('TURSO_AUTH_TOKEN is required to sync from Turso.');
  }

  const targetDatabasePath = path.resolve(cwd, env.DOCKER_DATABASE_PATH ?? './data/notes.db');
  const backupDir = path.join(path.dirname(targetDatabasePath), 'backups');

  return {
    sourceDatabaseUrl,
    sourceAuthToken,
    targetDatabasePath,
    targetDatabaseUrl: `file:${targetDatabasePath}`,
    backupDir,
  };
}

export async function createBackupIfExists(databasePath, now = new Date()) {
  try {
    await access(databasePath);
  } catch {
    return null;
  }

  const backupDir = path.join(path.dirname(databasePath), 'backups');
  await mkdir(backupDir, { recursive: true });

  const backupPath = path.join(backupDir, `notes-${formatTimestamp(now)}.db`);
  await copyFile(databasePath, backupPath);

  for (const suffix of ['-wal', '-shm']) {
    try {
      await access(`${databasePath}${suffix}`);
    } catch {
      continue;
    }

    await copyFile(`${databasePath}${suffix}`, `${backupPath}${suffix}`);
  }

  return backupPath;
}

function runPrismaMigrateDeploy(targetDatabaseUrl, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        cwd,
        env: { ...process.env, DATABASE_URL: targetDatabaseUrl },
        stdio: 'inherit',
      },
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`prisma migrate deploy failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

function createSourceClient(config) {
  const adapter = new PrismaLibSQL({
    url: config.sourceDatabaseUrl,
    authToken: config.sourceAuthToken,
  });

  return new PrismaClient({ adapter });
}

function createTargetClient(config) {
  return new PrismaClient({
    datasources: {
      db: {
        url: config.targetDatabaseUrl,
      },
    },
  });
}

async function readSourceSnapshot(source) {
  const [folders, notes] = await source.$transaction([
    source.folder.findMany({ orderBy: { createdAt: 'asc' } }),
    source.note.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  return { folders, notes };
}

async function replaceTargetData(target, snapshot) {
  await target.$transaction(async (tx) => {
    await tx.note.deleteMany();
    await tx.folder.deleteMany();

    for (const folder of snapshot.folders) {
      await tx.folder.create({
        data: {
          id: folder.id,
          name: folder.name,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        },
      });
    }

    for (const note of snapshot.notes) {
      await tx.note.create({
        data: {
          id: note.id,
          title: note.title,
          content: note.content,
          textContent: note.textContent,
          mode: note.mode,
          isPinned: note.isPinned,
          folderId: note.folderId,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
      });
    }
  });
}

export async function runCli() {
  const env = await loadEnvFile();
  const config = resolveConfig(env);
  await mkdir(path.dirname(config.targetDatabasePath), { recursive: true });

  console.log('Syncing PlainDock data from Turso to Docker SQLite.');
  console.log(`Target database: ${config.targetDatabasePath}`);
  console.log('If the Docker container is running, stop it before syncing to avoid concurrent writes.');

  const backupPath = await createBackupIfExists(config.targetDatabasePath);
  if (backupPath) {
    console.log(`Backup created: ${backupPath}`);
  } else {
    console.log('No existing Docker database found; backup skipped.');
  }

  console.log('Preparing local SQLite schema...');
  await runPrismaMigrateDeploy(config.targetDatabaseUrl, process.cwd());

  const source = createSourceClient(config);
  const target = createTargetClient(config);

  try {
    console.log('Reading Turso snapshot...');
    const snapshot = await readSourceSnapshot(source);

    console.log('Replacing local Docker data...');
    await replaceTargetData(target, snapshot);

    console.log(
      `Sync complete. Imported ${snapshot.folders.length} folders and ${snapshot.notes.length} notes.`,
    );
  } finally {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
