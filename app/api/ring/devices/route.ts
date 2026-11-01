import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { neon } from "@neondatabase/serverless";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };

function key(): Buffer {
  const encoded = process.env.RING_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Encryption key missing");
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32) throw new Error("Invalid encryption key");
  return value;
}

function decrypt(input: string): string {
  const parts = input.split(".").map((part) => Buffer.from(part, "base64"));
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) {
    throw new Error("Invalid encrypted token");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), parts[0]);
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}

function encrypt(input: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(input, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

function hardwareId(accountId: string): string {
  const hash = createHash("sha256").update("RingPetWatch/1.0:" + accountId).digest("hex");
  return [hash.slice(0,8), hash.slice(8,12), "4" + hash.slice(13,16), "8" + hash.slice(17,20), hash.slice(20,32)].join("-");
}

export async function GET() {
  if (!(await auth())?.user) {
    return NextResponse.json({ error: "Sign in with GitHub first." }, { status: 401, headers: responseHeaders });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503, headers: responseHeaders });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql.query(
      "SELECT ring_account_id, access_token_encrypted, refresh_token_encrypted, expires_at FROM ring_oauth_tokens WHERE claimed_at IS NOT NULL ORDER BY claimed_at DESC LIMIT 1"
    );
    if (!rows.length) {
      return NextResponse.json({ connected: false, devices: [],
        message: "No completed Ring account link is stored. Reconnect Ring through the developer portal."
      }, { headers: responseHeaders });
    }
    const current = rows[0];
    const accountId = String(current.ring_account_id);
    let accessToken = decrypt(String(current.access_token_encrypted));
    const ringHeaders = {
      "User-Agent": "RingPetWatch/1.0",
      "Hardware_Id": hardwareId(accountId),
      "Content-Type": "application/json"
    };

    if (new Date(String(current.expires_at)).getTime() <= Date.now() + 300000) {
      const clientId = process.env.RING_CLIENT_ID;
      const clientSecret = process.env.RING_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error("Ring credentials missing");
      const refresh = await fetch("https://oauth.ring.com/oauth/token", {
        method: "POST",
        headers: { ...ringHeaders, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: decrypt(String(current.refresh_token_encrypted)),
          client_id: clientId,
          client_secret: clientSecret
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000)
      });
      if (!refresh.ok) {
        return NextResponse.json({ error: "Ring token refresh failed. Reconnect your Ring account." },
          { status: 409, headers: responseHeaders });
      }
      const data: unknown = await refresh.json();
      if (!data || typeof data !== "object") throw new Error("Invalid refresh response");
      const tokens = data as Record<string, unknown>;
      if (typeof tokens.access_token !== "string" ||
          typeof tokens.refresh_token !== "string" ||
          !Number.isFinite(Number(tokens.expires_in)) ||
          Number(tokens.expires_in) <= 0) throw new Error("Invalid refreshed tokens");
      accessToken = tokens.access_token;
      await sql.query(
        "UPDATE ring_oauth_tokens SET access_token_encrypted = $1, refresh_token_encrypted = $2, expires_at = $3, updated_at = NOW() WHERE ring_account_id = $4 AND refresh_token_encrypted = $5",
        [encrypt(tokens.access_token), encrypt(tokens.refresh_token),
          new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString(), accountId,
          String(current.refresh_token_encrypted)]
      );
    }

    const response = await fetch("https://api.amazonvision.com/v1/devices", {
      headers: { ...ringHeaders, Authorization: "Bearer " + accessToken },
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const message = response.status === 401 ? "Ring authentication expired. Please reconnect." :
        response.status === 406 ? "Ring rejected the cloud request (406). Check Ring API server access." :
          "Ring returned an error while listing devices.";
      return NextResponse.json({ error: message }, { status: 502, headers: responseHeaders });
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" ||
        !Array.isArray((payload as { data?: unknown }).data)) throw new Error("Invalid device list");
    const list = (payload as { data: unknown[] }).data;
    const devices = list.filter((entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && typeof (entry as Record<string, unknown>).id === "string")
      .map((entry) => {
        const attrs = entry.attributes && typeof entry.attributes === "object"
          ? entry.attributes as Record<string, unknown> : {};
        return {
          id: String(entry.id),
          name: typeof attrs.name === "string" ? attrs.name : "Unnamed Ring device",
          type: typeof entry.type === "string" ? entry.type : "device"
        };
      });
    return NextResponse.json({ connected: true, devices }, { headers: responseHeaders });
  } catch {
    console.error("Ring device discovery failed");
    return NextResponse.json(
      { error: "Unable to load Ring devices. Check the Vercel runtime logs." },
      { status: 500, headers: responseHeaders }
    );
  }
}
