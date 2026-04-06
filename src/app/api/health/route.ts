import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "4e-field",
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
    },
    { status: 200 },
  );
}

