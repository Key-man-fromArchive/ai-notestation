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
}

// Test 1: View extracted text detail
console.log('\n=== Extracted text detail ===');
await page.goto(`http://localhost:3000/notes/${OCR_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);

const viewBtn = await page.$('button:has-text("View recognized text")');
if (viewBtn) {
  await viewBtn.click();
  await page.waitForTimeout(1000);
  // Scroll to the text area
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  // Capture just the bottom area with the text
  await page.screenshot({ path: '/tmp/ocr-detail-text.png', fullPage: false });
  console.log('Captured extracted text view');
}

// Test 2: Check OCR result on test note
console.log('\n=== OCR result on test note ===');
await page.goto(`http://localhost:3000/notes/${TEST_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/ocr-detail-test-attachments.png', fullPage: false });
console.log('Captured test note attachments');

// Check buttons on the second note
const allBtns = await page.$$('button');
for (const btn of allBtns) {
  const text = (await btn.textContent()).trim();
  if (text.includes('OCR') || text.includes('텍스트') || text.includes('recognized') || text.includes('추출')) {
    console.log(`  Found button: "${text}"`);
  }
}

// Check docker logs for OCR model used
console.log('\n=== Done ===');
await browser.close();
