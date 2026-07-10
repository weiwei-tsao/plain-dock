import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLibSqlUrl = databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://');

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (!isLibSqlUrl) {
    return new PrismaClient();
  }

  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is required when DATABASE_URL uses libSQL/Turso.');
  }

  const adapter = new PrismaLibSQL({
    url: databaseUrl,
    authToken,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Enable WAL mode for local file-backed SQLite. Turso/libSQL is remote and does not use this pragma.
if (!isLibSqlUrl) {
  prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
}
