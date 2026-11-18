
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export const instant = false;

function HomeFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-sm text-slate-300">
      Loading KS POS...
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <RequestHome />
    </Suspense>
  );
}

async function RequestHome() {
  // Setup state and user sessions are database/request specific; keep them out
  // of the build-time static shell.
  await connection();

  const ownerCount = await prisma.user.count({
    where: { role: "OWNER" },
  });

  if (ownerCount === 0) {
    redirect("/setup");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      branch: {
        select: { isActive: true, name: true },
      },
    },
  });

  if (!user || !user.isActive || !user.branch.isActive) {
    redirect("/login");
  }

  return (
    <DashboardClient
      storeName={user.branch.name}
      userName={user.name}
    />
  );
}
