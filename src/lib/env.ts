// Next.js statically replaces process.env.NEXT_PUBLIC_* at build time, so
// process.env[name] does not work for those variables. Each variable must be
// referenced by its literal name. That is why this file uses explicit
// property access rather than a generic lookup helper.

const cleanUrl = (value: string) => value.trim().replace(/\/+$/, "");

export function getPublicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.trim().length === 0) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseAnonKey || supabaseAnonKey.trim().length === 0) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // CRM_API_BASE_URL is server-only so Next.js does not embed it in the
  // browser bundle. NEXT_PUBLIC_CRM_API_BASE_URL is kept as a fallback for
  // legacy deployments that have not yet renamed the variable.
  const crmBaseUrl =
    process.env.CRM_API_BASE_URL ?? process.env.NEXT_PUBLIC_CRM_API_BASE_URL;
  if (!crmBaseUrl || crmBaseUrl.trim().length === 0) {
    throw new Error("Missing required environment variable: CRM_API_BASE_URL");
  }

  return {
    supabaseUrl: cleanUrl(supabaseUrl),
    supabaseAnonKey: supabaseAnonKey.trim(),
    crmApiBaseUrl: cleanUrl(crmBaseUrl),
  };
}
