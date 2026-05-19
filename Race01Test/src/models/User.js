const db = require('../config/db');
const bcrypt = require('bcrypt');
const Card = require('./Card');

class User {
    /**
     * Creates a new player and automatically assigns them the 25 starter cards.
     */
    static async create(nickname, email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (nickname, email, password) VALUES (?, ?, ?)',
            [nickname, email, hashedPassword]
        );
        const userId = result.insertId;

        // Assign starter cards to the new player's collection
        await Card.giveStarterCards(userId);

        return userId;
    }

    static async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    }

    static async findByNickname(nickname) {
        const [rows] = await db.execute('SELECT * FROM users WHERE nickname = ?', [nickname]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.execute(
            'SELECT id, nickname, email, avatar, wins, losses, elo, coins FROM users WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    /**
     * Updates player statistics after a match.
     * The winner receives +50 coins, while the loser receives 0 coins.
     */
    static async updateStats(userId, isWin) {
        const eloChange = isWin ? 25 : -25;
        const coinsReward = isWin ? 50 : 0;

        if (isWin) {
            await db.execute(
                'UPDATE users SET wins = wins + 1, elo = elo + ?, coins = coins + ? WHERE id = ?',
                [eloChange, coinsReward, userId]
            );
        } else {
            await db.execute(
                'UPDATE users SET losses = losses + 1, elo = elo + ?, coins = coins + ? WHERE id = ?',
                [eloChange, coinsReward, userId]
            );
        }
        return await this.findById(userId);
    }

    /**
     * Adds coins to the user's balance (e.g., from level-ups, bonuses, or events).
     */
    static async addCoins(userId, amount) {
        await db.execute(
            'UPDATE users SET coins = coins + ? WHERE id = ?',
            [parseInt(amount), userId]
        );
        return await this.findById(userId);
    }

    /**
     * Deducts coins from the user's balance (e.g., for shop purchases).
     * Returns false if the user has insufficient funds.
     */
    static async spendCoins(userId, amount) {
        const user = await this.findById(userId);
        if (!user || user.coins < amount) return false;

        await db.execute(
            'UPDATE users SET coins = coins - ? WHERE id = ?',
            [parseInt(amount), userId]
        );
        return true;
    }

    static async updateAvatar(userId, avatarPath) {
        await db.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, userId]);
    }

    static async setResetToken(email, token, expires) {
        await db.execute(
            'UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?',
            [token, expires, email]
        );
    }

    static async findByToken(token) {
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()',
            [token]
        );
        return rows[0];
    }

    static async updatePassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute(
            'UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
            [hashedPassword, userId]
        );
    }

    static async updateNickname(userId, nickname) {
        await db.execute('UPDATE users SET nickname = ? WHERE id = ?', [nickname, userId]);
    }

    static async getTopPlayers(limit = 10) {
        const [rows] = await db.execute(
            `SELECT nickname, avatar, elo, wins, losses FROM users ORDER BY elo DESC LIMIT ${parseInt(limit)}`
        );
        return rows;
    }

    static async getAllUsers() {
        const [rows] = await db.execute('SELECT id, nickname, avatar, elo FROM users ORDER BY nickname ASC');
        return rows;
    }

    static getRank(elo) {
        if (elo >= 2500) return { name: 'Netherite',   icon: 'netherite.png' };
        if (elo >= 2250) return { name: 'Emerald',     icon: 'emerald.png' };
        if (elo >= 2000) return { name: 'Diamond',     icon: 'diamond.png' };
        if (elo >= 1800) return { name: 'Lapis',       icon: 'lapis.png' };
        if (elo >= 1600) return { name: 'Redstone',    icon: 'redstone.png' };
        if (elo >= 1400) return { name: 'Gold',        icon: 'gold.png' };
        if (elo >= 1200) return { name: 'Iron',        icon: 'iron.png' };
        if (elo >= 1000) return { name: 'Copper',      icon: 'copper.png' };
        if (elo >=  800) return { name: 'Coal',        icon: 'coal.png' };
        return             { name: 'Cobblestone',  icon: 'cobblestone.png' };
    }
}

module.exports = User;
