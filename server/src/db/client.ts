import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { env } from "../config/env";
import { log } from "../../vite";

export const prisma = new PrismaClient();

export async function ensureBootstrapUser() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return;
  }

  const hashedPassword = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  await prisma.user.create({
    data: {
      email: env.ADMIN_EMAIL,
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  log(`Bootstrap admin user created for ${env.ADMIN_EMAIL}`);
}
