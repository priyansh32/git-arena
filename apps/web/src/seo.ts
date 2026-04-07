import { useEffect } from "react";

const BASE_URL = "https://git-arena.hellopriyansh.xyz";
const DEFAULT_TITLE = "GitArena — Git challenges in real containers";
const DEFAULT_DESCRIPTION =
  "Real broken Git repositories. Real isolated containers. Fix them through a browser terminal and get scored on whether you actually solved it.";
const DEFAULT_IMAGE = buildThumbnailUrl({
  title: "GitArena",
  subtitle: "Git challenges in real containers"
});

type SeoConfig = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
};

function upsertMetaTag(attr: "name" | "property", key: string, value: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}='${key}']`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", value);
}

function upsertCanonicalTag(href: string): void {
  let canonical = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  canonical.setAttribute("href", href);
}

function resolveAbsoluteUrl(path: string): string {
  return new URL(path, `${BASE_URL}/`).toString();
}

export function buildThumbnailUrl({ title, subtitle }: { title: string; subtitle: string }): string {
  const text = encodeURIComponent(title);
  const sub = encodeURIComponent(subtitle);
  return `https://og-image.vercel.app/${text}.png?theme=dark&md=0&fontSize=96px&images=https%3A%2F%2Fgit-arena.hellopriyansh.xyz%2Ffavicon.svg&heights=120&widths=120&caption=${sub}`;
}

export function useSeo(config: SeoConfig): void {
  useEffect(() => {
    const title = config.title ?? DEFAULT_TITLE;
    const description = config.description ?? DEFAULT_DESCRIPTION;
    const path = config.path ?? "/";
    const pageUrl = resolveAbsoluteUrl(path);
    const image = config.image ?? DEFAULT_IMAGE;

    document.title = title;
    upsertCanonicalTag(pageUrl);

    upsertMetaTag("name", "description", description);

    upsertMetaTag("property", "og:type", "website");
    upsertMetaTag("property", "og:site_name", "GitArena");
    upsertMetaTag("property", "og:locale", "en_US");
    upsertMetaTag("property", "og:title", title);
    upsertMetaTag("property", "og:description", description);
    upsertMetaTag("property", "og:url", pageUrl);
    upsertMetaTag("property", "og:image", image);
    upsertMetaTag("property", "og:image:alt", title);

    upsertMetaTag("name", "twitter:card", "summary_large_image");
    upsertMetaTag("name", "twitter:title", title);
    upsertMetaTag("name", "twitter:description", description);
    upsertMetaTag("name", "twitter:url", pageUrl);
    upsertMetaTag("name", "twitter:image", image);
  }, [config.description, config.image, config.path, config.title]);
}

export const seoDefaults = {
  BASE_URL,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE
};
