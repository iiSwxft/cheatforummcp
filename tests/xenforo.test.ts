import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { parseXenForoThread, parseXenForoThreadList, parseXenForoSearchResults } from "../src/parsers/xenforo.ts";
import { buildXenForoPageUrl, normalizeThreadUrl, siteOf, isApacheNotFoundPage } from "../src/forum-url.ts";
import { isLoggedInXenForo } from "../src/auth.ts";

const THREAD_URL = "https://cheatglobal.com/konu/oneclick-full-src.153766/";
const fixturePath = new URL("./fixtures/cg-thread-153766.html", import.meta.url);

// Synthetic XF2 thread markup — same selectors the live site renders.
const XF_THREAD = `<html data-logged-in="true"><head><title>Test Konu | CheatGlobal</title></head><body>
<h1 class="p-title-value">Test Konu</h1>
<div class="pageNav"><a class="pageNav-page" href="/konu/test.42/page-3">3</a></div>
<article class="message message--post" id="js-post-100">
  <div class="message-inner">
    <div class="message-name"><a class="username" href="/members/tester.7/">tester</a></div>
    <ul class="message-attribution-main"><li><time datetime="2026-10-26T07:03:32-0400"></time></li></ul>
    <ul class="message-attribution-opposite"><li><a href="/konu/test.42/post-100">#1</a></li></ul>
    <div class="message-body"><div class="bbWrapper">
      Hello&nbsp;world <a href="/konu/other.9/">linked</a>
      <img src="/data/attachments/1/pic.png">
      <div class="bbCodeBlock bbCodeBlock--quote">quoted stuff</div>
    </div></div>
  </div>
</article></body></html>`;

describe("CheatGlobal XenForo parsing", () => {
  test("parses title, pagination and posts from XF2 markup", () => {
    const t = parseXenForoThread(XF_THREAD, "https://cheatglobal.com/konu/test.42/", 1);
    expect(t.title).toBe("Test Konu");
    expect(t.totalPages).toBe(3);
    expect(t.posts).toHaveLength(1);
    const p = t.posts[0];
    expect(p.author).toBe("tester");
    expect(p.postNumber).toBe(1);
    expect(p.content).toContain("Hello world");
    expect(p.content).not.toContain("quoted stuff");
    expect(p.links[0].url).toBe("https://cheatglobal.com/konu/other.9/");
    expect(p.images[0]).toBe("https://cheatglobal.com/data/attachments/1/pic.png");
  });

  test("detects XenForo logged-in state", () => {
    expect(isLoggedInXenForo(XF_THREAD)).toBe(true);
    expect(isLoggedInXenForo("<html><body><a class='p-navgroup-link p-navgroup-link--logIn'>Giriş</a></body></html>")).toBe(false);
  });

  test("normalizes and paginates XenForo URLs", () => {
    expect(normalizeThreadUrl(THREAD_URL)).toBe(THREAD_URL);
    expect(buildXenForoPageUrl(THREAD_URL, 2)).toBe("https://cheatglobal.com/konu/oneclick-full-src.153766/page-2");
    expect(buildXenForoPageUrl("https://cheatglobal.com/konu/oneclick-full-src.153766/page-2", 1))
      .toBe(THREAD_URL);
    expect(siteOf(THREAD_URL)).toBe("cheatglobal");
    expect(siteOf("https://www.unknowncheats.me/forum/showthread.php?t=1")).toBe("unknowncheats");
  });

  test("recognizes XenForo error pages", () => {
    expect(isApacheNotFoundPage("<html><body>Oops! We ran into some problems.</body></html>")).toBe(true);
    expect(isApacheNotFoundPage("<html><body>The requested thread could not be found.</body></html>")).toBe(true);
    expect(isApacheNotFoundPage(XF_THREAD)).toBe(false);
  });

  test("thread list parser handles structItem rows", () => {
    const html = `
      <div class="structItem structItem--thread">
        <div class="structItem-title"><a href="/konu/example.42/">Example thread</a></div>
        <div class="structItem-cell structItem-cell--meta"><dl><dt>Replies</dt><dd>12</dd></dl></div>
        <div class="structItem-cell structItem-cell--latest"><time datetime="2026-10-26T07:03:32-0400"></time></div>
      </div>`;
    const { threads } = parseXenForoThreadList(html, "https://cheatglobal.com/forumlar/example.7/");
    expect(threads).toMatchObject([{ title: "Example thread", url: "https://cheatglobal.com/konu/example.42/", replies: 12 }]);
  });

  test("search results parser keeps only thread/post links", () => {
    const html = `<div class="block-row">
      <div class="contentRow"><div class="contentRow-title"><a href="/konu/hit.55/">Hit</a></div><time datetime="2026-01-01T00:00:00Z"></time></div>
      <div class="contentRow"><div class="contentRow-title"><a href="/members/bob.3/">Bob</a></div></div>
    </div>`;
    const results = parseXenForoSearchResults(html, "https://cheatglobal.com/search/?q=x");
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://cheatglobal.com/konu/hit.55/");
  });

  // Live fixture: gitignored (saved live page). Present only after a real
  // capture — skipped otherwise.
  test.skipIf(!existsSync(fixturePath))("parses the captured thread fixture", () => {
    const html = readFileSync(fixturePath, "utf8");
    expect(html).toContain("challenge-platform"); // CF beacon on cleared pages
    const t = parseXenForoThread(html, THREAD_URL, 1);
    expect(t.title).toBe("Open Source ONECLICK Full SRC");
    expect(t.totalPages).toBe(2);
    expect(t.posts.length).toBe(10);
    expect(t.posts[0].author).toBe("kanezelo");
    expect(isLoggedInXenForo(html)).toBe(true);
  });
});
