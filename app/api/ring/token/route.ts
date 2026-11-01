import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createCipheriv, randomBytes } from "node:crypto";

export const runtime = "nodejs";

function encryptToken(token: string): string {
  const encodedKey = process.env.RING_TOKEN_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("Token encryption key is missing");
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error("Token encryption key must be 32 bytes");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export async function POST(request: NextRequest) {
  try {
    const clientId = process.env.RING_CLIENT_ID;
    const clientSecret = process.env.RING_CLIENT_SECRET;
    const databaseUrl = process.env.DATABASE_URL;

    if (
      !clientId ||
      !clientSecret ||
      !databaseUrl ||
      !process.env.RING_TOKEN_ENCRYPTION_KEY
    ) {
      return NextResponse.json(
        { error: "Server configuration incomplete" },
        { status: 503 }
      );
    }

    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/x-www-form-urlencoded")
    ) {
      return NextResponse.json(
        { error: "Unsupported content type" },
        { status: 415 }
      );
    }

    const body = await request.text();
    const params = new URLSearchParams(body);

    const code = params.get("code");
    const incomingClientId = params.get("client_id");

    if (!code || incomingClientId !== clientId) {
      return NextResponse.json(
        { error: "Invalid authorization request" },
        { status: 400 }
      );
    }

    // Exchange the authorization code with Ring.
    const tokenResponse = await fetch(
      "https://oauth.ring.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: "Ring token exchange failed" },
        { status: 502 }
      );
    }

    const tokens = await tokenResponse.json();

    if (
      typeof tokens.access_token !== "string" ||
      typeof tokens.refresh_token !== "string" ||
      !Number.isFinite(Number(tokens.expires_in)) ||
      Number(tokens.expires_in) <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid Ring token response" },
        { status: 502 }
      );
    }

    // Retrieve the Ring Account ID.
    const userResponse = await fetch(
      "https://api.amazonvision.com/v1/users/me",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!userResponse.ok) {
      return NextResponse.json(
        { error: "Unable to retrieve Ring account" },
        { status: 502 }
      );
    }

    const user = await userResponse.json();
    const ringAccountId = user?.data?.id;

    if (typeof ringAccountId !== "string" || !ringAccountId) {
      return NextResponse.json(
        { error: "Ring Account ID missing" },
        { status: 502 }
      );
    }

    // Encrypt tokens before database storage.
    const encryptedAccessToken = encryptToken(
      tokens.access_token
    );

    const encryptedRefreshToken = encryptToken(
      tokens.refresh_token
    );

    const expiresAt = new Date(
      Date.now() + Number(tokens.expires_in) * 1000
    );

    // Store the tokens in the Neon database.
    const sql = neon(databaseUrl);

    await sql`
      INSERT INTO ring_oauth_tokens (
        ring_account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        expires_at,
        updated_at
      )
      VALUES (
        ${ringAccountId},
        ${encryptedAccessToken},
        ${encryptedRefreshToken},
        ${expiresAt.toISOString()},
        NOW()
      )
      ON CONFLICT (ring_account_id)
      DO UPDATE SET
        access_token_encrypted =
          EXCLUDED.access_token_encrypted,
        refresh_token_encrypted =
          EXCLUDED.refresh_token_encrypted,
        expires_at =
          EXCLUDED.expires_at,
        updated_at = NOW()
    `;

    // Confirm success only after secure storage.
    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "Ring token exchange encountered an error"
    );

    return NextResponse.json(
      { error: "Token exchange could not be completed" },
      { status: 500 }
    );
  }
}
