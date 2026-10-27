import { withBrowserSession } from "../browser.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchHtml } from "../crawl.js";
import { parseXenForoThread } from "../parsers/xenforo.js";
import { parseCodeBlocks } from "../parsers/code-blocks.js";
import type { ThreadPost } from "../types.js";
import { normalizeThreadUrl, buildXenForoPageUrl } from "../forum-url.js";
import { DEFAULT_RECENT_PAGES, recentPageNumbers } from "../thread-pages.js";

const MAX_PAGES = 50;
const MAX_CODE_BLOCKS = 10;
const MAX_CODE_CHARS = 2_000;

export function registerCgGetThread(server: McpServer): void {
  server.tool(
    "cg_get_thread",
    "Read a CheatGlobal (XenForo) thread: /konu/<slug>.<id>/ URLs, /page-N pagination. Default reads the latest 3 pages; append page= via the path or pass latest_pages/fetch_all_pages.",
    {
      url: z.string().url().describe("Thread URL, e.g. https://cheatglobal.com/konu/slug.12345/"),
      fetch_all_pages: z.boolean().optional().default(false)
        .describe("Fetch every page (max 50)"),
      latest_pages: z.number().int().min(1).max(5).optional()
        .describe("Read the last 1-5 pages (default 3 unless URL names a page or fetch_all_pages)"),
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    async ({ url, fetch_all_pages, latest_pages }) => withBrowserSession(async () => {
      try {
        url = normalizeThreadUrl(url);
        const deadlineAt = Date.now() + 45_000;
        const pageMatch = url.match(/\/page-(\d+)/);
        const explicitPage = pageMatch ? parseInt(pageMatch[1], 10) : 0;
        const requestedPage = explicitPage || 1;

        const firstHtml = await fetchHtml(url, { deadlineAt, bypassCache: true });
        const firstPage = parseXenForoThread(firstHtml, url, requestedPage);
        if (firstPage.posts.length === 0) {
          throw new Error(`No posts found at ${url} (page title: ${firstPage.title}) — may be a CF challenge or layout change`);
        }
        const totalPages = firstPage.totalPages;
        const pagesToFetch = latest_pages !== undefined
          ? recentPageNumbers(totalPages, latest_pages)
          : fetch_all_pages
            ? Array.from({ length: Math.min(totalPages, MAX_PAGES) }, (_, i) => i + 1)
            : explicitPage ? [Math.min(requestedPage, totalPages)]
              : recentPageNumbers(totalPages, DEFAULT_RECENT_PAGES);

        const allPosts: ThreadPost[] = [];
        const allCodeBlocks: Array<ReturnType<typeof parseCodeBlocks>[number] & { page: number }> = [];
        const pagesFetched: number[] = [];
        let timeBudgetReached = false;

        for (const pageNum of pagesToFetch) {
          if (pageNum !== requestedPage && Date.now() >= deadlineAt) {
            timeBudgetReached = true;
            break;
          }
          const pageUrl = buildXenForoPageUrl(url, pageNum);
          let html: string;
          try {
            html = pageNum === requestedPage ? firstHtml : await fetchHtml(pageUrl, { deadlineAt, bypassCache: true });
          } catch (error) {
            if (Date.now() < deadlineAt) throw error;
            timeBudgetReached = true;
            break;
          }
          const parsed = parseXenForoThread(html, pageUrl, pageNum);
          allPosts.push(...parsed.posts);
          allCodeBlocks.push(...parseCodeBlocks(html).map((b) => ({ ...b, page: pageNum })));
          pagesFetched.push(pageNum);
          console.error(`[cg-get-thread] Fetched page ${pageNum}/${totalPages}`);
        }
        if (pagesFetched.length === 0 && firstPage.posts.length > 0) {
          allPosts.push(...firstPage.posts);
          pagesFetched.push(requestedPage);
        }

        const recentPagesRequested = recentPageNumbers(totalPages, DEFAULT_RECENT_PAGES);
        const result = {
          title: firstPage.title,
          posts: allPosts,
          codeBlockCount: allCodeBlocks.length,
          codeBlocks: allCodeBlocks.slice(-MAX_CODE_BLOCKS).map((b) => ({
            ...b,
            code: b.code.length > MAX_CODE_CHARS
              ? `${b.code.slice(0, MAX_CODE_CHARS)}\n... [truncated, ${b.code.length} chars total]`
              : b.code,
          })),
          codeBlocksTruncated: allCodeBlocks.length > MAX_CODE_BLOCKS,
          currentPage: pagesFetched.at(-1),
          pagesFetched,
          pagesRequested: pagesToFetch,
          recentPagesComplete: recentPagesRequested.every((p) => pagesFetched.includes(p)),
          totalPages,
          url,
          timeBudgetReached,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    })
  );
}
