import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getFilteredGames,
    getGameById,
} from './games';

/** Database IDs returned by the game-filter test fixtures. */
interface FilterFixtureIds {
    categoryIds: {
        strategy: number;
        puzzle: number;
    };
    publisherIds: {
        one: number;
        two: number;
    };
}

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

/** Insert a small catalog with distinct category and publisher combinations. */
async function seedFilterGames(db: Database): Promise<FilterFixtureIds> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'Strategy games' })
        .returning({ id: categories.id });
    const [puzzle] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'Puzzle games' })
        .returning({ id: categories.id });
    const [publisherOne] = await db
        .insert(publishers)
        .values({ name: 'Publisher One', description: 'First publisher' })
        .returning({ id: publishers.id });
    const [publisherTwo] = await db
        .insert(publishers)
        .values({ name: 'Publisher Two', description: 'Second publisher' })
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Alpha Strategy',
            description: 'Strategy by publisher one',
            starRating: 4,
            categoryId: strategy.id,
            publisherId: publisherOne.id,
        },
        {
            title: 'Beta Puzzle',
            description: 'Puzzle by publisher one',
            starRating: 4,
            categoryId: puzzle.id,
            publisherId: publisherOne.id,
        },
        {
            title: 'Gamma Puzzle',
            description: 'Puzzle by publisher two',
            starRating: 4,
            categoryId: puzzle.id,
            publisherId: publisherTwo.id,
        },
        {
            title: 'Delta Strategy',
            description: 'Strategy by publisher two',
            starRating: 4,
            categoryId: strategy.id,
            publisherId: publisherTwo.id,
        },
    ]);

    return {
        categoryIds: { strategy: strategy.id, puzzle: puzzle.id },
        publisherIds: { one: publisherOne.id, two: publisherTwo.id },
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all games in title order when no filters are selected', async () => {
        await seedFilterGames(db);
        const filtered = await getFilteredGames(db, { categoryIds: [] });

        expect(filtered.map((game) => game.title)).toEqual([
            'Alpha Strategy',
            'Beta Puzzle',
            'Delta Strategy',
            'Gamma Puzzle',
        ]);
    });

    it('matches any of the selected categories', async () => {
        const ids = await seedFilterGames(db);
        const filtered = await getFilteredGames(db, {
            categoryIds: [ids.categoryIds.strategy, ids.categoryIds.puzzle],
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Alpha Strategy',
            'Beta Puzzle',
            'Delta Strategy',
            'Gamma Puzzle',
        ]);
    });

    it('combines category and publisher filters', async () => {
        const ids = await seedFilterGames(db);
        const filtered = await getFilteredGames(db, {
            categoryIds: [ids.categoryIds.puzzle],
            publisherId: ids.publisherIds.one,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Beta Puzzle']);
    });

    it('filters by publisher without a category filter', async () => {
        const ids = await seedFilterGames(db);
        const filtered = await getFilteredGames(db, { publisherId: ids.publisherIds.two });

        expect(filtered.map((game) => game.title)).toEqual(['Delta Strategy', 'Gamma Puzzle']);
    });

    it('returns no games when the filters do not match', async () => {
        const ids = await seedFilterGames(db);
        const filtered = await getFilteredGames(db, {
            categoryIds: [ids.categoryIds.puzzle],
            publisherId: 999999,
        });

        expect(filtered).toEqual([]);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('preserves a null starRating', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });
        await db.insert(games).values({
            title: 'Unrated Game',
            description: 'Description',
            starRating: null,
            categoryId: category.id,
            publisherId: publisher.id,
        });

        const [game] = await getAllGames(db);
        expect(game.starRating).toBeNull();

        const byId = await getGameById(db, game.id);
        expect(byId?.starRating).toBeNull();
    });
});
