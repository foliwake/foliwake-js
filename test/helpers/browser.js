// Shared headless-browser helper (coordinator-owned). Uses the system Google
// Chrome through playwright-core, so no browser download is needed.
import { chromium } from 'playwright-core';

export async function launchBrowser() {
  const channel = process.env.FOLIWAKE_TEST_BROWSER_CHANNEL ?? 'chrome';
  return chromium.launch({ channel, headless: true });
}

// Opens a page and records every request URL and console message.
export async function openPage(browser, { javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ javaScriptEnabled });
  const page = await context.newPage();
  const requests = [];
  const consoleMessages = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
  return { context, page, requests, consoleMessages };
}
