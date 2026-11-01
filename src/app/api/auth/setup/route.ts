
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const branchName = String(body.branchName ?? "").trim();
    const branchCode = String(body.branchCode ?? "").trim().toUpperCase();
    const branchAddress = String(body.branchAddress ?? "").trim();
    const branchPhone = String(body.branchPhone ?? "").trim();

    if (
      !name ||
      !username ||
      !password ||
      !branchName ||
      !branchCode
    ) {
      return NextResponse.json(
        { error: "Please complete all required fields." },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3â€“30 characters and use letters, numbers, dots, underscores or hyphens." },
        { status: 400 }
      );
    }

    if (password.length < 12 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be between 12 and 72 characters." },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9_-]{2,12}$/.test(branchCode)) {
      return NextResponse.json(
        { error: "Branch code must be 2â€“12 letters, numbers, underscores or hyphens." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(
      async (tx) => {
        const ownerCount = await tx.user.count({
          where: { role: "OWNER" },
        });

        if (ownerCount > 0) {
          throw new Error("SETUP_ALREADY_COMPLETED");
        }

        const branch = await tx.branch.create({
          data: {
            name: branchName,
            code: branchCode,
            address: branchAddress || null,
            phone: branchPhone || null,
          },
        });

        return tx.user.create({
          data: {
            name,
            username,
            passwordHash,
            role: "OWNER",
            branchId: branch.id,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    await createSession({
      id: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
    });

    return NextResponse.json({
      success: true,
      message: "Owner account created successfully.",
      redirect: "/",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_ALREADY_COMPLETED") {
      return NextResponse.json(
        { error: "Initial setup has already been completed." },
        { status: 403 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That username or branch code is already in use." },
        { status: 409 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        { error: "Setup conflicted with another request. Please try again." },
        { status: 409 }
      );
    }

    console.error("Owner setup error:", error);

    return NextResponse.json(
      { error: "Unable to complete setup. Please try again." },
      { status: 500 }
    );
  }
}
