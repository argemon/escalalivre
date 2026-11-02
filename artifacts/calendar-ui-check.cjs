const { chromium } = require('./review-runtime/node_modules/playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5181'], { cwd: path.join(__dirname, '../frontend'), windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    for (let n = 0; n < 100; n++) {
      try { if ((await fetch('http://127.0.0.1:5181')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto('http://127.0.0.1:5181');
    await page.getByRole('button', { name: 'Escala mensal', exact: true }).click();
    await page.locator('.fc-next-button').waitFor();
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await page.waitForTimeout(250);
      for (const [selector, expected] of [['.fc-next-button', /Próximo mês/i], ['.fc-prev-button', /Mês Anterior/i], ['.fc-today-button', /Este mês/i]]) {
        assert.match(await page.locator(selector).getAttribute('title'), expected);
      }
      const buttons = await page.locator('.fc-toolbar button').evaluateAll(elements => elements.map(el => {
        const style = getComputedStyle(el);
        return { disabled: el.disabled, text: el.title, color: style.color, background: style.backgroundColor, opacity: style.opacity };
      }));
      const luminance = rgb => {
        const c = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => rgb.startsWith('color(srgb ') ? v : v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      for (const button of buttons) {
        const l = [luminance(button.color), luminance(button.background)].sort((a, b) => a - b);
        const contrast = (l[1] + 0.05) / (l[0] + 0.05);
        assert.ok(contrast >= 4.5, `${dark ? 'dark' : 'light'} ${button.text} contrast ${contrast}`);
        assert.equal(button.opacity, '1');
        console.log('PASS', dark ? 'dark' : 'light', button.text, { disabled: button.disabled, contrast: contrast.toFixed(2) });
      }
      assert.ok(buttons.some(b => b.disabled), 'cover disabled calendar navigation');
      const continueButton = page.getByRole('button', { name: 'Continuar para Funções', exact: true });
      await continueButton.evaluate(el => { el.disabled = true; });
      await page.waitForTimeout(250);
      const generic = await continueButton.evaluate(el => {
        const s = getComputedStyle(el); return { disabled: el.disabled, color: s.color, bg: s.backgroundColor, opacity: s.opacity };
      });
      assert.equal(generic.disabled, true);
      assert.equal(generic.opacity, '1');
      const l = [luminance(generic.color), luminance(generic.bg)].sort((a, b) => a - b);
      assert.ok((l[1] + .05) / (l[0] + .05) >= 4.5, 'shared disabled button contrast');
      await page.screenshot({ path: `artifacts/calendar-${dark ? 'dark' : 'light'}.png` });
      const next = page.locator('.fc-next-button');
      await next.evaluate(el => { el.disabled = false; });
      await page.waitForTimeout(250);
      for (const hover of [false, true]) {
        if (hover) await next.hover();
        await page.waitForTimeout(250);
        const style = await next.evaluate(el => { const s = getComputedStyle(el); return { color: s.color, bg: s.backgroundColor }; });
        const l = [luminance(style.color), luminance(style.bg)].sort((a, b) => a - b);
        const contrast = (l[1] + .05) / (l[0] + .05);
        assert.ok(contrast >= 4.5, `enabled calendar button contrast: ${contrast}`);
        console.log('PASS', dark ? 'dark' : 'light', hover ? 'hover' : 'enabled', contrast.toFixed(2));
      }
      await next.evaluate(el => { el.disabled = true; });
      await page.mouse.move(0, 0);
    }
    await page.getByRole('button', { name: 'Como usar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Como usar o EscalaLivre' }).waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('dialog:modal').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog:modal').count(), 0);
    console.log('PASS guide opens in StrictMode and closes with Escape');
  } finally { await browser?.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
