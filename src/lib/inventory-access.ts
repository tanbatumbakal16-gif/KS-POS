import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type InventoryActor = {
  id: string;
  branchId: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
};

/** Resolve permissions and branch from the current database record, not stale JWT claims. */
export async function getInventoryActor(): Promise<InventoryActor | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      role: true,
      isActive: true,
      branchId: true,
      branch: { select: { isActive: true } },
    },
  });

  if (!user?.isActive || !user.branch.isActive) return null;

  return { id: user.id, branchId: user.branchId, role: user.role };
}

export function canManageStock(role: InventoryActor["role"]) {
  return role === "OWNER" || role === "MANAGER";
}
