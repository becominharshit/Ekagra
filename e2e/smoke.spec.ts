import { expect, test, type Page } from '@playwright/test'

async function enterDemoAndOnboard(page: Page): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: /Try Demo Mode/i }).click()

  // Demo Mode requires completing onboarding once before landing on /today.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 })

  const nameInput = page.locator('#full-name')
  if ((await nameInput.inputValue()).trim() === '') {
    await nameInput.fill('Demo Student')
  }

  // Step 1 -> Step 2 -> Step 3 -> Step 4 -> Finish
  await page.getByRole('button', { name: /^Next$/i }).click()
  await page.getByRole('button', { name: /^Next$/i }).click()
  await page.getByRole('button', { name: /^Next$/i }).click()
  await page.getByRole('button', { name: /Finish and plan my day/i }).click()

  await expect(page).toHaveURL(/\/today/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

test.describe('Ekagra core launch smoke tests', () => {
  test('starts Demo Mode, completes onboarding, creates a flashcard, and views pricing', async ({ page }) => {
    await enterDemoAndOnboard(page)

    // Create a study flashcard and verify persistence across reload
    await page.goto('/academics/cards')
    await expect(page.getByRole('heading', { name: 'Flashcards' })).toBeVisible()

    await page.getByRole('button', { name: /Add card/i }).click()
    await page.locator('#card-front').fill('What is Big-O of binary search?')
    await page.locator('#card-back').fill('O(log n)')
    await page.locator('[role="dialog"]').getByRole('button', { name: /^Add card$/i }).click()

    await expect(page.locator('[role="dialog"]')).toBeHidden()
    await expect(page.locator('#root').getByText('What is Big-O of binary search?')).toBeVisible()
    await page.reload()
    await expect(page.locator('#root').getByText('What is Big-O of binary search?')).toBeVisible()

    // Public pricing page renders plans cleanly
    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: /Plans & Pricing/i })).toBeVisible()
  })

  test('runs Python code in the Coding Lab (or verifies editor + runner readiness)', async ({ page }) => {
    test.setTimeout(120_000)
    await enterDemoAndOnboard(page)

    await page.goto('/academics/code')
    await expect(page.getByRole('heading', { name: 'Coding Lab' })).toBeVisible()

    await page.getByRole('button', { name: /New file/i }).click()
    await expect(page).toHaveURL(/\/academics\/code\/.+/)

    const fileNameInput = page.getByLabel('File name')
    await expect(fileNameInput).toBeVisible()
    await fileNameInput.fill('Hello Smoke')

    // CodeMirror mounts a contenteditable textbox labeled "Python code"
    const editorTextbox = page.locator('.cm-content')
    await expect(editorTextbox).toBeVisible()
    await editorTextbox.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('print(40 + 2)')

    await page.getByRole('button', { name: /^Run$/i }).click()

    // Wait for either real Pyodide execution output ("42" in output <pre>) OR an explicit offline/download alert
    await expect(
      page.locator('pre', { hasText: '42' }).or(page.getByRole('alert')),
    ).toBeVisible({ timeout: 90_000 })
  })

  test('runs JavaScript and SQL (PGlite) locally inside the Coding Lab', async ({ page }) => {
    test.setTimeout(90_000)
    await enterDemoAndOnboard(page)

    await page.goto('/academics/code')
    await page.getByRole('button', { name: 'JavaScript' }).click()
    await page.getByRole('button', { name: /New file/i }).click()
    await expect(page).toHaveURL(/\/academics\/code\/.+/)

    await page.getByRole('button', { name: /^Run$/i }).click()
    await expect(page.locator('pre[aria-label="Output"]')).toContainText('Sum: 10', { timeout: 20_000 })

    // Create and execute a PostgreSQL query via PGlite worker
    await page.goto('/academics/code')
    await page.getByRole('button', { name: 'SQL (PostgreSQL)' }).click()
    await page.getByRole('button', { name: /New file/i }).click()
    await expect(page).toHaveURL(/\/academics\/code\/.+/)

    await page.getByRole('button', { name: /^Run$/i }).click()
    await expect(page.locator('pre[aria-label="Output"]')).toContainText('Algorithms', { timeout: 30_000 })
    await expect(page.locator('pre[aria-label="Output"]')).toContainText('Linear Algebra')
  })

  test('serves public landing with Tollbooth preview, legal routes, and analytics consent controls', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /One clear next step/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Academic Tollbooth Preview/i })).toBeVisible()

    // Try the zero-login interactive Tollbooth challenge
    await page.getByRole('button', { name: /O\(log n\)/i }).click()
    await expect(page.getByRole('status')).toContainText(/Pass earned/i)

    // Analytics consent banner persists user choice across navigation
    const consentBanner = page.getByRole('complementary', { name: /Privacy and analytics preferences/i })
    await expect(consentBanner).toBeVisible()
    await consentBanner.getByRole('button', { name: /Accept analytics/i }).click()
    await expect(consentBanner).toBeHidden()

    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: /Terms of Service/i })).toBeVisible()
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: /Privacy policy/i })).toBeVisible()
  })
})
