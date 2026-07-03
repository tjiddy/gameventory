import { test, expect } from '@playwright/test';

test('browse the library, filter, open details, toggle played, and delete', async ({ page }) => {
  await page.goto('/');

  // Seeded game renders, with the live count.
  await expect(page.getByRole('heading', { name: 'Catan', exact: true })).toBeVisible();
  await expect(page.getByText(/Showing 1 of 1 games/)).toBeVisible();

  // Text filter with no match → empty state, then clear.
  await page.getByPlaceholder('Filter by name…').fill('zzz');
  await expect(page.getByText('No games found.')).toBeVisible();
  await page.getByPlaceholder('Filter by name…').fill('');
  await expect(page.getByRole('heading', { name: 'Catan', exact: true })).toBeVisible();

  // Open details via the cover link.
  await page.locator('a[href="/details/13"]').first().click();
  await expect(page.getByRole('heading', { name: 'Catan' })).toBeVisible();

  // Toggle played (admin actions visible via AUTH_BYPASS).
  await page.getByRole('button', { name: 'Mark as Played' }).click();
  await expect(page.getByRole('button', { name: 'Mark as Unplayed' })).toBeVisible();

  // Delete with confirm → back to an empty library.
  await page.getByRole('button', { name: 'Remove Game' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3195/');
  await expect(page.getByText('No games found.')).toBeVisible();
});
