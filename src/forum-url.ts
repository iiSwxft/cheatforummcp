const FORUM_BASE = "https://www.unknowncheats.me/forum/";

const UC_HOSTS = new Set(["www.unknowncheats.me", "unknowncheats.me"]);
export const CG_HOSTS = new Set(["cheatglobal.com", "www.cheatglobal.com"]);

export type ForumSite = "unknowncheats" | "cheatglobal";

export function siteOf(url: string): ForumSite {
  const host = new URL(url, FORUM_BASE).hostname;
  if (CG_HOSTS.has(host)) return "cheatglobal";
  return "unknowncheats";
}

export function normalizeThreadUrl(input: string): string {
  const url = new URL(input, FORUM_BASE);
  if (CG_HOSTS.has(url.hostname)) {
    // XenForo URLs are already canonical (/konu/slug.id/, /page-N).
    return url.toString();
  }
  if (UC_HOSTS.has(url.hostname) &&
      (/^\/[a-z0-9-]+\/\d+-[^/]+\.html$/i.test(url.pathname) || url.pathname === "/showthread.php")) {
    url.pathname = `/forum${url.pathname}`;
  }
  return url.toString();
}

// XenForo pagination is path-based: /konu/slug.id/page-N
export function buildXenForoPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/page-\d+\/?$/, "").replace(/\/?$/, "/");
  if (page > 1) url.pathname += `page-${page}`;
  return url.toString();
}

export function isApacheNotFoundPage(html: string): boolean {
  if (/<title>\s*404 Not Found\s*<\/title>/i.test(html) &&
      /Apache Server at (?:www\.)?(?:unknowncheats\.me|cheatglobal\.com)/i.test(html)) {
    return true;
  }
  // XenForo error template for missing threads/forums.
  if (/Oops! We ran into some problems/i.test(html) ||
      /The requested thread could not be found/i.test(html)) {
    return true;
  }
  return false;
}
