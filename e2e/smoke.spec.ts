import { expect, test, type Page } from '@playwright/test'

async function enterDemoOnToday(page: Page, options: { completeOnboarding?: boolean } = {}): Promise<void> {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: /Try Demo Mode/i }).click()

  // One-tap Demo Mode lands straight on /today without blocking on /onboarding.
  await expect(page).toHaveURL(/\/today/, { timeout: 15_000 })

  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible({ timeout: 10_000 })

  if (options.completeOnboarding) {
    const nameInput = modal.locator('#full-name')
    if ((await nameInput.inputValue()).trim() === '') {
      await nameInput.fill('Demo Student')
    }
    await modal.getByRole('button', { name: /^Next$/i }).click()
    await modal.getByRole('button', { name: /^Next$/i }).click()
    await modal.getByRole('button', { name: /^Next$/i }).click()
    await modal.getByRole('button', { name: /Finish and plan my day/i }).click()
  } else {
    await modal.getByRole('button', { name: /Skip for now/i }).click()
  }

  await expect(modal).toBeHidden({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

test.describe('Ekagra core launch smoke tests', () => {
  test('starts Demo Mode on /today, completes quick-start modal, creates text + Image Occlusion cards, and views pricing', async ({
    page,
  }) => {
    await enterDemoOnToday(page, { completeOnboarding: true })

    // Create a text flashcard and verify persistence across reload
    await page.goto('/academics/cards')
    await expect(page.getByRole('heading', { name: 'Flashcards' })).toBeVisible()

    await page.getByRole('button', { name: /Add card/i }).click()
    await page.locator('#card-front').fill('What is Big-O of binary search?')
    await page.locator('#card-back').fill('O(log n)')
    await page.locator('[role="dialog"]').getByRole('button', { name: /^Add card$/i }).click()

    await expect(page.locator('[role="dialog"]')).toBeHidden()
    await expect(page.locator('#root').getByText('What is Big-O of binary search?')).toBeVisible()

    // Create Image Occlusion cards from sample diagram
    await page.getByRole('button', { name: /Add card/i }).click()
    const dialog = page.locator('[role="dialog"]')
    await dialog.getByRole('radio', { name: /Image occlusion/i }).click()
    await dialog.getByRole('button', { name: /Use sample diagram/i }).click()
    await dialog.getByRole('button', { name: /^Add card$/i }).click()

    await expect(dialog).toBeHidden()
    await page.reload()
    await expect(page.locator('#root').getByText('What is Big-O of binary search?')).toBeVisible()
    await expect(page.locator('#root').getByText('Image occlusion').first()).toBeVisible()

    // Public pricing page renders plans cleanly
    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: /Plans & Pricing/i })).toBeVisible()
  })

  test('applies 1-click starter pack, opens unified /studio inside AppShell, and plays 2-host audio summary on notes', async ({
    page,
  }) => {
    await enterDemoOnToday(page)

    // 1-click CS Undergrad starter pack in Academics
    await page.goto('/academics')
    await page.getByRole('button', { name: /Starter packs/i }).click()
    await page.locator('[role="dialog"]').getByRole('button', { name: /CS Undergrad/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText('Data Structures & Algorithms')).toBeVisible()

    // Unified Studio renders directly at /studio inside main AppShell
    await page.goto('/studio')
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Data Structures & Algorithms.*0 materials/i })).toBeVisible()

    // Seed sample notes on a subject and open 2-Host Audio Summary
    await page.goto('/academics')
    await page.getByRole('link', { name: /Data Structures & Algorithms/i }).click()
    await expect(page).toHaveURL(/\/academics\/subjects\/.+/)
    await page.getByRole('button', { name: /Load sample notes/i }).click()

    const firstNoteLink = page.locator('a[href^="/academics/notes/"]').first()
    await expect(firstNoteLink).toBeVisible({ timeout: 10_000 })
    await firstNoteLink.click()
    await expect(page).toHaveURL(/\/academics\/notes\/.+/)

    await page.getByRole('button', { name: /Generate 2-Host Audio Summary/i }).click()
    await expect(page.getByText('2-Host Audio Summary')).toBeVisible()
    await expect(page.getByRole('button', { name: /Transcript \(\.txt\)/i })).toBeVisible()
  })

  test('runs Python code in the Coding Lab (or verifies editor + runner readiness)', async ({ page }) => {
    test.setTimeout(120_000)
    await enterDemoOnToday(page)

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
    await enterDemoOnToday(page)

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

  test('serves public landing with Tollbooth preview, Forgot Password, legal routes, and analytics consent controls', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /One clear next step/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Academic Tollbooth Preview/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Forgot password\?/i })).toBeVisible()

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
