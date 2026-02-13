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

// Test 1: View recognized text on completed OCR note
console.log('\n=== Test 1: Click "View recognized text" ===');
await page.goto(`http://localhost:3000/notes/${OCR_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Scroll to attachments
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);

// Click "View recognized text"
const viewTextBtn = await page.$('button:has-text("View recognized text"), button:has-text("추출된 텍스트 보기")');
if (viewTextBtn) {
  console.log('Found "View recognized text" button, clicking...');
  await viewTextBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/ocr-interact1-text-shown.png', fullPage: true });
  console.log('Captured after clicking view text');
} else {
  console.log('ERROR: "View recognized text" button not found');
}

// Test 2: Trigger OCR on note with un-extracted images
console.log('\n=== Test 2: Trigger OCR on image ===');
await page.goto(`http://localhost:3000/notes/${TEST_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/ocr-interact2-before-click.png', fullPage: false });

// Click first OCR button
const ocrBtns = await page.$$('button:has-text("Text recognition"), button:has-text("텍스트 인식")');
console.log(`Found ${ocrBtns.length} OCR trigger buttons`);
if (ocrBtns.length > 0) {
  console.log('Clicking first OCR button...');
  await ocrBtns[0].click();
  // Wait for loading state
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/ocr-interact2-loading.png', fullPage: false });
  console.log('Captured loading state');

  // Wait for completion (up to 30s)
  console.log('Waiting for OCR to complete (up to 30s)...');
  await page.waitForTimeout(15000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/ocr-interact2-result.png', fullPage: true });
  console.log('Captured result');
} else {
  console.log('No OCR buttons found');
}

await browser.close();
console.log('\nDone!');
