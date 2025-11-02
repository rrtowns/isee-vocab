import { test, expect } from '@playwright/test';

test('homepage loads successfully', async ({ page }) => {
  await page.goto('/');

  // Wait for the page to load
  await expect(page).toHaveTitle(/ISEE Vocabulary/);

  // Check that main heading is visible
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('can input words into textarea', async ({ page }) => {
  await page.goto('/');

  // Find the textarea for word input
  const textarea = page.getByRole('textbox').first();
  await textarea.fill('aberrant\nalacrity\nbenevolent');

  // Verify the text was entered
  await expect(textarea).toHaveValue('aberrant\nalacrity\nbenevolent');
});
