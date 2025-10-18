export let prisma: any = null;
try {
  const mod: any = await import("@prisma/client");
  if (mod?.PrismaClient) prisma = new mod.PrismaClient();
} catch {
  prisma = null;
}
