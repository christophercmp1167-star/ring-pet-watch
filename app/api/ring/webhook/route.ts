import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.RING_HMAC_SIGNATURE_KEY;
    const signature = request.headers.get("x-signature");

    if (!secret) {
      return NextResponse.json(
        { error: "Webhook is not configured" },
        { status: 503 }
      );
    }

    if (!signature?.startsWith("sha256=")) {
      return NextResponse.json(
        { error: "Missing or invalid signature" },
        { status: 401 }
      );
    }

    const rawBody = Buffer.from(await request.arrayBuffer());

    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest();

    const receivedHex = signature.slice(7);

    if (!/^[0-9a-f]{64}$/i.test(receivedHex)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const received = Buffer.from(receivedHex, "hex");

    if (!timingSafeEqual(expected, received)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    const eventType = event?.data?.type;

    // Future: process verified Ring camera events here.

    return NextResponse.json({
      success: true,
      message: "Ring event received",
      eventType,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to process webhook" },
      { status: 400 }
    );
  }
}
