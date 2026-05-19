const db = require('../config/db');

const DEFINITIONS = [
    {
        code: 'first_blood',
        title: 'First Blood',
        description: 'Win your first battle.',
        reward_coins: 75,
        category: 'Battle',
        target: 1
    },
    {
        code: 'warriors_path',
        title: "Warrior's Path",
        description: 'Play 5 battles.',
        reward_coins: 100,
        category: 'Battle',
        target: 5
    },
    {
        code: 'battle_veteran',
        title: 'Battle Veteran',
        description: 'Play 50 battles.',
        reward_coins: 350,
        category: 'Battle',
        target: 50
    },
    {
        code: 'no_mercy',
        title: 'No Mercy',
        description: 'Win 3 battles in a row.',
        reward_coins: 175,
        category: 'Battle',
        target: 3
    },
    {
        code: 'dark_champion',
        title: 'Dark Champion',
        description: 'Win 10 battles.',
        reward_coins: 250,
        category: 'Battle',
        target: 10
    },
    {
        code: 'comeback_king',
        title: 'Comeback King',
        description: 'Win a battle with 1-3 HP left.',
        reward_coins: 200,
        category: 'Battle',
        target: 1
    },
    {
        code: 'collector',
        title: 'Collector',
        description: 'Buy or own 35 different cards.',
        reward_coins: 300,
        category: 'Shop',
        target: 35
    },
    {
        code: 'first_purchase',
        title: 'First Purchase',
        description: 'Buy your first card in the Shop.',
        reward_coins: 50,
        category: 'Shop',
        target: 1
    },
    {
        code: 'big_spender',
        title: 'Big Spender',
        description: 'Spend 1000 coins in the Shop.',
        reward_coins: 175,
        category: 'Shop',
        target: 1000
    },
    {
        code: 'first_friend',
        title: 'First Friend',
        description: 'Add your first friend.',
        reward_coins: 50,
        category: 'Friends',
        target: 1
    },
    {
        code: 'social_player',
        title: 'Social Player',
        description: 'Have 10 friends.',
        reward_coins: 200,
        category: 'Friends',
        target: 10
    },
    {
        code: 'friend_slayer',
        title: 'Friend Slayer',
        description: 'Defeat a friend in battle.',
        reward_coins: 175,
        category: 'Friends',
        target: 1
    },
    {
        code: 'elite_fighter',
        title: 'Elite Fighter',
        description: 'Reach 1200 ELO.',
        reward_coins: 300,
        category: 'ELO',
        target: 1200
    },
    {
        code: 'legend_division',
        title: 'Legend Division',
        description: 'Reach 1500 ELO.',
        reward_coins: 500,
        category: 'ELO',
        target: 1500
    },
    {
        code: 'daily_visitor',
        title: 'Daily Visitor',
        description: 'Log in 2 days in a row.',
        reward_coins: 75,
        category: 'Daily',
        target: 2
    },
    {
        code: 'loyal_warrior',
        title: 'Loyal Warrior',
        description: 'Log in 5 days in a row.',
        reward_coins: 200,
        category: 'Daily',
        target: 5
    },
    {
        code: 'dark_ritual',
        title: 'Dark Ritual',
        description: 'Log in 10 days in a row.',
        reward_coins: 400,
        category: 'Daily',
        target: 10
    }
];

const DEFINITIONS_BY_CODE = new Map(DEFINITIONS.map((definition) => [definition.code, definition]));
let definitionsSynced = false;

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueInDefinitionOrder(codes) {
    const wanted = new Set(codes.filter(Boolean));
    return DEFINITIONS.filter((definition) => wanted.has(definition.code)).map((definition) => definition.code);
}

function serializeAchievement(definition, coins = null) {
    return {
        code: definition.code,
        title: definition.title,
        description: definition.description,
        reward_coins: definition.reward_coins,
        rewardCoins: definition.reward_coins,
        category: definition.category,
        target: definition.target,
        coins
    };
}

function createAchievementError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

class Achievement {
    static get definitions() {
        return DEFINITIONS;
    }

