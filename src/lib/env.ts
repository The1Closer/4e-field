const cleanUrl = (value: string) => value.trim().replace(/\/+$/, "");

const readRequired = (name: string): string => {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : name === "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        : name === "NEXT_PUBLIC_CRM_API_BASE_URL"
          ? process.env.NEXT_PUBLIC_CRM_API_BASE_URL
          : name === "CRM_API_BASE_URL"
            ? process.env.CRM_API_BASE_URL
            : undefined;

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export function getPublicEnv() {
  const crmBaseUrl =
    process.env.NEXT_PUBLIC_CRM_API_BASE_URL ?? process.env.CRM_API_BASE_URL;

  if (!crmBaseUrl || crmBaseUrl.trim().length === 0) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_CRM_API_BASE_URL",
    );
  }

  return {
    supabaseUrl: cleanUrl(readRequired("NEXT_PUBLIC_SUPABASE_URL")),
    supabaseAnonKey: readRequired("NEXT_PUBLIC_SUPABASE_ANON_KEY").trim(),
    crmApiBaseUrl: cleanUrl(crmBaseUrl),
  };
}
