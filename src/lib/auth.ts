
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = process.env.AUTH_SECRET;

if (!secret || secret.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters.");
}

const key = new TextEncoder().encode(secret);

export type SessionUser = {
  id: string;
  username: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
  branchId: string;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);

  const cookieStore = await cookies();

  cookieStore.set("ks-pos-session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("ks-pos-session")?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key);

    if (
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.branchId !== "string" ||
      !["OWNER", "MANAGER", "CASHIER"].includes(String(payload.role))
    ) {
      return null;
    }

    return {
      id: payload.id,
      username: payload.username,
      role: payload.role as SessionUser["role"],
      branchId: payload.branchId,
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete("ks-pos-session");
}
