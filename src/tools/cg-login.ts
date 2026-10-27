import { withBrowserSession } from "../browser.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { load } from "cheerio";
import { navigateWithRetry } from "../browser.js";
import { clearCache } from "../crawl.js";
import { isLoggedInXenForo, xenForoUsername } from "../auth.js";

const CG_LOGIN = "https://cheatglobal.com/login/";
const CG_HOME = "https://cheatglobal.com/";

export function registerCgLogin(server: McpServer): void {
  server.tool(
    "cg_login",
    "Log into CheatGlobal with username/email and password. If a Cloudflare checkbox appears, complete it in the visible Chrome window. Session persists in the shared browser profile.",
    {
      username: z.string().describe("CheatGlobal username or email"),
      password: z.string().describe("CheatGlobal password"),
    },
    async ({ username, password }) => withBrowserSession(async () => {
      try {
        const { page } = await navigateWithRetry(CG_LOGIN);

        // XenForo login form fields.
        await page.waitForSelector('input[name="login"]', { timeout: 15_000 });
        await page.type('input[name="login"]', username, { delay: 60 });
        await page.type('input[name="password"]', password, { delay: 60 });

        // Keep the session across browser restarts (xf_user cookie).
        const remember = await page.$('input[name="remember"]');
        if (remember) {
          const checked = await (await remember.getProperty("checked")).jsonValue();
          if (!checked) await remember.click();
        }

        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }),
          page.click('button[type="submit"], input[type="submit"]'),
        ]);

        const html = await page.content();

        if (!isLoggedInXenForo(html)) {
          const $ = load(html);
          const error = $(".blockMessage--error, .blockMessage--iconic, .formRow-error")
            .first().text().trim();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: false, error: error || "Login failed — check credentials or complete any on-screen verification" }),
            }],
            isError: true,
          };
        }

        clearCache();
        const confirmed = xenForoUsername(html);

        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, username: confirmed ?? username }) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    })
  );
}

export function registerCgCheckLogin(server: McpServer): void {
  server.tool(
    "cg_check_login",
    "Check if the shared browser session is logged into CheatGlobal",
    {},
    async () => withBrowserSession(async () => {
      try {
        const { html } = await navigateWithRetry(CG_HOME);
        const loggedIn = isLoggedInXenForo(html);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ loggedIn, ...(loggedIn ? { username: xenForoUsername(html) } : {}) }),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    })
  );
}
