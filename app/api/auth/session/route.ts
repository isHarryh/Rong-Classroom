import { NextResponse } from "next/server";
import { isActiveSession } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session: session && isActiveSession(session) ? session : null });
}
