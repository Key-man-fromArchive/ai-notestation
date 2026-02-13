import { chromium } from 'playwright';

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

// Navigate to test note
console.log('Navigating to test note...');
await page.goto(`http://localhost:3000/notes/${TEST_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Scroll to attachments
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);

// Click OCR button on first image
const ocrBtns = await page.$$('button:has-text("Text recognition"), button:has-text("텍스트 인식")');
console.log(`Found ${ocrBtns.length} OCR buttons`);

if (ocrBtns.length > 0) {
  console.log('Clicking OCR button...');
  await ocrBtns[0].click();

  // Capture loading state immediately
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: '/tmp/ocr-trigger-loading.png', fullPage: false });
  console.log('Loading state captured');

  // Wait for OCR to finish
  console.log('Waiting for OCR (up to 30s)...');
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const content = await page.content();
    if (content.includes('View recognized text') || content.includes('추출된 텍스트 보기')) {
      console.log(`OCR completed after ~${(i+1)*2}s`);
      break;
    }
    if (content.includes('failed') || content.includes('실패')) {
      console.log(`OCR failed after ~${(i+1)*2}s`);
      break;
    }
    if (i === 14) console.log('Timed out waiting for OCR');
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/ocr-trigger-result.png', fullPage: false });
  console.log('Result captured');
}

await browser.close();
console.log('Done!');
