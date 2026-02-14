import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Enable WAL mode for better concurrent read/write performance
prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
