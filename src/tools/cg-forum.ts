import { withBrowserSession } from "../browser.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchHtml } from "../crawl.js";
import { parseXenForoThreadList, parseXenForoSearchResults } from "../parsers/xenforo.js";
import { normalizeThreadUrl, buildXenForoPageUrl } from "../forum-url.js";

export function registerCgListForum(server: McpServer): void {
  server.tool(
    "cg_list_forum",
    "List threads on a CheatGlobal forum section page (e.g. a /forumlar/... or category URL). Returns titles, URLs, reply counts and last-post info.",
    {
      url: z.string().url().describe("Section URL on cheatglobal.com"),
      page: z.number().int().min(1).max(20).optional().default(1)
        .describe("Listing page number (path /page-N)"),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    async ({ url, page }) => withBrowserSession(async () => {
      try {
        url = normalizeThreadUrl(buildXenForoPageUrl(url, page));
        const deadlineAt = Date.now() + 30_000;
        const html = await fetchHtml(url, { deadlineAt });
        const { threads, totalPages } = parseXenForoThreadList(html, url);
        const result = { url, page, totalPages, threadCount: threads.length, threads };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    })
  );
}

export function registerCgSearchForum(server: McpServer): void {
  server.tool(
    "cg_search_forum",
    "Search CheatGlobal via its XenForo quick search (/search/?q=...). Returns matching thread titles, URLs and dates. May require a visible-browser login if the site restricts guest search.",
    {
      query: z.string().min(2).describe("Search terms"),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    async ({ query, limit }) => withBrowserSession(async () => {
      try {
        const url = `https://cheatglobal.com/search/?q=${encodeURIComponent(query)}`;
        const deadlineAt = Date.now() + 30_000;
        const html = await fetchHtml(url, { deadlineAt });
        if (/Log in|Giriş yap|Giris yap|must be logged|permission/i.test(html) &&
            !/contentRow-title|searchResult|block-row/i.test(html)) {
          throw new Error("CheatGlobal search requires an account session — log in via the visible Chrome window or use cg_list_forum on a section URL");
        }
        const results = parseXenForoSearchResults(html, url).slice(0, limit);
        const result = { query, url, resultCount: results.length, results };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    })
  );
}