    static async ensureDefinitionsSynced() {
        if (definitionsSynced) return;

        const values = DEFINITIONS.map((definition) => [
            definition.code,
            definition.title,
            definition.description,
            definition.reward_coins,
            definition.category,
            definition.target
        ]);

        await db.query(
            `INSERT INTO achievements (code, title, description, reward_coins, category, target)
             VALUES ?
             ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                description = VALUES(description),
                reward_coins = VALUES(reward_coins),
                category = VALUES(category),
                target = VALUES(target)`,
            [values]
        );

        definitionsSynced = true;
    }

    static async unlockAchievement(userId, code) {
        const definition = DEFINITIONS_BY_CODE.get(code);
        if (!definition || !userId) return null;

        await this.ensureDefinitionsSynced();

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [insertResult] = await connection.execute(
                `INSERT IGNORE INTO user_achievements (user_id, achievement_code, unlocked_at, reward_given)
                 VALUES (?, ?, NOW(), FALSE)`,
                [userId, code]
            );

            if (insertResult.affectedRows === 0) {
                await connection.rollback();
                return null;
            }

            await connection.commit();
            return {
                ...serializeAchievement(definition),
                unlocked: true,
                completed: true,
                reward_given: false,
                claimed: false,
                claim_available: true,
                status: 'ready_to_claim'
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async claimAchievementReward(userId, code) {
        const definition = DEFINITIONS_BY_CODE.get(code);
        if (!definition || !userId) {
            throw createAchievementError('ACHIEVEMENT_NOT_FOUND', 'Achievement not found');
        }

        await this.ensureDefinitionsSynced();

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [achievementRows] = await connection.execute(
                `SELECT achievement_code, reward_given
                 FROM user_achievements
                 WHERE user_id = ? AND achievement_code = ?
                 FOR UPDATE`,
                [userId, code]
            );

            const userAchievement = achievementRows[0];
            if (!userAchievement) {
                throw createAchievementError('ACHIEVEMENT_NOT_COMPLETED', 'Achievement is not completed yet');
            }

            if (userAchievement.reward_given) {
                throw createAchievementError('ACHIEVEMENT_ALREADY_CLAIMED', 'Achievement reward already claimed');
            }

            const [claimResult] = await connection.execute(
                `UPDATE user_achievements
                 SET reward_given = TRUE
                 WHERE user_id = ? AND achievement_code = ? AND reward_given = FALSE`,
                [userId, code]
            );

            if (claimResult.affectedRows === 0) {
                throw createAchievementError('ACHIEVEMENT_ALREADY_CLAIMED', 'Achievement reward already claimed');
            }

            await connection.execute(
                'UPDATE users SET coins = coins + ? WHERE id = ?',
                [definition.reward_coins, userId]
            );

            const [userRows] = await connection.execute(
                'SELECT coins FROM users WHERE id = ?',
                [userId]
            );

            await connection.commit();
            return {
                ...serializeAchievement(definition, userRows[0] ? userRows[0].coins : null),
                unlocked: true,
                completed: true,
                reward_given: true,
                claimed: true,
                claim_available: false,
                status: 'claimed'
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async checkBattleAchievements(userId, battleData = {}) {
        if (!userId) return [];

        await this.updateBattleStreak(userId, !!battleData.isWin);

        const metrics = await this.getUserMetrics(userId);
        if (battleData.elo !== undefined && battleData.elo !== null) {
            metrics.elo = toNumber(battleData.elo);
        }

        const codes = [];
        if (metrics.totalBattles >= 5) codes.push('warriors_path');
        if (metrics.totalBattles >= 50) codes.push('battle_veteran');

        if (battleData.isWin) {
            if (metrics.wins >= 1) codes.push('first_blood');
            if (metrics.winStreak >= 3) codes.push('no_mercy');
            if (metrics.wins >= 10) codes.push('dark_champion');

            const remainingHp = toNumber(battleData.remainingHp);
            if (remainingHp >= 1 && remainingHp <= 3) {
                codes.push('comeback_king');
            }

            if (battleData.opponentId && await this.areFriends(userId, battleData.opponentId)) {
                codes.push('friend_slayer');
            }
        }

        if (metrics.elo >= 1200) codes.push('elite_fighter');
        if (metrics.elo >= 1500) codes.push('legend_division');

        return this.unlockMany(userId, codes);
    }

    static async checkShopAchievements(userId) {
        const metrics = await this.getUserMetrics(userId);
        const codes = [];

        if (metrics.coinsSpent >= 1) codes.push('first_purchase');
        if (metrics.cardCount >= 35) codes.push('collector');
        if (metrics.coinsSpent >= 1000) codes.push('big_spender');

        return this.unlockMany(userId, codes);
    }

    static async checkFriendAchievements(userId) {
        const metrics = await this.getUserMetrics(userId);
        const codes = [];

        if (metrics.friendCount >= 1) codes.push('first_friend');
        if (metrics.friendCount >= 10) codes.push('social_player');

        return this.unlockMany(userId, codes);
    }

    static async checkEloAchievements(userId) {
        const metrics = await this.getUserMetrics(userId);
        const codes = [];

        if (metrics.elo >= 1200) codes.push('elite_fighter');
        if (metrics.elo >= 1500) codes.push('legend_division');

        return this.unlockMany(userId, codes);
    }

    static async checkDailyLoginAchievements(userId) {
        if (!userId) return [];

        await db.execute(
            `UPDATE users
             SET login_streak = CASE
                    WHEN last_login_date = CURDATE() THEN login_streak
                    WHEN last_login_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN login_streak + 1
                    ELSE 1
                 END,
                 last_login_date = CASE
                    WHEN last_login_date = CURDATE() THEN last_login_date
                    ELSE CURDATE()
                 END
             WHERE id = ?`,
            [userId]
        );

        const metrics = await this.getUserMetrics(userId);
        const codes = [];

        if (metrics.loginStreak >= 2) codes.push('daily_visitor');
        if (metrics.loginStreak >= 5) codes.push('loyal_warrior');
        if (metrics.loginStreak >= 10) codes.push('dark_ritual');

        return this.unlockMany(userId, codes);
    }

    static async getUserAchievements(userId) {
        if (!userId) return [];

        await this.ensureDefinitionsSynced();
        const metrics = await this.getUserMetrics(userId);

        // Pre-check and unlock achievements immediately based on current user metrics
        const autoCheckCodes = [];
        if (metrics.totalBattles >= 5) autoCheckCodes.push('warriors_path');
        if (metrics.totalBattles >= 50) autoCheckCodes.push('battle_veteran');
        if (metrics.wins >= 1) autoCheckCodes.push('first_blood');
        if (Math.max(metrics.winStreak, metrics.maxWinStreak) >= 3) autoCheckCodes.push('no_mercy');
        if (metrics.wins >= 10) autoCheckCodes.push('dark_champion');
        if (metrics.elo >= 1200) autoCheckCodes.push('elite_fighter');
        if (metrics.elo >= 1500) autoCheckCodes.push('legend_division');
        if (metrics.coinsSpent >= 1) autoCheckCodes.push('first_purchase');
        if (metrics.cardCount >= 35) autoCheckCodes.push('collector');
        if (metrics.coinsSpent >= 1000) autoCheckCodes.push('big_spender');
        if (metrics.friendCount >= 1) autoCheckCodes.push('first_friend');
        if (metrics.friendCount >= 10) autoCheckCodes.push('social_player');
        if (metrics.loginStreak >= 2) autoCheckCodes.push('daily_visitor');
        if (metrics.loginStreak >= 5) autoCheckCodes.push('loyal_warrior');
        if (metrics.loginStreak >= 10) autoCheckCodes.push('dark_ritual');

        if (autoCheckCodes.length > 0) {
            await this.unlockMany(userId, autoCheckCodes);
        }

        const [unlockedRows] = await db.execute(
            `SELECT achievement_code, unlocked_at, reward_given
             FROM user_achievements
             WHERE user_id = ?`,
            [userId]
        );
        const unlockedByCode = new Map(unlockedRows.map((row) => [row.achievement_code, row]));

        return DEFINITIONS.map((definition) => {
            const unlocked = unlockedByCode.get(definition.code);
            const isUnlocked = !!unlocked;
            const isClaimed = unlocked ? !!unlocked.reward_given : false;
            return {
                ...serializeAchievement(definition),
                unlocked: isUnlocked,
                completed: isUnlocked,
                unlocked_at: unlocked ? unlocked.unlocked_at : null,
                reward_given: isClaimed,
                claimed: isClaimed,
                claim_available: isUnlocked && !isClaimed,
                status: !isUnlocked ? 'locked' : (isClaimed ? 'claimed' : 'ready_to_claim'),
                progress: this.getProgress(definition, metrics, isUnlocked)
            };
        });
    }

    static async unlockMany(userId, codes) {
        const unlocked = [];
        for (const code of uniqueInDefinitionOrder(codes)) {
            const achievement = await this.unlockAchievement(userId, code);
            if (achievement) unlocked.push(achievement);
        }
        return unlocked;
    }

    static async updateBattleStreak(userId, isWin) {
        if (isWin) {
            await db.execute(
                `UPDATE users
                 SET max_win_streak = GREATEST(max_win_streak, win_streak + 1),
                     win_streak = win_streak + 1
                 WHERE id = ?`,
                [userId]
            );
            return;
        }

        await db.execute(
            'UPDATE users SET win_streak = 0 WHERE id = ?',
            [userId]
        );
    }

    static async getUserMetrics(userId) {
        const [userRows] = await db.execute(
            `SELECT id, wins, losses, elo, coins, win_streak, max_win_streak,
                    coins_spent, last_login_date, login_streak
             FROM users
             WHERE id = ?`,
            [userId]
        );
        const user = userRows[0] || {};

        const [friendRows] = await db.execute(
            `SELECT COUNT(*) AS count
             FROM friendships
             WHERE status = "accepted" AND (sender_id = ? OR receiver_id = ?)`,
            [userId, userId]
        );

        const [cardRows] = await db.execute(
            'SELECT COUNT(DISTINCT card_id) AS count FROM user_cards WHERE user_id = ?',
            [userId]
        );

        const wins = toNumber(user.wins);
        const losses = toNumber(user.losses);

        return {
            wins,
            losses,
            totalBattles: wins + losses,
            elo: toNumber(user.elo),
            coins: toNumber(user.coins),
            winStreak: toNumber(user.win_streak),
            maxWinStreak: toNumber(user.max_win_streak),
            coinsSpent: toNumber(user.coins_spent),
            loginStreak: toNumber(user.login_streak),
            friendCount: toNumber(friendRows[0] ? friendRows[0].count : 0),
            cardCount: toNumber(cardRows[0] ? cardRows[0].count : 0)
        };
    }

    static getProgress(definition, metrics, unlocked) {
        let current = unlocked ? definition.target : 0;

        switch (definition.code) {
            case 'first_blood':
            case 'dark_champion':
                current = metrics.wins;
                break;
            case 'warriors_path':
            case 'battle_veteran':
                current = metrics.totalBattles;
                break;
            case 'no_mercy':
                current = Math.max(metrics.winStreak, metrics.maxWinStreak);
                break;
            case 'collector':
                current = metrics.cardCount;
                break;
            case 'first_purchase':
                current = metrics.coinsSpent > 0 ? 1 : 0;
                break;
            case 'big_spender':
                current = metrics.coinsSpent;
                break;
            case 'first_friend':
            case 'social_player':
                current = metrics.friendCount;
                break;
            case 'elite_fighter':
            case 'legend_division':
                current = metrics.elo;
                break;
            case 'daily_visitor':
            case 'loyal_warrior':
            case 'dark_ritual':
                current = metrics.loginStreak;
                break;
            default:
                current = unlocked ? definition.target : 0;
        }

        const capped = Math.min(current, definition.target);
        return {
            current,
            target: definition.target,
            capped,
            percent: definition.target > 0 ? Math.round((capped / definition.target) * 100) : 0
        };
    }

    static async areFriends(userId, otherUserId) {
        const [rows] = await db.execute(
            `SELECT id
             FROM friendships
             WHERE status = "accepted"
               AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
             LIMIT 1`,
            [userId, otherUserId, otherUserId, userId]
        );
        return rows.length > 0;
    }
}

module.exports = Achievement;
