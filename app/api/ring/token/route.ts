import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type");

    if (!contentType?.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Unsupported content type" },
        { status: 415 }
      );
    }

    const formData = await request.formData();

    const code = formData.get("code");
    const clientId = formData.get("client_id");

    if (
      typeof code !== "string" ||
      !code ||
      typeof clientId !== "string" ||
      !clientId
    ) {
      return NextResponse.json(
        { error: "Missing authorization information" },
        { status: 400 }
      );
    }

    // Token exchange and secure storage
    // must be implemented before enabling account linking.

    return NextResponse.json(
      {
        success: false,
        message: "Token exchange is not configured yet",
      },
      { status: 501 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to process request" },
      { status: 400 }
    );
  }
}
