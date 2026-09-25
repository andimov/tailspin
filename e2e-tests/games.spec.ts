import { test, expect, type Response } from '@playwright/test';

test.describe('Game filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('filters by one or more categories and clears the selections', async ({ page }) => {
    const allCards = page.getByTestId('game-card');
    const categoryInputs = page.getByTestId('category-filter');
    const categoryIds = await categoryInputs.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
    const selectedCategoryIds = categoryIds.slice(0, 2);

    expect(selectedCategoryIds.length).toBe(2);
    const expectedCount = await allCards.evaluateAll(
      (cards, selectedIds) =>
        cards.filter((card) =>
          selectedIds.includes(card.getAttribute('data-category-id') ?? ''),
        ).length,
      selectedCategoryIds,
    );

    for (const categoryId of selectedCategoryIds) {
      await page.locator(`[data-testid="category-filter"][value="${categoryId}"]`).check();
    }

    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(expectedCount);
    await expect(page.getByTestId('filter-results-status')).toHaveText(
      `Showing ${expectedCount} of ${await allCards.count()} games.`,
    );

    await page.getByTestId('clear-game-filters').click();
    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(
      await allCards.count(),
    );
  });

  test('filters by publisher without selecting a category', async ({ page }) => {
    const allCards = page.getByTestId('game-card');
    const publisherFilter = page.getByRole('combobox', { name: 'Publisher' });
    const publisherIds = await publisherFilter.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
    const [publisherId] = publisherIds;

    if (!publisherId) {
      throw new Error('Publisher filter must include at least one publisher option.');
    }

    const expectedCount = await allCards.evaluateAll(
      (cards, selectedPublisherId) =>
        cards.filter((card) => card.getAttribute('data-publisher-id') === selectedPublisherId)
          .length,
      publisherId,
    );

    await publisherFilter.selectOption(publisherId);

    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(expectedCount);
    await expect(page.getByTestId('filter-results-status')).toHaveText(
      `Showing ${expectedCount} of ${await allCards.count()} games.`,
    );
  });

  test('combines category and publisher filters', async ({ page }) => {
    const allCards = page.getByTestId('game-card');
    const firstCard = allCards.first();
    const categoryId = await firstCard.getAttribute('data-category-id');
    const publisherId = await firstCard.getAttribute('data-publisher-id');

    if (!categoryId || !publisherId) {
      throw new Error('Game cards must expose their category and publisher IDs for filtering.');
    }

    const expectedCount = await allCards.evaluateAll(
      (cards, filters) =>
        cards.filter(
          (card) =>
            card.getAttribute('data-category-id') === filters.categoryId &&
            card.getAttribute('data-publisher-id') === filters.publisherId,
        ).length,
      { categoryId, publisherId },
    );

    await page.locator(`[data-testid="category-filter"][value="${categoryId}"]`).check();
    await page.getByTestId('publisher-filter').selectOption(publisherId);

    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(expectedCount);
    await expect(page.getByTestId('filter-results-status')).toHaveText(
      `Showing ${expectedCount} of ${await allCards.count()} games.`,
    );
  });

  test('announces when no games match the selected publisher', async ({ page }) => {
    const publisherFilter = page.getByRole('combobox', { name: 'Publisher' });
    const unmatchedPublisherId = 'unmatched-publisher';

    await publisherFilter.evaluate((select, value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = 'Publisher with no games';
      select.append(option);
    }, unmatchedPublisherId);
    await publisherFilter.selectOption(unmatchedPublisherId);

    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(0);
    await expect(page.getByTestId('filter-results-status')).toHaveText(
      'No games match these filters.',
    );
  });
});

