const db = require('../config/db');

class Card {
    /**
     * Returns all cards in the database, including both starter and shop cards.
     */
    static async getAll() {
        const [rows] = await db.execute('SELECT * FROM cards ORDER BY cost, name');
        return rows;
    }

    /**
     * Returns the 25 starter cards that are granted to every new player.
     */
    static async getStarterCards() {
        const [rows] = await db.execute('SELECT * FROM cards WHERE is_starter = TRUE ORDER BY cost, name');
        return rows;
    }

    /**
     * Returns cards that are only available through the shop (not part of the starter deck).
     */
    static async getShopCards() {
        const [rows] = await db.execute('SELECT * FROM cards WHERE is_starter = FALSE ORDER BY cost, shop_price, name');
        return rows;
    }

    /**
     * Returns all cards currently owned by the player (starter deck + purchased cards).
     * @param {number} userId
     */
    static async getUserCards(userId) {
        const [rows] = await db.execute(
            `SELECT c.* FROM cards c
             INNER JOIN user_cards uc ON uc.card_id = c.id
             WHERE uc.user_id = ?
             ORDER BY c.cost, c.name`,
            [userId]
        );
        return rows;
    }

    /**
     * Returns a Set of IDs for all cards in the player's collection for fast lookup.
     * @param {number} userId
     */
    static async getUserCardIds(userId) {
        const [rows] = await db.execute(
            'SELECT card_id FROM user_cards WHERE user_id = ?',
            [userId]
        );
        return new Set(rows.map(r => r.card_id));
    }

    /**
     * Automatically assigns the initial 25 starter cards to a new player.
     * Called during the registration process.
     * @param {number} userId
     */
    static async giveStarterCards(userId) {
        const starters = await this.getStarterCards();
        if (starters.length === 0) return;

        // Bulk insert all starter cards to the user's collection
        const values = starters.map(c => [userId, c.id]);
        await db.query(
            'INSERT IGNORE INTO user_cards (user_id, card_id) VALUES ?',
            [values]
        );
    }

    /**
     * Adds a specific card to the user's collection (e.g., after a shop purchase).
     * @param {number} userId
     * @param {number} cardId
     */
    static async addCardToUser(userId, cardId) {
        await db.execute(
            'INSERT IGNORE INTO user_cards (user_id, card_id) VALUES (?, ?)',
            [userId, cardId]
        );
    }

    static async getById(id) {
        const [rows] = await db.execute('SELECT * FROM cards WHERE id = ?', [id]);
        return rows[0];
    }

    /**
     * Generates a balanced starting hand of 5 cards from the player's personal collection.
     * Ensures a mix of low-cost and higher-cost cards for a smooth game start.
     * @param {number} count
     * @param {number} userId
     */
    static async getBalancedInitialHand(count = 5, userId) {
        const pool = await this.getUserCards(userId);

        const lowLimit = Math.min(2, count);
        const lowCostCards = this._pickRandom(
            pool.filter(c => c.cost <= 2),
            lowLimit
        );

        const remaining = count - lowCostCards.length;
        const excludedIds = new Set(lowCostCards.map(c => c.id));
        const remainingCards = this._weightedRandom(
            pool.filter(c => !excludedIds.has(c.id)),
            remaining,
            lowCostCards
        );

        return [...lowCostCards, ...remainingCards].sort(() => Math.random() - 0.5);
    }

    /**
     * Draws N cards from the player's deck using weighted probability.
     * Helps maintain game balance by soft-capping duplicates of the same energy cost.
     * @param {number} count
     * @param {Array}  currentHand  - The player's current hand (to check for cost distribution)
     * @param {Array}  excludedCosts - List of energy costs to exclude from drawing
     * @param {number} userId
     */
    static async getWeightedRandomCards(count, currentHand = [], excludedCosts = [], userId) {
        const pool = await this.getUserCards(userId);
        const available = excludedCosts.length
            ? pool.filter(c => !excludedCosts.includes(c.cost))
            : pool;

        return this._weightedRandom(available, count, currentHand);
    }

    // ─── Internal Helper Methods ────────────────────────────────────────────

    /**
     * Randomly picks `count` unique cards from a provided pool.
     */
    static _pickRandom(pool, count) {
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    /**
     * Performs a weighted random selection of cards.
     * Implements a "soft cap": if the hand already has 2+ cards of a certain cost,
     * the probability of drawing another card with the same cost is reduced.
     */
    static _weightedRandom(pool, count, currentHand = []) {
        const results = [];
        const workingHand = [...currentHand];
        const usedIds = new Set();

        for (let i = 0; i < count; i++) {
            const candidates = pool.filter(c => !usedIds.has(c.id));
            if (candidates.length === 0) break;

            const costCounts = {};
            workingHand.forEach(c => {
                costCounts[c.cost] = (costCounts[c.cost] || 0) + 1;
            });

            let totalWeight = 0;
            const weighted = candidates.map(card => {
                const weight = (costCounts[card.cost] >= 2) ? 0.3 : 1.0;
                totalWeight += weight;
                return { card, weight };
            });

            let r = Math.random() * totalWeight;
            for (const item of weighted) {
                r -= item.weight;
                if (r <= 0) {
                    results.push(item.card);
                    workingHand.push(item.card);
                    usedIds.add(item.card.id);
                    break;
                }
            }
        }
        return results;
    }
}

module.exports = Card;
