import { test, expect } from '@playwright/test'

test('check images in note detail', async ({ page }) => {
  // Go to notes page
  await page.goto('http://localhost:5173/notes')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: '/tmp/notes-list.png', fullPage: false })
  
  // Find a note that likely has images and click it
  // First, let's check the note list
  const noteLinks = page.locator('a[href^="/notes/"]')
  const count = await noteLinks.count()
  console.log(`Found ${count} note links`)
  
  if (count > 0) {
    // Click first note
    await noteLinks.first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: '/tmp/note-detail.png', fullPage: true })
    
    // Check for broken images
    const images = page.locator('img')
    const imgCount = await images.count()
    console.log(`Found ${imgCount} images on note detail page`)
    
    for (let i = 0; i < Math.min(imgCount, 10); i++) {
      const img = images.nth(i)
      const src = await img.getAttribute('src')
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
      const complete = await img.evaluate((el: HTMLImageElement) => el.complete)
      console.log(`Image ${i}: src=${src?.substring(0, 100)}, naturalWidth=${naturalWidth}, complete=${complete}`)
    }
  }
})

test('check notebook page for broken images', async ({ page }) => {
  await page.goto('http://localhost:5173/notebooks')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/notebooks-page.png', fullPage: false })
  
  // Check for broken images on notebooks page
  const images = page.locator('img')
  const imgCount = await images.count()
  console.log(`Found ${imgCount} images on notebooks page`)
  
  for (let i = 0; i < Math.min(imgCount, 10); i++) {
    const img = images.nth(i)
    const src = await img.getAttribute('src')
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
    const complete = await img.evaluate((el: HTMLImageElement) => el.complete)
    console.log(`Notebook image ${i}: src=${src?.substring(0, 100)}, naturalWidth=${naturalWidth}, complete=${complete}`)
  }
  
  // Click into first notebook
  const notebookCards = page.locator('button').filter({ hasText: /\d/ })
  const nbCount = await notebookCards.count()
  console.log(`Found ${nbCount} notebook buttons`)
  
  if (nbCount > 0) {
    await notebookCards.first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: '/tmp/notebook-detail.png', fullPage: false })
    
    // Check notes inside notebook for broken images  
    const detailImages = page.locator('img')
    const detailImgCount = await detailImages.count()
    console.log(`Found ${detailImgCount} images in notebook detail`)
    
    for (let i = 0; i < Math.min(detailImgCount, 5); i++) {
      const img = detailImages.nth(i)
      const src = await img.getAttribute('src')
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
      console.log(`Notebook detail image ${i}: src=${src?.substring(0, 100)}, naturalWidth=${naturalWidth}`)
    }
  }
})