test.describe('Game Listing and Navigation', () => {
  test('should display games with titles on index page', async ({ page }) => {
    await test.step('Navigate to homepage', async () => {
      await page.goto('/');
    });

    await test.step('Verify games grid is visible', async () => {
      const gamesGrid = page.getByTestId('games-grid');
      await expect(gamesGrid).toBeVisible();
    });

    await test.step('Verify game cards are displayed', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first()).toBeVisible();
      expect(await gameCards.count()).toBeGreaterThan(0);
    });

    await test.step('Verify game cards have titles with content', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first().getByTestId('game-title')).toBeVisible();
      await expect(gameCards.first().getByTestId('game-title')).not.toBeEmpty();
    });

    await test.step('Verify game cards display a star rating out of 5', async () => {
      const gameCards = page.getByTestId('game-card');
      const rating = gameCards.first().getByTestId('game-rating');
      await expect(rating).toBeVisible();
      await expect(rating).toContainText(/(\/5|No rating yet)/);
    });
  });

  test('should navigate to correct game details page when clicking on a game', async ({ page }) => {
    let gameId: string | null;
    let gameTitle: string | null;

    await test.step('Navigate to homepage and wait for games to load', async () => {
      await page.goto('/');
      const gamesGrid = page.getByTestId('games-grid');
      await expect(gamesGrid).toBeVisible();
    });

    await test.step('Get first game information and click it', async () => {
      const firstGameCard = page.getByTestId('game-card').first();
      gameId = await firstGameCard.getAttribute('data-game-id');
      gameTitle = await firstGameCard.getAttribute('data-game-title');
      await firstGameCard.click();
    });

    await test.step('Verify navigation to game details page', async () => {
      await expect(page).toHaveURL(`/game/${gameId}`);
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify game title matches clicked game', async () => {
      if (gameTitle) {
        await expect(page.getByTestId('game-details-title')).toHaveText(gameTitle);
      }
    });
  });

  test('should display game details with all required information', async ({ page }) => {
    await test.step('Navigate to specific game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify game title is displayed', async () => {
      const gameTitle = page.getByTestId('game-details-title');
      await expect(gameTitle).toBeVisible();
      await expect(gameTitle).not.toBeEmpty();
    });

    await test.step('Verify game description is displayed', async () => {
      const gameDescription = page.getByTestId('game-details-description');
      await expect(gameDescription).toBeVisible();
      await expect(gameDescription).not.toBeEmpty();
    });

    await test.step('Verify publisher or category information is present', async () => {
      const publisherExists = await page.getByTestId('game-details-publisher').isVisible();
      const categoryExists = await page.getByTestId('game-details-category').isVisible();
      expect(publisherExists || categoryExists).toBeTruthy();

      if (publisherExists) {
        await expect(page.getByTestId('game-details-publisher')).not.toBeEmpty();
      }

      if (categoryExists) {
        await expect(page.getByTestId('game-details-category')).not.toBeEmpty();
      }
    });
  });

  test('should display a button to back the game', async ({ page }) => {
    await test.step('Navigate to game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify back game button is visible and enabled', async () => {
      const backButton = page.getByTestId('back-game-button');
      await expect(backButton).toBeVisible();
      await expect(backButton).toContainText('Support This Game');
      await expect(backButton).toBeEnabled();
    });
  });

  test('should be able to navigate back to home from game details', async ({ page }) => {
    await test.step('Navigate to game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Click back to all games link', async () => {
      const backLink = page.getByRole('link', { name: /back to all games/i });
      await expect(backLink).toBeVisible();
      await backLink.click();
    });

    await test.step('Verify navigation back to homepage', async () => {
      await expect(page).toHaveURL('/');
      await expect(page.getByTestId('games-grid')).toBeVisible();
    });
  });

  test('should return a 404 page for a non-existent game', async ({ page }) => {
    let response: Response | null;

    await test.step('Navigate to non-existent game', async () => {
      response = await page.goto('/game/99999');
    });

    await test.step('Verify a branded 404 page is served', async () => {
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/Page Not Found - Tailspin Toys/);
      await expect(page.getByTestId('not-found')).toBeVisible();
      await expect(page.getByTestId('not-found-heading')).not.toBeEmpty();
      await expect(page.getByTestId('not-found-home-link')).toBeVisible();
    });
  });
});
