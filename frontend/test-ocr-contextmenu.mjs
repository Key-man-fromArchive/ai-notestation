import { chromium } from 'playwright';

const OCR_NOTE_ID = '1026_81G37D1G2917BDN0U6A7B6MB1G';
const TEST_NOTE_ID = '1026_UBFHTCBQSD73RET0VAO2E6SUF0';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Login
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
const emailInput = await page.$('input[type="email"]');
if (emailInput) {
  await emailInput.fill('ai-note@labnote.ai');
  await (await page.$('input[type="password"]')).fill('test1234');
  await (await page.$('button[type="submit"]')).click();
  await page.waitForTimeout(3000);
  console.log('Logged in');
}

let passed = 0;
let failed = 0;
function assert(label, condition) {
  if (condition) { console.log(`  PASS: ${label}`); passed++; }
  else { console.log(`  FAIL: ${label}`); failed++; }
}

// ====== Test 1: Note with completed OCR ======
console.log('\n=== Test 1: Note with completed OCR ===');
await page.goto(`http://localhost:3000/notes/${OCR_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Scroll to attachments / images section
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/ocr-ctx-test1-attachments.png', fullPage: false });
console.log('Screenshot: /tmp/ocr-ctx-test1-attachments.png');

// 1a: Inline OCR buttons should be GONE
const inlineOcrBtns = await page.$$('button:has-text("View recognized text"), button:has-text("Text recognition"), button:has-text("추출된 텍스트 보기"), button:has-text("텍스트 인식")');
assert('No inline OCR buttons exist', inlineOcrBtns.length === 0);

// 1b: Green checkmark icon should exist (CheckCircle2 as svg with text-green-600 class)
const greenIcons = await page.$$('svg.text-green-600');
assert('Green status icon(s) present', greenIcons.length > 0);
console.log(`  Found ${greenIcons.length} green status icon(s)`);

// 1c: cursor-context-menu class should exist
const contextMenuRows = await page.$$('.cursor-context-menu');
assert('Rows with cursor-context-menu class exist', contextMenuRows.length > 0);
console.log(`  Found ${contextMenuRows.length} context-menu row(s)`);

// 1d: Right-click on the first context-menu row to open context menu
if (contextMenuRows.length > 0) {
  const box = await contextMenuRows[0].boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/ocr-ctx-test1-contextmenu.png', fullPage: false });
    console.log('Screenshot: /tmp/ocr-ctx-test1-contextmenu.png');

    // Context menu should be visible (z-[60] fixed div)
    const menuItems = await page.$$('div.fixed.z-\\[60\\] button');
    assert('Context menu appeared with items', menuItems.length > 0);
    console.log(`  Context menu has ${menuItems.length} item(s)`);

    // Click the first menu item (View recognized/extracted text)
    if (menuItems.length > 0) {
      const menuText = await menuItems[0].textContent();
      console.log(`  Clicking menu item: "${menuText.trim()}"`);
      await menuItems[0].click();
      await page.waitForTimeout(2000);

      // Modal should appear
      await page.screenshot({ path: '/tmp/ocr-ctx-test1-modal.png', fullPage: false });
      console.log('Screenshot: /tmp/ocr-ctx-test1-modal.png');

      // Check for modal overlay (bg-black/50)
      const modalOverlay = await page.$('div.fixed.inset-0.z-50');
      assert('Modal overlay appeared', !!modalOverlay);

      // Check for MarkdownRenderer content inside modal (prose class)
      const proseContent = await page.$('div.fixed.inset-0.z-50 .prose');
      assert('Modal contains rendered markdown (prose)', !!proseContent);

      // Close modal by clicking X
      const closeBtn = await page.$('div.fixed.inset-0.z-50 button');
      if (closeBtn) {
        // Find the close button (the one in the header)
        const modalBtns = await page.$$('div.fixed.inset-0.z-50 button');
        for (const btn of modalBtns) {
          const svg = await btn.$('svg');
          if (svg) {
            await btn.click();
            break;
          }
        }
        await page.waitForTimeout(500);
        const modalAfterClose = await page.$('div.fixed.inset-0.z-50');
        assert('Modal closed after clicking X', !modalAfterClose);
      }
    }
  }
}

// ====== Test 2: Note with unprocessed images ======
console.log('\n=== Test 2: Note with unprocessed images ===');
await page.goto(`http://localhost:3000/notes/${TEST_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/ocr-ctx-test2-attachments.png', fullPage: false });
console.log('Screenshot: /tmp/ocr-ctx-test2-attachments.png');

// 2a: No inline OCR buttons
const inlineBtns2 = await page.$$('button:has-text("Text recognition"), button:has-text("텍스트 인식")');
assert('No inline OCR buttons on unprocessed note', inlineBtns2.length === 0);

// 2b: Right-click on an image row
const imgRows = await page.$$('.cursor-context-menu');
console.log(`  Found ${imgRows.length} context-menu row(s)`);
if (imgRows.length > 0) {
  const box = await imgRows[0].boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/ocr-ctx-test2-contextmenu.png', fullPage: false });
    console.log('Screenshot: /tmp/ocr-ctx-test2-contextmenu.png');

    const menuItems = await page.$$('div.fixed.z-\\[60\\] button');
    assert('Context menu appeared on unprocessed image', menuItems.length > 0);

    if (menuItems.length > 0) {
      const menuText = await menuItems[0].textContent();
      console.log(`  Menu item: "${menuText.trim()}"`);
      // Should say "Extract text" or "Text recognition (OCR)"
      const isExtractOrOcr = menuText.includes('Extract') || menuText.includes('OCR') || menuText.includes('추출') || menuText.includes('텍스트 인식');
      assert('Menu shows extract/OCR action for unprocessed image', isExtractOrOcr);
    }

    // Close context menu by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const menuAfterEsc = await page.$('div.fixed.z-\\[60\\]');
    assert('Context menu closed on Escape', !menuAfterEsc);
  }
}

// ====== Test 3: Escape closes context menu ======
console.log('\n=== Test 3: Context menu keyboard close ===');
if (imgRows.length > 0) {
  const box = await imgRows[0].boundingBox();
  if (box) {
    // Open context menu
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(300);
    let menu = await page.$('div.fixed.z-\\[60\\]');
    assert('Context menu re-opened for Escape test', !!menu);

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    menu = await page.$('div.fixed.z-\\[60\\]');
    assert('Context menu closed with Escape key', !menu);

    // Open again and close with backdrop click
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(300);
    menu = await page.$('div.fixed.z-\\[60\\]');
    assert('Context menu re-opened for backdrop test', !!menu);

    // Click backdrop (top-left corner, away from menu)
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    menu = await page.$('div.fixed.z-\\[60\\]');
    assert('Context menu closed with backdrop click', !menu);
  }
}

// Summary
console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
