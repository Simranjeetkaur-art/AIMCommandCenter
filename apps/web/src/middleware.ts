import { NextResponse, type NextRequest } from "next/server";
import { PORTAL_HOME, type Role } from "@aim/contracts";

const PORTAL_PREFIXES: Record<string, Role> = {
  "/student": "STUDENT",
  "/instructor": "INSTRUCTOR",
  "/manager": "MANAGER",
  "/admin": "ADMIN",
};

/**
 * Routing, not security.
 *
 * This sends a signed-in manager who lands on /admin back to their own portal,
 * so the product does not show people doors that will not open. It reads a
 * cookie the browser can edit, and that is fine: forging it changes which
 * page renders, and the page still gets its data from the API, which re-derives
 * the role from the session row and refuses anything the role does not hold.
 *
 * The boundary is the API. This is a signpost.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("aim_session")?.value;
  const role = request.cookies.get("aim_role")?.value as Role | undefined;
  // Which portal this session is looking at, if it is previewing one. Like the
  // role cookie this is a signpost: the API decides, from the session row.
  const preview = request.cookies.get("aim_preview")?.value as Role | undefined;
  const standing = preview ?? role;

  const prefix = Object.keys(PORTAL_PREFIXES).find((p) =>
    pathname.startsWith(p),
  );

  // Governance is shared: every signed-in role reaches some of it, and which
  // panels they actually get is decided by the API, not by this prefix.
  const isGovernance = pathname.startsWith("/governance");
  // Performance is shared for the same reason governance is: every role has a
  // review about them, so every role reaches the screen.
  const isPerformance = pathname.startsWith("/performance");
  // Everyone has an account, so /account belongs to no portal. It is also the
  // one screen a person held at the password gate can reach, which is why it
  // must never be redirected away on the strength of a role.
  const isAccount = pathname.startsWith("/account");
  // Authoring and the command hub are guarded by their layouts, which keep
  // doing the real check. They are routed here too only so that a signed-out
  // visitor gets the same /login?next= as everywhere else, instead of being
  // told a session they never had has "ended".
  const isAuthoring = pathname.startsWith("/authoring");
  const isCommand = pathname.startsWith("/command");
  if (
    !prefix &&
    !isGovernance &&
    !isPerformance &&
    !isAccount &&
    !isAuthoring &&
    !isCommand
  )
    return NextResponse.next();

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Past this point the caller is signed in. /account is theirs whatever their
  // role and whatever portal they are previewing, so it stops here.
  if (isAccount || isAuthoring || isCommand) return NextResponse.next();

  if (prefix && standing && PORTAL_PREFIXES[prefix] !== standing) {
    const url = request.nextUrl.clone();
    url.pathname = PORTAL_HOME[standing] ?? "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/student/:path*",
    "/instructor/:path*",
    "/manager/:path*",
    "/admin/:path*",
    "/governance/:path*",
    "/performance/:path*",
    "/account/:path*",
    "/authoring/:path*",
    "/command/:path*",
  ],
};
