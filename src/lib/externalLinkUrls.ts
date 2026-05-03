import type { EntityType } from "@/lib/api/entityResolver";

function isHttpUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function externalLinkUrl(
  platform: string,
  externalId?: string | null,
  entityType?: EntityType | string | null,
  existingUrl?: string | null,
): string | null {
  if (isHttpUrl(existingUrl)) return existingUrl;
  const id = String(externalId ?? "").trim();
  if (!id) return null;
  const type = entityType === "album" ? "album" : entityType === "track" ? "track" : "artist";

  switch (platform.toLowerCase()) {
    case "spotify":
      return `https://open.spotify.com/${type}/${encodeURIComponent(id)}`;
    case "apple":
    case "apple_music":
      return type === "track" ? null : `https://music.apple.com/artist/${encodeURIComponent(id)}`;
    case "deezer":
      return `https://www.deezer.com/${type}/${encodeURIComponent(id)}`;
    case "youtube":
      return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    case "musicbrainz":
      return `https://musicbrainz.org/${type === "track" ? "recording" : type}/${encodeURIComponent(id)}`;
    case "soundcharts":
      return `https://app.soundcharts.com/app/artist/${encodeURIComponent(id)}`;
    case "instagram":
      return `https://www.instagram.com/${encodeURIComponent(id.replace(/^@/, ""))}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${encodeURIComponent(id.replace(/^@/, ""))}`;
    default:
      return null;
  }
}