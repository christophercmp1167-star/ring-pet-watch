import { NextRequest } from "next/server";
import { auth } from "../../../../auth";
import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RING_API = "https://api.amazonvision.com/v1/accounts/me/app-integrations";
const TEN_MINUTES_MS = 600_000;
const GITHUB_USERNAME = "christophercmp1167-star";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;",
    };
    return entities[char];
  });
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + escapeHtml(title) + ' · Ring Pet Watch</title>' +
      '<style>body{font:16px system-ui,sans-serif;max-width:580px;margin:8vh auto;' +
      'padding:24px;color:#e2e8f0;background:#0f172a}main{background:#1e293b;' +
      'padding:28px;border-radius:14px}button,a.button{background:#2563eb;' +
      'border:0;color:white;padding:12px 18px;border-radius:8px;cursor:pointer;' +
      'display:inline-block;text-decoration:none}p{line-height:1.5}</style>' +
      '</head><body><main><h1>' + escapeHtml(title) + '</h1>' +
      body + '</main></body></html>',
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

function validTimeAndNonce(nonce: string, time: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce) || !/^\d{13}$/.test(time)) {
    return false;
  }
  const timestamp = Number(time);
  return Number.isSafeInteger(timestamp) &&
    Math.abs(Date.now() - timestamp) <= TEN_MINUTES_MS;
}

function decryptToken(encrypted: string): string {
  const encodedKey = process.env.RING_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("Missing encryption key");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("Invalid encryption key");
  const pieces = encrypted.split(".");
  if (pieces.length !== 3) throw new Error("Invalid encrypted token");
  const [iv, tag, ciphertext] = pieces.map((part) => Buffer.from(part, "base64"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function authorized(): Promise<boolean> {
  // The GitHub provider's signIn callback in auth.ts restricts this session
  // to the owner's GitHub account. Check again here before claiming a token.
  const session = await auth();
  return Boolean(session?.user);
}

function linkingForm(nonce: string, time: string): string {
  return '<p>You are signed in to Ring Pet Watch. Confirm to connect your Ring account.</p>' +
    '<form method="POST" action="/api/ring/link">' +
    '<input type="hidden" name="nonce" value="' + escapeHtml(nonce) + '">' +
    '<input type="hidden" name="time" value="' + escapeHtml(time) + '">' +
    '<button type="submit">Confirm Ring connection</button></form>';
}

export async function GET(request: NextRequest) {
  const nonce = request.nextUrl.searchParams.get("nonce") || "";
  const time = request.nextUrl.searchParams.get("time") || "";
  if (!validTimeAndNonce(nonce, time)) {
    return page("Link expired or missing", "<p>Start the connection again from Ring. This link is valid for 10 minutes.</p>", 400);
  }
  if (!(await authorized())) {
    const callbackUrl = request.nextUrl.origin + "/api/ring/link?nonce=" +
      encodeURIComponent(nonce) + "&time=" + encodeURIComponent(time);
    const signInUrl = "/api/auth/signin?callbackUrl=" + encodeURIComponent(callbackUrl);
    return page("Sign in first", '<p>Sign in with your authorized GitHub account to finish linking.</p>' +
      '<a class="button" href="' + escapeHtml(signInUrl) + '">Sign in with GitHub</a>');
  }
  return page("Connect Ring", linkingForm(nonce, time));
}

export async function POST(request: NextRequest) {
  // Reject cross-site form submissions even if the browser sends cookies.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return page("Request blocked", "<p>Invalid request origin.</p>", 403);
  }
  if (!(await authorized())) {
    return page("Sign in required", "<p>Return to the Ring link and sign in first.</p>", 401);
  }
  if (!(request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded")) {
    return page("Invalid request", "<p>Unsupported request format.</p>", 415);
  }

  const form = await request.formData();
  const nonce = form.get("nonce");
  const time = form.get("time");
  if (typeof nonce !== "string" || typeof time !== "string" || !validTimeAndNonce(nonce, time)) {
    return page("Link expired", "<p>Restart the link from Ring to get a new verification link.</p>", 400);
  }

  const hmacKey = process.env.RING_HMAC_SIGNATURE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!hmacKey || !databaseUrl) {
    return page("Setup incomplete", "<p>Server configuration is missing.</p>", 503);
  }

  const sql = neon(databaseUrl);
  try {
    const rows = await sql`SELECT ring_account_id, access_token_encrypted, expires_at FROM ring_oauth_tokens WHERE claimed_at IS NULL`;
    const received = Buffer.from(nonce, "base64url");
    let match: (typeof rows)[number] | undefined;
    for (const row of rows) {
      const accountId = row.ring_account_id;
      if (typeof accountId !== "string") continue;
      const expected = createHmac("sha256", hmacKey)
        .update(time + ":" + accountId, "utf8").digest();
      if (received.length === expected.length && timingSafeEqual(received, expected)) {
        match = row;
        break;
      }
    }

    if (!match) {
      return page("No matching Ring account", "<p>No unclaimed Ring token matches this link. Start again from Ring.</p>", 404);
    }
    if (new Date(match.expires_at).getTime() <= Date.now() + 60_000) {
      return page("Token expired", "<p>The Ring access token expired. Please reconnect through Ring.</p>", 409);
    }
    const accessToken = decryptToken(match.access_token_encrypted);
    const headers = {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    };
    const accountIdentifier = "GitHub: " + GITHUB_USERNAME.slice(0, 3) + "***";
    const verify = await fetch(RING_API, {
      method: "POST",
      headers,
      body: JSON.stringify({ account_identifier: accountIdentifier, nonce }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!verify.ok) {
      return page("Ring verification failed", "<p>Ring did not accept this connection. Try again from the Ring app.</p>", 502);
    }
    const complete = await fetch(RING_API, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "completed" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!complete.ok) {
      return page("Link not completed", "<p>Ring accepted verification but could not finish activation. Contact support before retrying.</p>", 502);
    }
    await sql`UPDATE ring_oauth_tokens SET claimed_at = NOW(), updated_at = NOW() WHERE ring_account_id = ${match.ring_account_id} AND claimed_at IS NULL`;
    return page("Ring connected", '<p>Your Ring account is linked to Ring Pet Watch.</p>' +
      '<a class="button" href="/">Open dashboard</a>');
  } catch {
    // Never log Ring tokens, the nonce or database credentials.
    console.error("Ring account linking failed");
    return page("Unable to complete linking", "<p>There was a server error. Please try again later.</p>", 500);
  }
}
