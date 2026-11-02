
import { NextResponse } from "next/server";
import { Prisma, PaymentMethod, SaleStatus, StockMovementType } from "@prisma/client";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type CheckoutItem = {
  productId: string;
  quantity: number;
};

type CheckoutPayment = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
};

type CheckoutBody = {
  items: CheckoutItem[];
  payments: CheckoutPayment[];
  discount?: number;
  customerId?: string | null;
};

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const validMethods = Object.values(PaymentMethod);

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Please log in before checkout." },
        { status: 401 }
      );
    }

    if (!["OWNER", "MANAGER", "CASHIER"].includes(session.role)) {
      return NextResponse.json(
        { error: "You are not allowed to make sales." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CheckoutBody;

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Your cart is empty." },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.payments)) {
      return NextResponse.json(
        { error: "Payment information is required." },
        { status: 400 }
      );
    }

    const discount = Number(body.discount ?? 0);

    if (!Number.isFinite(discount) || discount < 0) {
      return NextResponse.json(
        { error: "Invalid discount amount." },
        { status: 400 }
      );
    }

    const quantities = new Map<string, number>();

    for (const item of body.items) {
      if (
        !item.productId ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0
      ) {
        return NextResponse.json(
          { error: "Each item needs a valid product and quantity." },
          { status: 400 }
        );
      }

      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity
      );
    }

    const payments = body.payments.filter(
      (payment) => Number(payment.amount) > 0
    );

    for (const payment of payments) {
      if (
        !validMethods.includes(payment.method) ||
        payment.method === "UTANG" ||
        !Number.isFinite(Number(payment.amount)) ||
        Number(payment.amount) <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid payment method or amount." },
          { status: 400 }
        );
      }
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const productIds = [...quantities.keys()];

        const products = await tx.product.findMany({
          where: {
            id: { in: productIds },
            isActive: true,
          },
        });

        if (products.length !== productIds.length) {
          throw new Error("One or more products are unavailable.");
        }

        const inventoryRows = await tx.inventory.findMany({
          where: {
            branchId: session.branchId,
            productId: { in: productIds },
          },
        });

        const inventoryByProduct = new Map(
          inventoryRows.map((row) => [row.productId, row])
        );

        const productById = new Map(
          products.map((product) => [product.id, product])
        );

        let subtotal = 0;

        const saleItems = productIds.map((productId) => {
          const product = productById.get(productId);
          const inventory = inventoryByProduct.get(productId);
          const quantity = quantities.get(productId)!;

          if (!product || !inventory) {
            throw new Error(
              `Product inventory not found for ${product?.name ?? productId}.`
            );
          }

          if (Number(inventory.quantity) < quantity) {
            throw new Error(
              `Insufficient stock for ${product.name}. Available: ${inventory.quantity}.`
            );
          }

          const unitPrice = Number(product.sellingPrice);
          const costPrice = Number(product.costPrice);
          const lineSubtotal = money(unitPrice * quantity);

          subtotal = money(subtotal + lineSubtotal);

          return {
            productId,
            quantity,
            unitPrice,
            costPrice,
            subtotal: lineSubtotal,
          };
        });

        if (discount > subtotal) {
          throw new Error("Discount cannot exceed the subtotal.");
        }

        const total = money(subtotal - discount);

        const paymentTotal = money(
          payments.reduce(
            (sum, payment) => sum + Number(payment.amount),
            0
          )
        );

        const cashPayment = money(
          payments
            .filter((payment) => payment.method === "CASH")
            .reduce((sum, payment) => sum + Number(payment.amount), 0)
        );

        if (paymentTotal - total > cashPayment) {
          throw new Error(
            "Only cash payments can cover an overpayment and receive change."
          );
        }

        const amountPaid = Math.min(paymentTotal, total);
        const change = money(Math.max(0, paymentTotal - total));
        const balance = money(Math.max(0, total - paymentTotal));

        if (balance > 0 && !body.customerId) {
          throw new Error(
            "Select a customer to record an unpaid balance."
          );
        }

        if (body.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: body.customerId },
            select: { id: true },
          });

          if (!customer) {
            throw new Error("Selected customer was not found.");
          }
        }

        const receiptNumber = `KS-${Date.now()}-${randomUUID()
          .slice(0, 6)
          .toUpperCase()}`;

        const sale = await tx.sale.create({
          data: {
            receiptNumber,
            branchId: session.branchId,
            cashierId: session.id,
            customerId: body.customerId || null,
            subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
            discount: new Prisma.Decimal(discount.toFixed(2)),
            total: new Prisma.Decimal(total.toFixed(2)),
            amountPaid: new Prisma.Decimal(amountPaid.toFixed(2)),
            change: new Prisma.Decimal(change.toFixed(2)),
            balance: new Prisma.Decimal(balance.toFixed(2)),
            status: SaleStatus.COMPLETED,
            items: {
              create: saleItems.map((item) => ({
                productId: item.productId,
                quantity: new Prisma.Decimal(item.quantity.toFixed(3)),
                unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
                costPrice: new Prisma.Decimal(item.costPrice.toFixed(2)),
                subtotal: new Prisma.Decimal(item.subtotal.toFixed(2)),
              })),
            },
            payments: {
              create: payments.map((payment) => ({
                method: payment.method,
                amount: new Prisma.Decimal(
                  Number(payment.amount).toFixed(2)
                ),
                reference: payment.reference?.trim() || null,
              })),
            },
          },
          include: {
            items: {
              include: { product: true },
            },
            payments: true,
          },
        });

        for (const item of saleItems) {
          const inventory = inventoryByProduct.get(item.productId)!;

          const updated = await tx.inventory.updateMany({
            where: {
              id: inventory.id,
              quantity: { gte: new Prisma.Decimal(item.quantity) },
            },
            data: {
              quantity: {
                decrement: new Prisma.Decimal(item.quantity),
              },
            },
          });

          if (updated.count !== 1) {
            throw new Error(
              `Stock changed during checkout for ${
                productById.get(item.productId)!.name
              }. Please try again.`
            );
          }

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: StockMovementType.SALE,
              quantity: new Prisma.Decimal(item.quantity.toFixed(3)),
              note: `Sale ${receiptNumber} - Branch ${session.branchId}`,
            },
          });
        }

        return sale;
      },
      {
        maxWait: 10000,
        timeout: 20000,
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Sale completed successfully.",
        sale: {
          id: result.id,
          receiptNumber: result.receiptNumber,
          subtotal: Number(result.subtotal),
          discount: Number(result.discount),
          total: Number(result.total),
          amountPaid: Number(result.amountPaid),
          change: Number(result.change),
          balance: Number(result.balance),
          items: result.items.map((item) => ({
            productId: item.productId,
            name: item.product.name,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            subtotal: Number(item.subtotal),
          })),
          payments: result.payments.map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount),
            reference: payment.reference,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("CHECKOUT ERROR:", error);

    const message =
      error instanceof Error ? error.message : "Checkout failed.";

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
