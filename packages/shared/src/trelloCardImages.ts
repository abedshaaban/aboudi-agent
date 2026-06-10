import { parseTrelloCardAttachmentUrl } from "./trelloMediaUrl.ts";

export type TrelloCardImage = {
  readonly url: string;
  readonly name: string;
};

const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HTML_IMAGE_REGEX = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const IMAGE_EXTENSION_REGEX = /\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/i;

export function extractMarkdownImageUrls(text: string): readonly string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const url = match[1]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}

export function extractHtmlImageUrls(text: string): readonly string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(HTML_IMAGE_REGEX)) {
    const url = match[1]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}

export function extractEmbeddedImageUrls(text: string): readonly string[] {
  return [...extractMarkdownImageUrls(text), ...extractHtmlImageUrls(text)];
}

export function isLikelyImageUrl(url: string): boolean {
  const attachment = parseTrelloCardAttachmentUrl(url);
  if (attachment) {
    return IMAGE_EXTENSION_REGEX.test(attachment.fileName);
  }
  return IMAGE_EXTENSION_REGEX.test(url);
}

export function normalizeTrelloImageDedupeKey(url: string): string {
  const attachment = parseTrelloCardAttachmentUrl(url);
  if (attachment) {
    return `attachment:${attachment.cardId}:${attachment.attachmentId}`;
  }
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function imageNameFromUrl(url: string): string {
  const attachment = parseTrelloCardAttachmentUrl(url);
  if (attachment?.fileName) return attachment.fileName;
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").pop();
    if (segment) return decodeURIComponent(segment);
  } catch {
    // fall through
  }
  return "Image";
}

export function collectTrelloCardImages(input: {
  readonly imageAttachments: readonly { readonly url: string; readonly name: string }[];
  readonly desc: string;
  readonly commentTexts: readonly string[];
}): readonly TrelloCardImage[] {
  const seen = new Set<string>();
  const images: TrelloCardImage[] = [];

  const add = (url: string, name?: string) => {
    const trimmed = url.trim();
    if (!trimmed || !isLikelyImageUrl(trimmed)) return;
    const key = normalizeTrelloImageDedupeKey(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    images.push({ url: trimmed, name: name ?? imageNameFromUrl(trimmed) });
  };

  for (const attachment of input.imageAttachments) {
    add(attachment.url, attachment.name);
  }
  for (const url of extractEmbeddedImageUrls(input.desc)) {
    add(url);
  }
  for (const text of input.commentTexts) {
    for (const url of extractEmbeddedImageUrls(text)) {
      add(url);
    }
  }

  return images;
}

export function buildTrelloImageIndexByUrl(
  images: readonly TrelloCardImage[],
): ReadonlyMap<string, number> {
  const indexByUrl = new Map<string, number>();
  images.forEach((image, index) => {
    indexByUrl.set(normalizeTrelloImageDedupeKey(image.url), index);
  });
  return indexByUrl;
}

export function normalizeEmbeddedImagesForMarkdown(text: string): string {
  return text.replace(HTML_IMAGE_REGEX, (_match, src: string | undefined) => {
    const url = src?.trim();
    if (!url) return _match;
    return `\n\n![Image](${url})\n\n`;
  });
}

export function resolveTrelloImageLightboxIndex(
  indexByUrl: ReadonlyMap<string, number>,
  url: string | null | undefined,
): number | null {
  if (!url) return null;
  return indexByUrl.get(normalizeTrelloImageDedupeKey(url)) ?? null;
}
