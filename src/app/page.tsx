
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export const instant = false;

export default async function Home() {
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
      isActive: true,
      branch: {
        select: { isActive: true },
      },
    },
  });

  if (!user || !user.isActive || !user.branch.isActive) {
    redirect("/login");
  }

  return <DashboardClient />;
}
