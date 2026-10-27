import { load } from "cheerio";

export function isLoggedIn(html: string): boolean {
  const $ = load(html);
  return $('a[href*="login.php?do=logout"]').length > 0;
}

// XenForo (CheatGlobal): XF2 stamps data-logged-in on <html>; also accept
// the account nav as a fallback in case the attribute is styled away.
export function isLoggedInXenForo(html: string): boolean {
  const $ = load(html);
  if ($("html[data-logged-in='true']").length > 0) return true;
  if ($(".p-navgroup--member, a[href*='/account/']").length > 0 &&
      $(".p-navgroup-link--logIn").length === 0) return true;
  return false;
}

export function xenForoUsername(html: string): string | undefined {
  const $ = load(html);
  const name = $(".p-navgroup--member .p-navgroup-linkText, .p-nav--user .username, a[href*='/members/'] .p-navgroup-linkText")
    .first().text().trim();
  return name || undefined;
}
