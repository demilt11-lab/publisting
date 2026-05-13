import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://publisting.net";

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  noindex?: boolean;
}

/**
 * Per-route head tags. Title is auto-suffixed with " — Publisting" when not
 * already present. Canonical defaults to the current pathname.
 */
export function SeoHead({ title, description, canonicalPath, noindex }: SeoHeadProps) {
  const location = useLocation();
  const path = canonicalPath ?? location.pathname;
  const fullTitle = title.includes("Publisting") ? title : `${title} — Publisting`;
  const trimmedTitle = fullTitle.length > 60 ? fullTitle.slice(0, 57) + "…" : fullTitle;
  const canonical = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{trimmedTitle}</title>
      <meta name="description" content={description.slice(0, 160)} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={trimmedTitle} />
      <meta property="og:description" content={description.slice(0, 160)} />
      <meta property="og:url" content={canonical} />
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
    </Helmet>
  );
}