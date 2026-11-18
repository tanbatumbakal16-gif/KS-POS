import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canManageStock, getInventoryActor } from "@/lib/inventory-access";
import { prisma } from "@/lib/prisma";

const MAX_PRICE = 9_999_999_999.99;
const MAX_QUANTITY = 999_999_999.999;

type RouteContext = { params: Promise<{ productId: string }> };

function validNumber(value: unknown, max: number, decimals: number) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max &&
    Number(parsed.toFixed(decimals)) === parsed;
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : null;
}

async function readJson(request: NextRequest) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const actor = await getInventoryActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { productId } = await context.params;
    const inventory = await prisma.inventory.findUnique({
      where: { branchId_productId: { branchId: actor.branchId, productId } },
      select: { id: true },
    });
    if (!inventory) return NextResponse.json({ error: "Product not found in your branch." }, { status: 404 });

    const movements = await prisma.stockMovement.findMany({
      where: { productId, branchId: actor.branchId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, quantity: true, note: true, createdAt: true },
    });
    return NextResponse.json({ movements: movements.map((movement) => ({
      ...movement, quantity: Number(movement.quantity),
    })) });
  } catch (error) {
    console.error("Inventory history error:", error);
    return NextResponse.json({ error: "Unable to load stock history." }, { status: 500 });
  }
}

// Product catalog fields are shared by the existing schema. Only owners may
// edit those globally shared values; managers may edit this branch's threshold.
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getInventoryActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageStock(actor.role)) return NextResponse.json({ error: "You do not have permission to edit inventory." }, { status: 403 });

    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "Invalid product data." }, { status: 400 });
    const { productId } = await context.params;
    const hasCatalogFields = ["name", "barcode", "sku", "description", "category", "unit", "costPrice", "sellingPrice"].some((key) => key in body);
    if (actor.role !== "OWNER" && hasCatalogFields) {
      return NextResponse.json({ error: "Only an owner can edit shared product details and prices." }, { status: 403 });
    }

    const name = body.name === undefined ? undefined : text(body.name, 120);
    const barcode = body.barcode === undefined ? undefined : text(body.barcode, 128);
    const sku = body.sku === undefined ? undefined : text(body.sku, 64);
    const description = body.description === undefined ? undefined : text(body.description, 1000);
    const categoryName = body.category === undefined ? undefined : text(body.category, 80);
    const unit = body.unit === undefined ? undefined : text(body.unit, 20);
    if (name === null || barcode === null || sku === null || description === null || categoryName === null || unit === null || name === "" || unit === "") {
      return NextResponse.json({ error: "Check product text fields and their maximum lengths." }, { status: 400 });
    }

    const lowStockAt = body.lowStockAt;
    if (lowStockAt !== undefined && !validNumber(lowStockAt, MAX_QUANTITY, 3)) {
      return NextResponse.json({ error: "Low-stock threshold must be a non-negative quantity with up to three decimals." }, { status: 400 });
    }
    if (actor.role === "MANAGER" && lowStockAt === undefined) {
      return NextResponse.json({ error: "A manager can update this branch's low-stock threshold only." }, { status: 400 });
    }

    const costPrice = body.costPrice;
    const sellingPrice = body.sellingPrice;
    if (actor.role === "OWNER" && (costPrice === undefined || sellingPrice === undefined ||
        !validNumber(costPrice, MAX_PRICE, 2) || !validNumber(sellingPrice, MAX_PRICE, 2))) {
      return NextResponse.json({ error: "Enter valid cost and selling prices with up to two decimals." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { branchId_productId: { branchId: actor.branchId, productId } },
      });
      if (!inventory) return false;

      if (actor.role === "OWNER") {
        let categoryId: string | null | undefined;
        if (categoryName !== undefined) {
          categoryId = categoryName
            ? (await tx.category.upsert({ where: { name: categoryName }, update: {}, create: { name: categoryName } })).id
            : null;
        }
        await tx.product.update({
          where: { id: productId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(barcode !== undefined ? { barcode: barcode || null } : {}),
            ...(sku !== undefined ? { sku: sku || null } : {}),
            ...(description !== undefined ? { description: description || null } : {}),
            ...(unit !== undefined ? { unit } : {}),
            ...(categoryId !== undefined ? { category: categoryId ? { connect: { id: categoryId } } : { disconnect: true } } : {}),
            costPrice: new Prisma.Decimal(Number(costPrice).toFixed(2)),
            sellingPrice: new Prisma.Decimal(Number(sellingPrice).toFixed(2)),
          },
        });
      }
      if (lowStockAt !== undefined) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { lowStockAt: new Prisma.Decimal(Number(lowStockAt).toFixed(3)) },
        });
      }
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!updated) return NextResponse.json({ error: "Product not found in your branch." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That barcode or SKU is already in use." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Inventory changed during this request. Please try again." }, { status: 409 });
    }
    console.error("Inventory update error:", error);
    return NextResponse.json({ error: "Unable to update product." }, { status: 500 });
  }
}

// Apply a signed quantity change atomically and write its reason to the branch history.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getInventoryActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageStock(actor.role)) return NextResponse.json({ error: "You do not have permission to adjust stock." }, { status: 403 });

    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "Invalid adjustment data." }, { status: 400 });
    const amount = body.quantity;
    const reason = text(body.reason, 240);
    if (!validNumber(amount, MAX_QUANTITY, 3) || Number(amount) <= 0 || !reason || reason.length < 3) {
      return NextResponse.json({ error: "Enter a positive adjustment quantity and a reason (3–240 characters)." }, { status: 400 });
    }
    if (body.direction !== "ADD" && body.direction !== "REMOVE") {
      return NextResponse.json({ error: "Choose whether to add or remove stock." }, { status: 400 });
    }

    const { productId } = await context.params;
    const quantity = new Prisma.Decimal(Number(amount).toFixed(3));
    const delta = body.direction === "ADD" ? quantity : quantity.negated();
    const saved = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { branchId_productId: { branchId: actor.branchId, productId } },
      });
      if (!inventory) return null;

      if (body.direction === "ADD") {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: { increment: quantity } },
        });
      } else {
        const changed = await tx.inventory.updateMany({
          where: { id: inventory.id, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (changed.count !== 1) throw new Error("INSUFFICIENT_STOCK_FOR_ADJUSTMENT");
      }

      await tx.stockMovement.create({
        data: { productId, branchId: actor.branchId, type: "ADJUSTMENT", quantity: delta, note: reason },
      });
      return tx.inventory.findUnique({ where: { id: inventory.id }, select: { quantity: true, lowStockAt: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!saved) return NextResponse.json({ error: "Product not found in your branch." }, { status: 404 });
    return NextResponse.json({ success: true, stock: Number(saved.quantity), lowStockAt: Number(saved.lowStockAt) });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK_FOR_ADJUSTMENT") {
      return NextResponse.json({ error: "Stock adjustment cannot reduce inventory below zero." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Inventory changed during this request. Please try again." }, { status: 409 });
    }
    console.error("Stock adjustment error:", error);
    return NextResponse.json({ error: "Unable to adjust stock." }, { status: 500 });
  }
}
