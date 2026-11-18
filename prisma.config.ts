import "dotenv/config";
import { defineConfig } from "prisma/config";

const directUrl = process.env.DIRECT_URL ?? "";
const prismaArgs = process.argv.slice(2);
const databaseCommands = new Set(["db", "diff", "migrate", "studio"]);

const isDatabaseCommand = prismaArgs.some((argument) => databaseCommands.has(argument)) ||
  (prismaArgs.includes("generate") && prismaArgs.includes("--sql"));

if (!directUrl && isDatabaseCommand) {
  throw new Error("DIRECT_URL is required for Prisma database commands. Configure the Neon direct connection URL locally.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    // Prisma CLI commands use only Neon’s direct URL. An absent value stays
    // empty so offline validation and generation have no database fallback.
    url: directUrl,
  },
});
