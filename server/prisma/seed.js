import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const prisma = new PrismaClient();

  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment");
    }

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log("Users already exist, skipping bootstrap admin creation");
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    console.log(`Bootstrap admin user created for ${adminEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to seed database", error);
  process.exit(1);
});
