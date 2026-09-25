import { PrismaClient } from "@prisma/client";

// Single Prisma client per process (Next.js dev reloads modules; keep it on globalThis).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type { Prisma } from "@prisma/client";
