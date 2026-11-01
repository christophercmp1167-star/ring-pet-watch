import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      message: "Ring account linking is not configured yet.",
      status: "not_configured",
    },
    { status: 501 }
  );
}
