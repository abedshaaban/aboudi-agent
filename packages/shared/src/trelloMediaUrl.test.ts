import { describe, expect, it } from "@effect/vitest";

import {
  appendTrelloAuthParams,
  buildTrelloAssetFetchTargets,
  buildTrelloAttachmentFetchTarget,
  buildTrelloMediaUrl,
  buildTrelloMemberAvatarMediaUrl,
  buildTrelloMembersAvatarFetchUrls,
  buildTrelloOAuthAuthorizationHeader,
  isAllowedTrelloMediaUrl,
  parseTrelloCardAttachmentUrl,
  parseTrelloMediaRequestUrl,
  resolveAuthenticatedTrelloMediaFetchUrl,
} from "./trelloMediaUrl.ts";

describe("trelloMediaUrl", () => {
  it("allows known Trello media hosts", () => {
    expect(
      isAllowedTrelloMediaUrl("https://trello.com/1/cards/x/attachments/y/download/file.png"),
    ).toBe(true);
    expect(isAllowedTrelloMediaUrl("https://trello-members.s3.amazonaws.com/abc/def/50.png")).toBe(
      true,
    );
    expect(
      isAllowedTrelloMediaUrl(
        "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/abc",
      ),
    ).toBe(true);
  });

  it("rejects non-Trello hosts", () => {
    expect(isAllowedTrelloMediaUrl("https://example.com/image.png")).toBe(false);
    expect(isAllowedTrelloMediaUrl("http://trello.com/image.png")).toBe(false);
  });

  it("round-trips media URLs through the custom scheme", () => {
    const source = "https://trello.com/1/cards/abc/attachments/def/download/photo.png";
    const proxied = buildTrelloMediaUrl(source);
    expect(parseTrelloMediaRequestUrl(proxied)).toEqual({ kind: "asset", sourceUrl: source });
  });

  it("routes member avatars through the Trello API instead of private S3 URLs", () => {
    const memberId = "6019708c1f3187308cedc996";
    const avatarHash = "d64af049867493e1e9ebaf3222cb786d";
    const source = `https://trello-members.s3.amazonaws.com/${memberId}/${avatarHash}`;
    const proxied = buildTrelloMemberAvatarMediaUrl(memberId);
    expect(parseTrelloMediaRequestUrl(proxied)).toEqual({ kind: "member-avatar", memberId });
    expect(
      resolveAuthenticatedTrelloMediaFetchUrl(
        { kind: "asset", sourceUrl: source },
        "api-key",
        "token",
      ),
    ).toBe(`https://api.trello.com/1/members/${memberId}/avatar?key=api-key&token=token`);
    expect(
      buildTrelloMembersAvatarFetchUrls({
        memberId,
        avatarHash,
        apiKey: "api-key",
        token: "token",
      }),
    ).toEqual([
      `https://api.trello.com/1/members/${memberId}/avatar?key=api-key&token=token`,
      `https://trello-members.s3.amazonaws.com/${memberId}/${avatarHash}/50.png?key=api-key&token=token`,
      `https://trello-members.s3.amazonaws.com/${memberId}/${avatarHash}/170.png?key=api-key&token=token`,
    ]);
  });

  it("uses OAuth headers for authenticated card attachment downloads", () => {
    const cardId = "6a04369a7d2289d6d8333e54";
    const attachmentId = "6a0436de08bfd2c2b3e6cb15";
    const source = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/image.png`;
    expect(parseTrelloCardAttachmentUrl(source)).toEqual({
      cardId,
      attachmentId,
      kind: "download",
      fileName: "image.png",
    });
    expect(buildTrelloOAuthAuthorizationHeader("api-key", "token")).toBe(
      'OAuth oauth_consumer_key="api-key", oauth_token="token"',
    );
    expect(
      buildTrelloAttachmentFetchTarget(
        { cardId, attachmentId, kind: "download", fileName: "image.png" },
        "api-key",
        "token",
      ),
    ).toEqual({
      url: `https://api.trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/image.png`,
      headers: {
        Authorization: 'OAuth oauth_consumer_key="api-key", oauth_token="token"',
      },
    });
    expect(buildTrelloAssetFetchTargets(source, "api-key", "token")).toEqual([
      {
        url: `https://api.trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/image.png`,
        headers: {
          Authorization: 'OAuth oauth_consumer_key="api-key", oauth_token="token"',
        },
      },
    ]);
  });

  it("uses OAuth headers for nested attachment preview downloads", () => {
    const cardId = "6a04369a7d2289d6d8333e54";
    const attachmentId = "6a0436de08bfd2c2b3e6cb15";
    const previewId = "6a0436df08bfd2c2b3e6cc5a";
    const source = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/previews/${previewId}/download/image.webp`;
    expect(parseTrelloCardAttachmentUrl(source)).toEqual({
      cardId,
      attachmentId,
      previewId,
      kind: "download",
      fileName: "image.webp",
    });
    expect(buildTrelloAssetFetchTargets(source, "api-key", "token")).toEqual([
      {
        url: `https://api.trello.com/1/cards/${cardId}/attachments/${attachmentId}/previews/${previewId}/download/image.webp`,
        headers: {
          Authorization: 'OAuth oauth_consumer_key="api-key", oauth_token="token"',
        },
      },
      {
        url: `https://api.trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/image.webp`,
        headers: {
          Authorization: 'OAuth oauth_consumer_key="api-key", oauth_token="token"',
        },
      },
      {
        url: `https://api.trello.com/1/cards/${cardId}/attachments/${attachmentId}/preview/image.webp`,
        headers: {
          Authorization: 'OAuth oauth_consumer_key="api-key", oauth_token="token"',
        },
      },
    ]);
  });

  it("appends Trello auth params without dropping existing query params", () => {
    const authenticated = appendTrelloAuthParams(
      "https://trello.com/1/cards/abc/attachments/def/download/photo.png?foo=bar",
      "api-key",
      "token",
    );
    const url = new URL(authenticated);
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("key")).toBe("api-key");
    expect(url.searchParams.get("token")).toBe("token");
  });
});
