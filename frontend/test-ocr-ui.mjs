import { chromium } from 'playwright';

const OCR_NOTE_ID = '1026_81G37D1G2917BDN0U6A7B6MB1G';
const TEST_NOTE_ID = '1026_UBFHTCBQSD73RET0VAO2E6SUF0'; // has images without OCR

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Login
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);

const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
if (emailInput) {
  await emailInput.fill('ai-note@labnote.ai');
  const pwInput = await page.$('input[type="password"]');
  if (pwInput) await pwInput.fill('test1234');
  const loginBtn = await page.$('button[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
    await page.waitForTimeout(3000);
  }
  console.log('Logged in');
}

// Test 1: Navigate to note with completed OCR
console.log('\n=== Test 1: Note with completed OCR ===');
await page.goto(`http://localhost:3000/notes/${OCR_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/ocr-test1-note-top.png', fullPage: false });
console.log('Captured note top');

// Scroll to bottom to see attachments
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/ocr-test1-note-bottom.png', fullPage: false });
console.log('Captured note bottom (attachments area)');

// Full page screenshot
await page.screenshot({ path: '/tmp/ocr-test1-fullpage.png', fullPage: true });
console.log('Captured full page');

// Check page content for OCR elements
const content = await page.content();
const checks = {
  'test_ocr.png': content.includes('test_ocr'),
  'OCR keyword': content.includes('OCR') || content.includes('ocr'),
  '텍스트 인식': content.includes('텍스트 인식'),
  '추출': content.includes('추출'),
  '첨부파일': content.includes('첨부'),
  'extraction/extract': content.includes('extract'),
  'completed': content.includes('completed'),
};
console.log('Content checks:');
for (const [key, val] of Object.entries(checks)) {
  console.log(`  ${key}: ${val}`);
}

// Find all buttons and their text
const buttons = await page.$$('button');
console.log(`\nFound ${buttons.length} buttons:`);
for (const btn of buttons) {
  const text = (await btn.textContent()).trim();
  if (text) console.log(`  Button: "${text}"`);
}

// Test 2: Navigate to note with images but no OCR
console.log('\n=== Test 2: Note with images (no OCR yet) ===');
await page.goto(`http://localhost:3000/notes/${TEST_NOTE_ID}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/ocr-test2-note-bottom.png', fullPage: false });
await page.screenshot({ path: '/tmp/ocr-test2-fullpage.png', fullPage: true });
console.log('Captured test note');

const content2 = await page.content();
console.log('Content checks:');
console.log(`  Has OCR button: ${content2.includes('텍스트 인식') || content2.includes('OCR')}`);
console.log(`  Has image attachments: ${content2.includes('KakaoTalk')}`);

const buttons2 = await page.$$('button');
console.log(`Found ${buttons2.length} buttons:`);
for (const btn of buttons2) {
  const text = (await btn.textContent()).trim();
  if (text && (text.includes('OCR') || text.includes('텍스트') || text.includes('추출'))) {
    console.log(`  OCR Button: "${text}"`);
  }
}

await browser.close();
console.log('\nDone!');
