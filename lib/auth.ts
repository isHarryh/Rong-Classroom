import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextResponse } from "next/server";

const COOKIE_NAME = "rong_session";
const UNLOCK_COOKIE = "rong_unlock";

function getSecret() {
  const value = process.env.AUTH_SECRET;
  if (value) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return new TextEncoder().encode("rong-classroom-development-secret-change-me");
}

export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const UNLOCK_TTL_SECONDS = 300;
export const SUPERADMIN_SUB = "superadmin";

export function getSuperAdmin() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password && process.env.NODE_ENV === "production") throw new Error("ADMIN_PASSWORD is required in production");
  return {
    username: process.env.ADMIN_USERNAME || "admin",
    password: password || "admin123",
    name: process.env.ADMIN_NAME || "系统管理员",
  };
}

export type Session = {
  sub: string;
  kind: "admin" | "client";
  role: number;
  name: string;
  username?: string;
  classId?: string;
  clientCode?: string;
};

type Claims = JWTPayload & Session & { type?: "session" | "unlock" };

function signToken(session: Session, type: "session" | "unlock", expiresAt: number) {
  return new SignJWT({ ...session, type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

export function createSession(session: Session, expiresAt?: number) {
  return signToken(
    session,
    "session",
    expiresAt ? Math.floor(expiresAt / 1000) : Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  );
}

export function createUnlockToken(session: Session) {
  return signToken(session, "unlock", Math.floor(Date.now() / 1000) + UNLOCK_TTL_SECONDS);
}

async function verifySessionToken(token: string | undefined) {
  if (!token) return undefined;
  try {
    const result = await jwtVerify<Claims>(token, getSecret());
    return result.payload.type !== "session" ? undefined : result.payload;
  } catch {
    return undefined;
  }
}

export async function getSession() {
  const store = await cookies();
  const payload = await verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!payload?.sub || (payload.kind !== "admin" && payload.kind !== "client")) return undefined;
  return payload as Session;
}

export async function isUnlocked(expected?: Session) {
  const store = await cookies();
  const token = store.get(UNLOCK_COOKIE)?.value;
  if (!token) return false;
  try {
    const result = await jwtVerify<Claims>(token, getSecret());
    return (
      result.payload.type === "unlock" &&
      (!expected || (result.payload.sub === expected.sub && result.payload.kind === expected.kind))
    );
  } catch {
    return false;
  }
}

export function matchesSecret(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
};

export function setSessionCookie(response: NextResponse, token: string, maxAge: number) {
  response.cookies.set(COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge });
}

export function setUnlockCookie(response: NextResponse, token: string) {
  response.cookies.set(UNLOCK_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: UNLOCK_TTL_SECONDS });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(COOKIE_NAME);
  response.cookies.delete(UNLOCK_COOKIE);
}
