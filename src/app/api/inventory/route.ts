
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Load inventory for the logged-in user's branch
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const rows = await prisma.inventory.findMany({
      where: {
        branchId: session.branchId,
        product: { isActive: true },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: {
        product: { name: "asc" },
      },
    });

    return NextResponse.json({
      products: rows.map((item) => ({
        id: item.product.id,
        inventoryId: item.id,
        name: item.product.name,
        barcode: item.product.barcode,
        sku: item.product.sku,
        description: item.product.description,
        imageUrl: item.product.imageUrl,
        category: item.product.category?.name ?? null,
        costPrice: Number(item.product.costPrice),
        sellingPrice: Number(item.product.sellingPrice),
        unit: item.product.unit,
        stock: Number(item.quantity),
        lowStockAt: Number(item.lowStockAt),
      })),
    });
  } catch (error) {
    console.error("Inventory fetch error:", error);

    return NextResponse.json(
      { error: "Unable to load inventory." },
      { status: 500 }
    );
  }
}

// POST: Create a product and its opening branch inventory
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (session.role === "CASHIER") {
    return NextResponse.json(
      { error: "You do not have permission to add products." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const barcode = String(body.barcode ?? "").trim() || null;
    const sku = String(body.sku ?? "").trim() || null;
    const description =
      String(body.description ?? "").trim() || null;
    const imageUrl = String(body.imageUrl ?? "").trim() || null;
    const unit = String(body.unit ?? "pcs").trim() || "pcs";
    const categoryName = String(body.category ?? "").trim();

    const sellingPrice = Number(body.sellingPrice);
    const costPrice = Number(body.costPrice ?? 0);
    const quantity = Number(body.quantity ?? 0);
    const lowStockAt = Number(body.lowStockAt ?? 5);

    if (!name || name.length > 120) {
      return NextResponse.json(
        { error: "Product name is required (maximum 120 characters)." },
        { status: 400 }
      );
    }

    if (
      ![sellingPrice, costPrice, quantity, lowStockAt].every(
        Number.isFinite
      ) ||
      sellingPrice < 0 ||
      costPrice < 0 ||
      quantity < 0 ||
      lowStockAt < 0
    ) {
      return NextResponse.json(
        { error: "Enter valid non-negative prices and stock quantities." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let categoryId: string | undefined;

      if (categoryName) {
        const category = await tx.category.upsert({
          where: { name: categoryName },
          update: {},
          create: { name: categoryName },
        });

        categoryId = category.id;
      }

      const product = await tx.product.create({
        data: {
          name,
          barcode,
          sku,
          description,
          imageUrl,
          unit,
          costPrice: new Prisma.Decimal(costPrice),
          sellingPrice: new Prisma.Decimal(sellingPrice),
          ...(categoryId ? { categoryId } : {}),
        },
      });

      const inventory = await tx.inventory.create({
        data: {
          branchId: session.branchId,
          productId: product.id,
          quantity: new Prisma.Decimal(quantity),
          lowStockAt: new Prisma.Decimal(lowStockAt),
        },
      });

      if (quantity > 0) {
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: "ADJUSTMENT",
            quantity: new Prisma.Decimal(quantity),
            note: "Opening stock",
          },
        });
      }

      return { product, inventory };
    });

    return NextResponse.json(
      {
        success: true,
        product: {
          id: result.product.id,
          name: result.product.name,
          barcode: result.product.barcode,
          sku: result.product.sku,
          sellingPrice: Number(result.product.sellingPrice),
          costPrice: Number(result.product.costPrice),
          stock: Number(result.inventory.quantity),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That barcode or SKU is already in use." },
        { status: 409 }
      );
    }

    console.error("Inventory create error:", error);

    return NextResponse.json(
      {
        error:
          "Unable to save product. Check the product details and try again.",
      },
      { status: 500 }
    );
  }
}
