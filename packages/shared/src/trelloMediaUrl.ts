export const TRELLO_MEDIA_SCHEME = "trello-media";

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const ALLOWED_TRELLO_MEDIA_HOSTS = new Set([
  "api.trello.com",
  "trello.com",
  "trello-members.s3.amazonaws.com",
]);

export function isAllowedTrelloMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (ALLOWED_TRELLO_MEDIA_HOSTS.has(hostname)) return true;
    if (hostname.endsWith(".public.atl-paas.net")) return true;
    if (hostname.endsWith(".prod.atl-paas.net")) return true;
    return hostname.includes("trello") && hostname.endsWith(".amazonaws.com");
  } catch {
    return false;
  }
}

export function appendTrelloAuthParams(sourceUrl: string, apiKey: string, token: string): string {
  const url = new URL(sourceUrl);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildTrelloMediaUrl(sourceUrl: string): string {
  return `${TRELLO_MEDIA_SCHEME}://asset/${encodeBase64Url(sourceUrl)}`;
}

export function parseTrelloMediaRequestUrl(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== `${TRELLO_MEDIA_SCHEME}:`) return null;
    if (url.hostname !== "asset") return null;
    const encoded = url.pathname.replace(/^\//, "");
    if (!encoded) return null;
    const sourceUrl = decodeBase64Url(encoded);
    return isAllowedTrelloMediaUrl(sourceUrl) ? sourceUrl : null;
  } catch {
    return null;
  }
}

export function resolveTrelloMediaPreviewUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  if (typeof globalThis !== "undefined") {
    const bridge = (globalThis as { desktopBridge?: unknown }).desktopBridge;
    if (bridge) return buildTrelloMediaUrl(sourceUrl);
  }
  return sourceUrl;
}
