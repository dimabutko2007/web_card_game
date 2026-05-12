const db = require('../config/db');

class Friendship {
    static async sendRequest(senderId, receiverId) {
        if (senderId === receiverId) {
            throw new Error("You cannot add yourself as a friend.");
        }
        // Check if a reverse request exists
        const [revRows] = await db.execute(
            'SELECT id FROM friendships WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
            [receiverId, senderId]
        );
        if (revRows.length > 0) {
            // Auto-accept reverse request!
            await db.execute(
                'UPDATE friendships SET status = "accepted" WHERE id = ?',
                [revRows[0].id]
            );
            return;
        }
        // Insert new request
        await db.execute(
            'INSERT IGNORE INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, "pending")',
            [senderId, receiverId]
        );
    }

    static async acceptRequest(receiverId, senderId) {
        const [result] = await db.execute(
            'UPDATE friendships SET status = "accepted" WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
            [senderId, receiverId]
        );
        if (result.affectedRows === 0) {
            throw new Error("This friend request is no longer valid.");
        }
    }

    static async declineRequest(receiverId, senderId) {
        await db.execute(
            'DELETE FROM friendships WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
            [senderId, receiverId]
        );
    }

    static async removeFriend(userId1, userId2) {
        await db.execute(
            'DELETE FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [userId1, userId2, userId2, userId1]
        );
    }

    static async getRelation(userId1, userId2) {
        if (userId1 === userId2) return null;
        const [rows] = await db.execute(
            'SELECT sender_id, status FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [userId1, userId2, userId2, userId1]
        );
        return rows[0] || null;
    }

    static async getFriends(userId) {
        const [rows] = await db.execute(
            `SELECT u.id, u.nickname, u.avatar, u.elo, u.wins, u.losses 
             FROM users u
             JOIN friendships f ON (f.sender_id = u.id AND f.receiver_id = ? AND f.status = "accepted") 
                                OR (f.receiver_id = u.id AND f.sender_id = ? AND f.status = "accepted")
             ORDER BY u.nickname ASC`,
            [userId, userId]
        );
        return rows;
    }

    static async getPendingIncomingRequests(userId) {
        const [rows] = await db.execute(
            `SELECT f.id AS request_id, u.id AS user_id, u.nickname, u.avatar, u.elo, u.wins, u.losses
             FROM users u
             JOIN friendships f ON f.sender_id = u.id
             WHERE f.receiver_id = ? AND f.status = "pending"
             ORDER BY f.created_at DESC`,
            [userId]
        );
        return rows;
    }
}

module.exports = Friendship;
