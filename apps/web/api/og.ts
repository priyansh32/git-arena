export const config = {
  runtime: "edge"
};

function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function handler(request: Request): Response {
  const url = new URL(request.url);
  const title = escapeXml(clampText(url.searchParams.get("title") ?? "GitArena", 80));
  const subtitle = escapeXml(
    clampText(url.searchParams.get("subtitle") ?? "Git challenges in real containers", 140)
  );

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0f172a" />
      <stop offset="1" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <circle cx="94" cy="94" r="12" fill="#7fe5f7" />
  <text x="124" y="104" fill="#7fe5f7" font-size="34" font-weight="700" font-family="Inter, Arial, sans-serif" letter-spacing="2">GITARENA</text>
  <text x="72" y="290" fill="#f8fafc" font-size="84" font-weight="800" font-family="Inter, Arial, sans-serif">${title}</text>
  <text x="72" y="354" fill="#cbd5e1" font-size="34" font-weight="500" font-family="Inter, Arial, sans-serif">${subtitle}</text>
  <text x="72" y="575" fill="#94a3b8" font-size="28" font-family="Inter, Arial, sans-serif">git-arena.hellopriyansh.xyz</text>
  <text x="1128" y="575" fill="#7fe5f7" text-anchor="end" font-size="28" font-weight="700" font-family="Inter, Arial, sans-serif">Practice. Fix. Verify.</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=31536000"
    }
  });
}
