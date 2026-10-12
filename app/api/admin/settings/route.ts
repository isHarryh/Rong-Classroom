import { NextResponse } from "next/server";
import { jsonError, readJson, requireSuperAdmin, route } from "@/lib/api";
import { getDb, getPetEnabled, setPetEnabled } from "@/lib/db";

export const GET = route(async () => {
  await requireSuperAdmin();
  return NextResponse.json({ petEnabled: getPetEnabled(getDb()) });
});

export const PATCH = route(async (request: Request) => {
  await requireSuperAdmin();
  const body = await readJson<{ petEnabled?: unknown }>(request);
  if (typeof body.petEnabled !== "boolean") return jsonError("参数无效");
  setPetEnabled(getDb(), body.petEnabled);
  return NextResponse.json({ ok: true, petEnabled: body.petEnabled });
});
