import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    // Prisma generate does not need a live database URL. For local commands,
    // allow DATABASE_URL when DIRECT_URL is not configured.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/ks_pos?schema=public",
  },
});
