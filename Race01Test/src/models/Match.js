const db = require('../config/db');

class Match {
    static async initTable() {
        try {
            await db.execute(`
                CREATE TABLE IF NOT EXISTS matches (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    winner_id INT NOT NULL,
                    loser_id INT NOT NULL,
                    winner_nickname VARCHAR(255) NOT NULL,
                    loser_nickname VARCHAR(255) NOT NULL,
                    elo_change INT DEFAULT 25,
                    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (err) {
            console.error('[DB] Failed to init matches table:', err);
        }
    }

    static async recordMatch(winnerId, loserId, winnerNickname, loserNickname, eloChange = 25) {
        const [result] = await db.execute(
            'INSERT INTO matches (winner_id, loser_id, winner_nickname, loser_nickname, elo_change) VALUES (?, ?, ?, ?, ?)',
            [winnerId, loserId, winnerNickname, loserNickname, eloChange]
        );
        return result.insertId;
    }

    static async getHistoryForUser(userId, limit = 20) {
        // Using query instead of execute for LIMIT or ensuring it's a number
        // Some mysql2 versions have issues with LIMIT placeholders in execute()
        const [rows] = await db.query(
            `SELECT * FROM matches 
             WHERE winner_id = ? OR loser_id = ? 
             ORDER BY played_at DESC LIMIT ${parseInt(limit)}`,
            [userId, userId]
        );
        return rows;
    }
}

// Initialize table on load
Match.initTable().catch(err => console.error('Failed to init matches table:', err));

module.exports = Match;
