import { describe, expect, it } from "@effect/vitest";

import {
  buildTrelloImageIndexByUrl,
  collectTrelloCardImages,
  extractEmbeddedImageUrls,
  extractHtmlImageUrls,
  extractMarkdownImageUrls,
  isLikelyImageUrl,
  normalizeTrelloImageDedupeKey,
  normalizeEmbeddedImagesForMarkdown,
  resolveTrelloImageLightboxIndex,
} from "./trelloCardImages.ts";

describe("trelloCardImages", () => {
  const cardId = "6a04369a7d2289d6d8333e54";
  const attachmentId = "6a0436de08bfd2c2b3e6cb15";
  const downloadUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/photo.png`;
  const previewUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/preview/photo.png`;

  it("extracts markdown and html image urls", () => {
    expect(extractMarkdownImageUrls("See ![screenshot](https://example.com/a.png) here")).toEqual([
      "https://example.com/a.png",
    ]);
    expect(extractHtmlImageUrls('<img src="https://example.com/b.jpg" alt="x" />')).toEqual([
      "https://example.com/b.jpg",
    ]);
    expect(
      extractEmbeddedImageUrls(
        '![a](https://example.com/a.png)\n<img src="https://example.com/b.jpg" />',
      ),
    ).toEqual(["https://example.com/a.png", "https://example.com/b.jpg"]);
  });

  it("dedupes preview and download attachment urls", () => {
    const cardId = "6a04369a7d2289d6d8333e54";
    const attachmentId = "6a0436de08bfd2c2b3e6cb15";
    const previewId = "6a0436df08bfd2c2b3e6cc5a";
    const downloadUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/photo.png`;
    const previewUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/preview/photo.png`;
    const nestedPreviewUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/previews/${previewId}/download/photo.png`;

    expect(normalizeTrelloImageDedupeKey(downloadUrl)).toBe(
      normalizeTrelloImageDedupeKey(previewUrl),
    );
    expect(normalizeTrelloImageDedupeKey(nestedPreviewUrl)).toBe(
      normalizeTrelloImageDedupeKey(downloadUrl),
    );

    const images = collectTrelloCardImages({
      imageAttachments: [{ url: downloadUrl, name: "photo.png" }],
      desc: `Inline ![photo](${nestedPreviewUrl})`,
      commentTexts: [],
    });

    expect(images).toEqual([{ url: downloadUrl, name: "photo.png" }]);
  });

  it("collects markdown-only images and resolves lightbox indexes", () => {
    const images = collectTrelloCardImages({
      imageAttachments: [],
      desc: `![diagram](${previewUrl})`,
      commentTexts: [`Comment ![shot](https://example.com/shot.webp)`],
    });

    expect(images).toEqual([
      { url: previewUrl, name: "photo.png" },
      { url: "https://example.com/shot.webp", name: "shot.webp" },
    ]);

    const indexByUrl = buildTrelloImageIndexByUrl(images);
    expect(resolveTrelloImageLightboxIndex(indexByUrl, previewUrl)).toBe(0);
    expect(resolveTrelloImageLightboxIndex(indexByUrl, downloadUrl)).toBe(0);
    expect(resolveTrelloImageLightboxIndex(indexByUrl, "https://example.com/shot.webp")).toBe(1);
  });

  it("converts html img tags to markdown for rendering", () => {
    expect(
      normalizeEmbeddedImagesForMarkdown('<p>Look</p><img src="https://example.com/a.png" />'),
    ).toContain("![Image](https://example.com/a.png)");
  });

  it("ignores non-image attachment urls", () => {
    const pdfUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/spec.pdf`;
    expect(isLikelyImageUrl(pdfUrl)).toBe(false);
    expect(
      collectTrelloCardImages({
        imageAttachments: [{ url: pdfUrl, name: "spec.pdf" }],
        desc: "",
        commentTexts: [],
      }),
    ).toEqual([]);
  });
});
