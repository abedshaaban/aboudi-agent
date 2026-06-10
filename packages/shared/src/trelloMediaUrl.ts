export const TRELLO_MEDIA_SCHEME = "trello-media";

const TRELLO_MEMBER_ID_PATTERN = /^[a-f0-9]{24}$/i;

export type TrelloMediaRequest =
  | { readonly kind: "asset"; readonly sourceUrl: string }
  | { readonly kind: "member-avatar"; readonly memberId: string };

export type TrelloMediaFetchTarget = {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export type TrelloCardAttachmentRef = {
  readonly cardId: string;
  readonly attachmentId: string;
  readonly kind: "download" | "preview";
  readonly fileName: string;
};

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

export function buildTrelloOAuthAuthorizationHeader(apiKey: string, token: string): string {
  return `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`;
}

export function parseTrelloCardAttachmentUrl(sourceUrl: string): TrelloCardAttachmentRef | null {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "trello.com" && host !== "api.trello.com") return null;
    const match = url.pathname.match(
      /^\/1\/cards\/([a-f0-9]{24})\/attachments\/([a-f0-9]{24})\/(download|preview)\/(.+)$/i,
    );
    if (!match) return null;
    const kind = match[3]?.toLowerCase() === "preview" ? "preview" : "download";
    const fileName = decodeURIComponent(match[4] ?? "");
    if (!fileName) return null;
    return {
      cardId: match[1] ?? "",
      attachmentId: match[2] ?? "",
      kind,
      fileName,
    };
  } catch {
    return null;
  }
}

export function buildTrelloAttachmentFetchTarget(
  attachment: TrelloCardAttachmentRef,
  apiKey: string,
  token: string,
): TrelloMediaFetchTarget {
  return {
    url: `https://api.trello.com/1/cards/${attachment.cardId}/attachments/${attachment.attachmentId}/${attachment.kind}/${encodeURIComponent(attachment.fileName)}`,
    headers: {
      Authorization: buildTrelloOAuthAuthorizationHeader(apiKey, token),
    },
  };
}

export function buildTrelloMediaUrl(sourceUrl: string): string {
  return `${TRELLO_MEDIA_SCHEME}://asset/${encodeBase64Url(sourceUrl)}`;
}

export function buildTrelloMemberAvatarMediaUrl(memberId: string): string {
  return `${TRELLO_MEDIA_SCHEME}://member/${memberId}`;
}

export function parseTrelloMembersAvatarUrl(
  sourceUrl: string,
): { readonly memberId: string; readonly avatarHash: string } | null {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname.toLowerCase() !== "trello-members.s3.amazonaws.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const memberId = segments[0] ?? "";
    const rawHash = segments[1] ?? "";
    const avatarHash = rawHash.replace(/\.(png|jpe?g|gif|webp)$/i, "");
    if (!TRELLO_MEMBER_ID_PATTERN.test(memberId) || avatarHash.length === 0) return null;
    return { memberId, avatarHash };
  } catch {
    return null;
  }
}

export function resolveAuthenticatedTrelloMediaFetchUrl(
  request: TrelloMediaRequest,
  apiKey: string,
  token: string,
): string {
  if (request.kind === "member-avatar") {
    return appendTrelloAuthParams(
      `https://api.trello.com/1/members/${request.memberId}/avatar`,
      apiKey,
      token,
    );
  }

  const memberAvatar = parseTrelloMembersAvatarUrl(request.sourceUrl);
  if (memberAvatar) {
    return appendTrelloAuthParams(
      `https://api.trello.com/1/members/${memberAvatar.memberId}/avatar`,
      apiKey,
      token,
    );
  }

  return appendTrelloAuthParams(request.sourceUrl, apiKey, token);
}

export function buildTrelloMembersAvatarFetchUrls(input: {
  readonly memberId: string;
  readonly avatarHash?: string | null;
  readonly apiKey: string;
  readonly token: string;
}): readonly string[] {
  const urls: string[] = [
    appendTrelloAuthParams(
      `https://api.trello.com/1/members/${input.memberId}/avatar`,
      input.apiKey,
      input.token,
    ),
  ];
  if (input.avatarHash) {
    urls.push(
      appendTrelloAuthParams(
        `https://trello-members.s3.amazonaws.com/${input.memberId}/${input.avatarHash}/50.png`,
        input.apiKey,
        input.token,
      ),
      appendTrelloAuthParams(
        `https://trello-members.s3.amazonaws.com/${input.memberId}/${input.avatarHash}/170.png`,
        input.apiKey,
        input.token,
      ),
    );
  }
  return urls;
}

export function buildTrelloMembersAvatarFetchTargets(input: {
  readonly memberId: string;
  readonly avatarHash?: string | null;
  readonly apiKey: string;
  readonly token: string;
}): readonly TrelloMediaFetchTarget[] {
  return buildTrelloMembersAvatarFetchUrls(input).map((url) => ({ url }));
}

export function buildTrelloAssetFetchTargets(
  sourceUrl: string,
  apiKey: string,
  token: string,
): readonly TrelloMediaFetchTarget[] {
  const attachment = parseTrelloCardAttachmentUrl(sourceUrl);
  if (attachment) {
    return [buildTrelloAttachmentFetchTarget(attachment, apiKey, token)];
  }

  const memberAvatar = parseTrelloMembersAvatarUrl(sourceUrl);
  if (memberAvatar) {
    return buildTrelloMembersAvatarFetchTargets({
      memberId: memberAvatar.memberId,
      avatarHash: memberAvatar.avatarHash,
      apiKey,
      token,
    });
  }

  return [{ url: appendTrelloAuthParams(sourceUrl, apiKey, token) }];
}

export function parseTrelloMediaRequestUrl(requestUrl: string): TrelloMediaRequest | null {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== `${TRELLO_MEDIA_SCHEME}:`) return null;
    if (url.hostname === "member") {
      const memberId = url.pathname.replace(/^\//, "");
      return TRELLO_MEMBER_ID_PATTERN.test(memberId) ? { kind: "member-avatar", memberId } : null;
    }
    if (url.hostname !== "asset") return null;
    const encoded = url.pathname.replace(/^\//, "");
    if (!encoded) return null;
    const sourceUrl = decodeBase64Url(encoded);
    return isAllowedTrelloMediaUrl(sourceUrl) ? { kind: "asset", sourceUrl } : null;
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

export function resolveTrelloMemberAvatarPreviewUrl(member: {
  readonly id: string;
  readonly avatarUrl: string | null;
}): string | null {
  if (!member.avatarUrl) return null;
  if (typeof globalThis !== "undefined") {
    const bridge = (globalThis as { desktopBridge?: unknown }).desktopBridge;
    if (bridge) return buildTrelloMemberAvatarMediaUrl(member.id);
  }
  return member.avatarUrl;
}
