import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getInventoryActor } from "@/lib/inventory-access";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ productId: string }> };
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const DATA_URI_PREFIX = "data:image/webp;base64,";

async function authorizedProduct(productId: string) {
  const actor = await getInventoryActor();
  if (!actor) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (actor.role !== "OWNER") {
    return { response: NextResponse.json({ error: "Only an owner can change shared product photos." }, { status: 403 }) };
  }
  const inventory = await prisma.inventory.findUnique({
    where: { branchId_productId: { branchId: actor.branchId, productId } },
    select: { productId: true },
  });
  if (!inventory) return { response: NextResponse.json({ error: "Product not found in your branch." }, { status: 404 }) };
  return { actor };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const actor = await getInventoryActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { productId } = await context.params;
    const inventory = await prisma.inventory.findUnique({
      where: { branchId_productId: { branchId: actor.branchId, productId } },
      select: { product: { select: { imageUrl: true } } },
    });
    const imageUrl = inventory?.product.imageUrl;
    if (!imageUrl?.startsWith(DATA_URI_PREFIX)) {
      return NextResponse.json({ error: "Product photo not found." }, { status: 404 });
    }
    const bytes = Buffer.from(imageUrl.slice(DATA_URI_PREFIX.length), "base64");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Product photo read error:", error);
    return NextResponse.json({ error: "Unable to load product photo." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { productId } = await context.params;
    const access = await authorizedProduct(productId);
    if ("response" in access) return access.response;
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Photo must be 5 MB or smaller." }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Choose a product photo to upload." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Photo must be 5 MB or smaller." }, { status: 413 });
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WebP photo." }, { status: 415 });
    }

    const source = Buffer.from(await file.arrayBuffer());
    const image = sharp(source, { failOn: "error", limitInputPixels: 25_000_000 });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || !metadata.width || !metadata.height) {
      return NextResponse.json({ error: "The uploaded file is not a valid supported photo." }, { status: 415 });
    }
    const webp = await image.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const imageUrl = `${DATA_URI_PREFIX}${webp.toString("base64")}`;

    await prisma.$transaction(async (tx) => {
      const inBranch = await tx.inventory.findUnique({
        where: { branchId_productId: { branchId: access.actor.branchId, productId } },
        select: { id: true },
      });
      if (!inBranch) throw new Error("PRODUCT_NOT_FOUND_IN_BRANCH");
      await tx.product.update({ where: { id: productId }, data: { imageUrl } });
    });

    return NextResponse.json({ success: true, imageUrl: `/api/inventory/${productId}/image` });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND_IN_BRANCH") {
      return NextResponse.json({ error: "Product not found in your branch." }, { status: 404 });
    }
    console.error("Product photo upload error:", error);
    return NextResponse.json({ error: "Unable to save product photo." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { productId } = await context.params;
    const access = await authorizedProduct(productId);
    if ("response" in access) return access.response;
    await prisma.product.update({ where: { id: productId }, data: { imageUrl: null } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Product photo delete error:", error);
    return NextResponse.json({ error: "Unable to remove product photo." }, { status: 500 });
  }
}
