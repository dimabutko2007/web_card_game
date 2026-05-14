const db = require('../config/db');

class Card {
    static async getAll() {
        const [rows] = await db.execute('SELECT * FROM cards');
        return rows;
    }

    static async getRandomHand(count = 5) {
        const [rows] = await db.query('SELECT * FROM cards ORDER BY RAND() LIMIT ?', [parseInt(count)]);
        return rows;
    }

    static async getBalancedInitialHand(count = 5) {
        // Fetch up to 2 random cards with cost 1 or 2, respecting count
        const lowLimit = Math.min(2, count);
        const [lowCostCards] = await db.query(
            'SELECT * FROM cards WHERE cost IN (1, 2) ORDER BY RAND() LIMIT ?', [parseInt(lowLimit)]
        );

        const remainingCount = count - lowCostCards.length;
        let remainingCards = [];

        if (remainingCount > 0) {
            const excludedIds = lowCostCards.map(c => c.id);
            remainingCards = await this.getWeightedRandomCards(remainingCount, lowCostCards);
        }

        // Combine and shuffle the result
        return [...lowCostCards, ...remainingCards].sort(() => Math.random() - 0.5);
    }

    static async getWeightedRandomCards(count, currentHand = [], excludedCosts = []) {
        const [allCards] = await db.query('SELECT * FROM cards');

        const results = [];
        const workingHand = [...currentHand];

        for (let i = 0; i < count; i++) {
            // Filter candidates
            let candidates = allCards.filter(c => !excludedCosts.includes(c.cost));

            if (candidates.length === 0) break;

            // Calculate cost counts in working hand
            const costCounts = {};
            workingHand.forEach(c => {
                costCounts[c.cost] = (costCounts[c.cost] || 0) + 1;
            });

            // Assign weights
            let totalWeight = 0;
            const weightedCandidates = candidates.map(card => {
                let weight = 1.0;
                // Soft Cap: If 2 or more cards of this cost are already in hand, reduce weight by 70%
                if (costCounts[card.cost] >= 2) {
                    weight = 0.3;
                }
                totalWeight += weight;
                return { card, weight };
            });

            // Weighted random selection
            let r = Math.random() * totalWeight;
            for (const item of weightedCandidates) {
                r -= item.weight;
                if (r <= 0) {
                    results.push(item.card);
                    workingHand.push(item.card);
                    break;
                }
            }
        }
        return results;
    }

    static async getById(id) {
        const [rows] = await db.execute('SELECT * FROM cards WHERE id = ?', [id]);
        return rows[0];
    }
}

module.exports = Card;
