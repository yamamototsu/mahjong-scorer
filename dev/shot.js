// スクリーンショット撮影（iPhone相当 390×844 @2x）
// 使い方: node /home/user/mj-tools/shot.js <local.htmlのパス> <出力.png> [操作スクリプト.js]
// 操作スクリプト: module.exports = async (page) => { await page.click('text=...'); ... }
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules/playwright-core'));

(async () => {
  const [html, out, actions] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(html));
  await page.waitForTimeout(700);
  if (actions) await require(path.resolve(actions))(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  if (errors.length) {
    console.log('JSエラーあり:');
    errors.slice(0, 10).forEach((e) => console.log(' ', e.slice(0, 300)));
    process.exitCode = 2;
  } else {
    console.log('OK（JSエラーなし）:', out);
  }
  await browser.close();
})();
