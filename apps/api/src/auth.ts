import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface VerifiedGoogleIdentity {
  googleSub: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken, "utf8").digest("hex");
}

export function parseCookieHeader(
  cookieHeader: string | undefined
): Record<string, string> {
  if (!cookieHeader || cookieHeader.trim().length === 0) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .reduce<Record<string, string>>((acc, segment) => {
      const separatorIndex = segment.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = segment.slice(0, separatorIndex).trim();
      const value = segment.slice(separatorIndex + 1).trim();
      if (!key) {
        return acc;
      }

      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }

      return acc;
    }, {});
}

export async function verifyGoogleIdToken(
  idToken: string,
  googleClientId: string
): Promise<VerifiedGoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: googleClientId,
    issuer: GOOGLE_ISSUERS
  });

  const googleSub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const displayName =
    typeof payload.name === "string" ? payload.name.trim() : email.split("@")[0] ?? "Player";
  const avatarUrl =
    typeof payload.picture === "string" && payload.picture.trim().length > 0
      ? payload.picture.trim()
      : null;

  if (googleSub.length === 0) {
    throw new Error("Google token is missing subject");
  }

  if (email.length === 0) {
    throw new Error("Google token is missing email");
  }

  const emailVerified =
    payload.email_verified === true ||
    (typeof payload.email_verified === "string" &&
      payload.email_verified.toLowerCase() === "true");

  if (!emailVerified) {
    throw new Error("Google account email is not verified");
  }

  return {
    googleSub,
    email,
    displayName: displayName.length > 0 ? displayName : email,
    avatarUrl
  };
}

export function verifySimulatedGoogleToken(idToken: string): VerifiedGoogleIdentity {
  const raw = idToken.trim().replace(/^dev:/, "");
  const [rawEmail, rawDisplayName] = raw.split("|", 2);
  const fallbackEmail = "developer@gitarena.local";
  const email = (rawEmail ?? fallbackEmail).trim().toLowerCase() || fallbackEmail;
  const displayName =
    (rawDisplayName ?? "Local Developer").trim() || "Local Developer";

  return {
    googleSub: `simulated-${hashSessionToken(email).slice(0, 24)}`,
    email,
    displayName,
    avatarUrl: null
  };
}
