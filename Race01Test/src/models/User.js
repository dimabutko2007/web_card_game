const db = require('../config/db');
const bcrypt = require('bcrypt');

class User {
    static async create(nickname, email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (nickname, email, password) VALUES (?, ?, ?)',
            [nickname, email, hashedPassword]
        );
        return result.insertId;
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
        const [rows] = await db.execute('SELECT id, nickname, email, avatar, wins, losses, elo FROM users WHERE id = ?', [id]);
        return rows[0];
    }

    static async updateStats(userId, isWin) {
        const eloChange = isWin ? 25 : -25;
        if (isWin) {
            await db.execute('UPDATE users SET wins = wins + 1, elo = elo + ? WHERE id = ?', [eloChange, userId]);
        } else {
            await db.execute('UPDATE users SET losses = losses + 1, elo = elo + ? WHERE id = ?', [eloChange, userId]);
        }
        return await this.findById(userId);
    }

    static async updateAvatar(userId, avatarPath) {
        await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
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

    static async getTopPlayers(limit = 10) {
        const [rows] = await db.execute(
            `SELECT nickname, avatar, elo, wins, losses FROM users ORDER BY elo DESC LIMIT ${parseInt(limit)}`
        );
        return rows;
    }
}

module.exports = User;
