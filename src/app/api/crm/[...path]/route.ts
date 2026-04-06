import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type RouteContext = {
  params:
    | {
        path: string[];
      }
    | Promise<{
        path: string[];
      }>;
};

type ResolvedParams = {
  path: string[];
};

const blockedResponseHeaders = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

function getProxyTimeoutMs() {
  const parsed = Number(process.env.CRM_PROXY_TIMEOUT_MS ?? 15000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

function getCrmBaseUrl() {
  const base =
    process.env.NEXT_PUBLIC_CRM_API_BASE_URL ?? process.env.CRM_API_BASE_URL;

  if (!base || base.trim().length === 0) {
    throw new Error("Missing CRM base URL env: NEXT_PUBLIC_CRM_API_BASE_URL");
  }

  return base.replace(/\/+$/, "");
}

async function getAccessTokenFromCookies(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set() {
        // No-op in proxy route.
      },
      remove() {
        // No-op in proxy route.
      },
    },
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }

  return data.session?.access_token ?? null;
}

async function proxyToCrm(request: NextRequest, context: RouteContext) {
  const crmBaseUrl = getCrmBaseUrl();
  const resolved = (await context.params) as ResolvedParams;
  const pathname = resolved.path.join("/");
  const normalizedPath = pathname.startsWith("api/") ? pathname : `api/${pathname}`;
  const target = new URL(`${crmBaseUrl}/${normalizedPath}`);
  target.search = request.nextUrl.search;

  const upstreamHeaders = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  let finalAuthorization = authorization;

  if (!finalAuthorization) {
    const cookieToken = await getAccessTokenFromCookies(request);
    if (cookieToken) {
      finalAuthorization = `Bearer ${cookieToken}`;
    }
  }

  if (!finalAuthorization) {
    return NextResponse.json(
      {
        error: "Missing authorization token.",
        detail:
          "No Authorization header and no Supabase session token found in cookies.",
      },
      { status: 401 },
    );
  }

  upstreamHeaders.set("authorization", finalAuthorization);
  if (contentType) upstreamHeaders.set("content-type", contentType);
  if (accept) upstreamHeaders.set("accept", accept);

  const method = request.method.toUpperCase();
  const canHaveBody = !["GET", "HEAD"].includes(method);
  const bodyText = canHaveBody ? await request.text() : undefined;

  let upstreamResponse: Response;
  const timeoutMs = getProxyTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    upstreamResponse = await fetch(target.toString(), {
      method,
      headers: upstreamHeaders,
      body: canHaveBody && bodyText && bodyText.length > 0 ? bodyText : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          error: "CRM upstream request timed out.",
          detail: `Timed out after ${timeoutMs}ms.`,
          target: target.toString(),
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      {
        error: "CRM upstream request failed.",
        detail: error instanceof Error ? error.message : "Unknown network error.",
        target: target.toString(),
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const upstreamContentType = (upstreamResponse.headers.get("content-type") ?? "").toLowerCase();
  if (!upstreamResponse.ok && upstreamContentType.includes("text/html")) {
    const html = await upstreamResponse.text();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const upstreamTitle = titleMatch?.[1]?.trim() ?? null;

    return NextResponse.json(
      {
        error: `CRM returned HTML error page (HTTP ${upstreamResponse.status}).`,
        detail: upstreamTitle
          ? `Upstream page title: ${upstreamTitle}`
          : "Check CRM deployment logs for this endpoint.",
        target: target.toString(),
      },
      { status: upstreamResponse.status },
    );
  }

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (!blockedResponseHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  const responseBody = await upstreamResponse.arrayBuffer();

  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyToCrm(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyToCrm(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyToCrm(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyToCrm(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyToCrm(request, context);
}
