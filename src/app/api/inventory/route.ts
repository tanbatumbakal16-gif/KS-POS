import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canManageStock, getInventoryActor } from "@/lib/inventory-access";
import { prisma } from "@/lib/prisma";

const MAX_PRICE = 9_999_999_999.99;
const MAX_QUANTITY = 999_999_999.999;

function numberInRange(value: unknown, max: number, decimals: number) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max &&
    Number(parsed.toFixed(decimals)) === parsed;
}

function boundedText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length <= maxLength ? result : null;
}

function imageSource(imageUrl: string | null, productId: string) {
  return imageUrl?.startsWith("data:image/webp;base64,")
    ? `/api/inventory/${productId}/image`
    : imageUrl;
}

export async function GET() {
  try {
    const actor = await getInventoryActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await prisma.inventory.findMany({
      where: { branchId: actor.branchId, product: { isActive: true } },
      include: { product: { include: { category: true } } },
      orderBy: { product: { name: "asc" } },
    });

    return NextResponse.json({
      permissions: {
        canManageStock: canManageStock(actor.role),
        canEditCatalog: actor.role === "OWNER",
      },
      products: rows.map((item) => ({
        id: item.product.id,
        inventoryId: item.id,
        name: item.product.name,
        barcode: item.product.barcode,
        sku: item.product.sku,
        description: item.product.description,
        imageUrl: imageSource(item.product.imageUrl, item.product.id),
        category: item.product.category?.name ?? null,
        ...(canManageStock(actor.role) ? { costPrice: Number(item.product.costPrice) } : {}),
        sellingPrice: Number(item.product.sellingPrice),
        unit: item.product.unit,
        stock: Number(item.quantity),
        lowStockAt: Number(item.lowStockAt),
      })),
    });
  } catch (error) {
    console.error("Inventory fetch error:", error);
    return NextResponse.json({ error: "Unable to load inventory." }, { status: 500 });
  }
}

// Create one shared catalog product and its opening stock for the actor's branch.
export async function POST(request: NextRequest) {
  try {
    const actor = await getInventoryActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageStock(actor.role)) {
      return NextResponse.json({ error: "You do not have permission to add products." }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid product data." }, { status: 400 });
    }

    const name = boundedText(body.name, 120);
    const barcode = boundedText(body.barcode, 128);
    const sku = boundedText(body.sku, 64);
    const description = boundedText(body.description, 1000);
    const categoryName = boundedText(body.category, 80);
    const unit = boundedText(body.unit ?? "pcs", 20);
    const sellingPrice = Number(body.sellingPrice);
    const costPrice = Number(body.costPrice ?? 0);
    const quantity = Number(body.quantity ?? 0);
    const lowStockAt = Number(body.lowStockAt ?? 5);

    if (name === null || !name || barcode === null || sku === null || description === null || categoryName === null || unit === null || !unit) {
      return NextResponse.json({ error: "Check product text fields and their maximum lengths." }, { status: 400 });
    }
    if (!numberInRange(body.sellingPrice, MAX_PRICE, 2) ||
        !numberInRange(body.costPrice ?? 0, MAX_PRICE, 2) ||
        !numberInRange(body.quantity ?? 0, MAX_QUANTITY, 3) ||
        !numberInRange(body.lowStockAt ?? 5, MAX_QUANTITY, 3)) {
      return NextResponse.json({ error: "Enter valid prices (up to two decimals) and quantities (up to three decimals)." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let categoryId: string | undefined;
      if (categoryName) {
        const category = await tx.category.upsert({
          where: { name: categoryName }, update: {}, create: { name: categoryName },
        });
        categoryId = category.id;
      }

      const product = await tx.product.create({
        data: {
          name, barcode: barcode || null, sku: sku || null,
          description: description || null, unit,
          costPrice: new Prisma.Decimal(costPrice.toFixed(2)),
          sellingPrice: new Prisma.Decimal(sellingPrice.toFixed(2)),
          ...(categoryId ? { categoryId } : {}),
        },
      });
      const inventory = await tx.inventory.create({
        data: {
          branchId: actor.branchId,
          productId: product.id,
          quantity: new Prisma.Decimal(quantity.toFixed(3)),
          lowStockAt: new Prisma.Decimal(lowStockAt.toFixed(3)),
        },
      });
      if (quantity > 0) {
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            branchId: actor.branchId,
            type: "ADJUSTMENT",
            quantity: new Prisma.Decimal(quantity.toFixed(3)),
            note: "Opening stock",
          },
        });
      }
      return { product, inventory };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({
      success: true,
      product: {
        id: result.product.id,
        name: result.product.name,
        barcode: result.product.barcode,
        sku: result.product.sku,
        sellingPrice: Number(result.product.sellingPrice),
        costPrice: Number(result.product.costPrice),
        stock: Number(result.inventory.quantity),
        lowStockAt: Number(result.inventory.lowStockAt),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That barcode or SKU is already in use." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Inventory changed during this request. Please try again." }, { status: 409 });
    }
    console.error("Inventory create error:", error);
    return NextResponse.json({ error: "Unable to save product. Check the product details and try again." }, { status: 500 });
  }
}
