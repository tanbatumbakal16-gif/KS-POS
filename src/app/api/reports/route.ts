
import { NextRequest, NextResponse } from "next/server";
import { SaleStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    // Access request-specific data before reading session cookies.
    const params = request.nextUrl.searchParams;
    const startParam = params.get("start");
    const endParam = params.get("end");

    const start = startParam ? new Date(startParam) : new Date();
    const end = endParam ? new Date(endParam) : new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      return NextResponse.json(
        { error: "Invalid report date range." },
        { status: 400 }
      );
    }

    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Please log in first." },
        { status: 401 }
      );
    }

    const dateFilter = {
      gte: start,
      lte: end,
    };

    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: {
          branchId: session.branchId,
          createdAt: dateFilter,
          status: SaleStatus.COMPLETED,
        },
        include: {
          items: true,
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.expense.findMany({
        where: {
          branchId: session.branchId,
          createdAt: dateFilter,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const netSales = sales.reduce(
      (sum, sale) => sum + Number(sale.total),
      0
    );

    const discounts = sales.reduce(
      (sum, sale) => sum + Number(sale.discount),
      0
    );

    const grossSales = netSales + discounts;

    const costOfGoodsSold = sales.reduce(
      (sum, sale) =>
        sum +
        sale.items.reduce(
          (itemSum, item) =>
            itemSum +
            Number(item.costPrice) * Number(item.quantity),
          0
        ),
      0
    );

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

    const paymentBreakdown: Record<string, number> = {};

    for (const sale of sales) {
      for (const payment of sale.payments) {
        paymentBreakdown[payment.method] =
          (paymentBreakdown[payment.method] || 0) +
          Number(payment.amount);
      }
    }

    return NextResponse.json({
      success: true,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary: {
        grossSales: round(grossSales),
        netSales: round(netSales),
        discounts: round(discounts),
        transactionCount: sales.length,
        costOfGoodsSold: round(costOfGoodsSold),
        expenses: round(totalExpenses),
        estimatedNetProfit: round(
          netSales - costOfGoodsSold - totalExpenses
        ),
      },
      paymentBreakdown: Object.fromEntries(
        Object.entries(paymentBreakdown).map(([key, value]) => [
          key,
          round(value),
        ])
      ),
      expensesList: expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        category: expense.category,
        amount: Number(expense.amount),
        createdAt: expense.createdAt,
      })),
      recentSales: sales.slice(0, 50).map((sale) => ({
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        total: Number(sale.total),
        createdAt: sale.createdAt,
        paymentMethods: sale.payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
        })),
      })),
    });
  } catch (error) {
    console.error("REPORTS ERROR:", error);

    return NextResponse.json(
      { error: "Unable to generate reports." },
      { status: 500 }
    );
  }
}
