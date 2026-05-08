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

    static async getById(id) {
        const [rows] = await db.execute('SELECT * FROM cards WHERE id = ?', [id]);
        return rows[0];
    }
}

module.exports = Card;
