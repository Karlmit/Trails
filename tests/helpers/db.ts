import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export const hasTestDatabase = Boolean(process.env.DATABASE_URL);

let client: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set; integration tests should have been skipped');
    }
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function resetDb(): Promise<void> {
  const prisma = testPrisma();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "sessions", "timeline_entries", "ideas", "checklist_items", "checklists", "sections", "trips", "users" RESTART IDENTITY CASCADE',
  );
}
