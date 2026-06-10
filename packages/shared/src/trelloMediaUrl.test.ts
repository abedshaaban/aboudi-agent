import { describe, expect, it } from "@effect/vitest";

import {
  appendTrelloAuthParams,
  buildTrelloMediaUrl,
  isAllowedTrelloMediaUrl,
  parseTrelloMediaRequestUrl,
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
    expect(parseTrelloMediaRequestUrl(proxied)).toBe(source);
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
