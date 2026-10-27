import { load } from "cheerio";
import type { ThreadData, ThreadPost } from "../types.js";

// XenForo 2 markup (CheatGlobal — Turkish install, /konu/<slug>.<id>/ URLs).

function parseTotalPages($: ReturnType<typeof load>): number {
  let max = 1;
  // .pageNav-page entries are the visible page buttons.
  $(".pageNav-page").each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  // Fallback: any /page-N link.
  $("a[href*='/page-']").each((_, el) => {
    const m = ($(el).attr("href") ?? "").match(/\/page-(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  return max;
}

function cleanText(s: string): string {
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function parseTitle($: ReturnType<typeof load>): string {
  const h1 = cleanText($("h1.p-title-value").first().text());
  if (h1) return h1;
  const raw = cleanText($("title").first().text());
  return raw
    .replace(/\s*\|\s*CheatGlobal.*$/i, "")
    .replace(/\s*-\s*CheatGlobal.*$/i, "")
    .trim() || "Unknown Thread";
}

function absolutize(href: string, base: URL): string | null {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function parseXenForoThread(html: string, url: string, pageNum = 1): ThreadData {
  const $ = load(html);
  const base = new URL(url);

  const title = parseTitle($);
  const totalPages = parseTotalPages($);
  const posts: ThreadPost[] = [];

  $("article.message, div.message--post, li.message--post").each((_, el) => {
    const msg = $(el);
    const article = msg.is("article") ? msg : msg.find("article").first();
    const scope = article.length ? article : msg;

    const author = scope
      .find(".message-name a.username, .message-name a, a.username, .message-author .username")
      .first().text().trim();

    const timeEl = scope.find(".message-attribution-main time, .message-header time, time[datetime]").first();
    const date = (timeEl.attr("datetime") ?? timeEl.attr("title") ?? timeEl.text()).trim();

    // Post number: permalink text "#N" or the data-content id.
    let postNumber = 0;
    const numText = scope
      .find(".message-attribution-opposite a[href*='/posts/'], .message-attribution-opposite li:last-child a")
      .last().text().trim();
    const numMatch = numText.match(/#?(\d+)/);
    if (numMatch) postNumber = parseInt(numMatch[1], 10);
    if (!postNumber) {
      const idAttr = scope.attr("id") ?? "";
      const idMatch = idAttr.match(/(?:post|message)-?(\d+)/i);
      if (idMatch) postNumber = parseInt(idMatch[1], 10);
    }

    const body = scope.find(".message-body .bbWrapper, .bbWrapper").first().clone();
    body.find(".bbCodeBlock--quote, .bbCodeBlock--spoiler, blockquote, .quote").remove();
    const content = body.text().trim().replace(/\s+/g, " ");

    const links: { text: string; url: string }[] = [];
    body.find("a[href]").each((_, a) => {
      const resolved = absolutize($(a).attr("href") ?? "", base);
      if (resolved) links.push({ text: $(a).text().trim() || resolved, url: resolved });
    });

    const images: string[] = [];
    body.find("img[src], img[data-src]").each((_, img) => {
      const raw = $(img).attr("src") ?? $(img).attr("data-src") ?? "";
      if (/clear\.gif|spacer|avatar|smil|emoji/i.test(raw)) return;
      const resolved = absolutize(raw, base);
      if (resolved) images.push(resolved);
    });
    // XenForo lazy-loads attachments as [data-url] / .bbImage links.
    body.find(".bbImageWrapper .bbImage, a[data-fancybox]").each((_, img) => {
      const raw = $(img).attr("src") ?? $(img).attr("href") ?? "";
      const resolved = absolutize(raw, base);
      if (resolved && !/avatar|smil|emoji/i.test(resolved)) images.push(resolved);
    });

    if (author || content) {
      posts.push({ author, date, content, postNumber, links, images });
    }
  });

  return { title, posts, currentPage: pageNum, totalPages, url };
}

export interface XenForoThreadLink {
  title: string;
  url: string;
  replies?: number;
  views?: number;
  lastPost?: string;
}

// Forum section listing: .structItem rows (XenForo thread list).
export function parseXenForoThreadList(html: string, url: string): { threads: XenForoThreadLink[]; totalPages: number } {
  const $ = load(html);
  const base = new URL(url);
  const threads: XenForoThreadLink[] = [];

  $(".structItem--thread, .structItem").each((_, el) => {
    const row = $(el);
    const link = row.find(".structItem-title a:not(.labelLink)").last();
    const title = link.text().trim();
    const resolved = absolutize(link.attr("href") ?? "", base);
    if (!title || !resolved) return;

    const cellText = (sel: string) => row.find(sel).first().text().trim();
    const replies = parseInt(cellText(".structItem-cell--meta dl:has(dt:contains('Replies')) dd, .structItem-metaItem--replies dd").replace(/\D+/g, ""), 10);
    const lastPost = row.find(".structItem-cell--latest time, .structItem-latest time").attr("datetime")
      ?? row.find(".structItem-cell--latest, .structItem-latest").first().text().trim();

    threads.push({
      title,
      url: resolved,
      ...(Number.isFinite(replies) ? { replies } : {}),
      ...(lastPost ? { lastPost } : {}),
    });
  });

  return { threads, totalPages: parseTotalPages($) };
}

// XenForo search results page: .block-row / .contentRow items.
export function parseXenForoSearchResults(html: string, url: string): XenForoThreadLink[] {
  const $ = load(html);
  const base = new URL(url);
  const out: XenForoThreadLink[] = [];

  $(".contentRow--item, .block-row .contentRow, .searchResult").each((_, el) => {
    const row = $(el);
    const link = row.find(".contentRow-title a, h3 a").first();
    const title = link.text().trim();
    const resolved = absolutize(link.attr("href") ?? "", base);
    if (!title || !resolved || !/konu|threads|posts/i.test(resolved)) return;
    const lastPost = row.find("time[datetime]").first().attr("datetime") ?? "";
    out.push({ title, url: resolved, ...(lastPost ? { lastPost } : {}) });
  });

  return out;
}
