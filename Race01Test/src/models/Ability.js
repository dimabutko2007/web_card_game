const db = require('../config/db');

class Ability {
    static async getAll() {
        const [rows] = await db.query('SELECT * FROM abilities');
        return rows;
    }

    static async getById(id) {
        const [rows] = await db.query('SELECT * FROM abilities WHERE id = ?', [id]);
        return rows[0];
    }

    static async getRandomAbility() {
        const [rows] = await db.query('SELECT * FROM abilities ORDER BY RAND() LIMIT 1');
        return rows[0];
    }
}

module.exports = Ability;
