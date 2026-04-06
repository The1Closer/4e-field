import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/jobs", "/knocking", "/tasks", "/notifications"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (hasSupabaseAuthCookie(request)) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/login", request.url);
  signInUrl.searchParams.set("redirectTo", pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/jobs/:path*", "/knocking/:path*", "/tasks/:path*", "/notifications/:path*"],
};
