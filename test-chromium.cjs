const playwright = require('@playwright/test');
(async () => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body><img id="test" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==" /></body></html>');
  const img = page.locator('#test');
  await img.waitFor();
  await page.waitForFunction('document.getElementById("test").complete');
  const nw = await img.evaluate(el => el.naturalWidth);
  console.log('naturalWidth:', nw);
  await browser.close();
})();
