import { redirect } from "next/navigation";
import { isActiveSession } from "@/lib/api";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (session && isActiveSession(session)) redirect(session.kind === "admin" ? "/admin" : "/client");
  redirect("/login");
}
