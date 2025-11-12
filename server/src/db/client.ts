import { PrismaClient } from '@prisma/client';

export const prisma: PrismaClient | null = process.env.DATABASE_URL ? new PrismaClient() : null;

export async function ensureDb() {
  if (!prisma) { return false; }
  try { await prisma.$connect(); return true; }
  catch { return false; }
}
