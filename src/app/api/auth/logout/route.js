import { ACTIONS, logActivity } from "@/lib/activity";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req) {
  const user = await getCurrentUser();

  if (user) {
    await logActivity({ action: ACTIONS.LOGOUT, userId: user.id, req });
  }

  await destroySession();

  // Redirect to a RELATIVE path so the browser stays on whatever host it is
  // already using (e.g. the server's IP or a domain), instead of an absolute
  // URL built from req.url — which can resolve to the server's internal
  // "localhost" address and send the user to a dead end.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}
