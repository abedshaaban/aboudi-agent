import { memo, useMemo } from "react";
import type { Components } from "react-markdown";

import { resolveTrelloMediaPreviewUrl } from "@t3tools/shared/trelloMediaUrl";
import {
  normalizeEmbeddedImagesForMarkdown,
  resolveTrelloImageLightboxIndex,
} from "@t3tools/shared/trelloCardImages";

import ChatMarkdown from "../ChatMarkdown";
import { cn } from "../../lib/utils";

interface TrelloMarkdownProps {
  readonly text: string;
  readonly imageIndexByUrl: ReadonlyMap<string, number>;
  readonly onImageClick: (index: number) => void;
}

function TrelloMarkdown({ text, imageIndexByUrl, onImageClick }: TrelloMarkdownProps) {
  const markdownText = useMemo(() => normalizeEmbeddedImagesForMarkdown(text), [text]);
  const overrideComponents = useMemo<Components>(
    () => ({
      img({ src, alt, className, ...props }) {
        const sourceUrl = src?.trim() ?? "";
        const previewSrc = resolveTrelloMediaPreviewUrl(sourceUrl) ?? sourceUrl;
        const lightboxIndex = resolveTrelloImageLightboxIndex(imageIndexByUrl, sourceUrl);
        const image = (
          <img
            {...props}
            src={previewSrc}
            alt={alt ?? "Embedded image"}
            loading="lazy"
            draggable={false}
            className={cn(
              "my-2 max-h-80 max-w-full rounded-md border border-border/60 bg-muted/20 object-contain",
              lightboxIndex !== null ? "cursor-zoom-in" : className,
            )}
          />
        );

        if (lightboxIndex === null) {
          return image;
        }

        return (
          <button
            type="button"
            className="block max-w-full text-left"
            aria-label={`View ${alt ?? "image"} in lightbox`}
            onClick={() => onImageClick(lightboxIndex)}
          >
            {image}
          </button>
        );
      },
    }),
    [imageIndexByUrl, onImageClick],
  );

  return (
    <ChatMarkdown
      text={markdownText}
      cwd={undefined}
      isStreaming={false}
      overrideComponents={overrideComponents}
    />
  );
}

export default memo(TrelloMarkdown);
