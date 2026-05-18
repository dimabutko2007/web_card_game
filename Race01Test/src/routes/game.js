const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/User');
const Match = require('../models/Match');
const Friendship = require('../models/Friendship');
const Card = require('../models/Card');
const Achievement = require('../models/Achievement');
const gameSocket = require('../sockets/gameSocket');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer config for avatar uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads/avatars/'));
    },
    filename: function (req, file, cb) {
        cb(null, req.session.userId + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Images only (jpeg, jpg, png, gif)!'));
        }
    }
});

const redirectBackWithParam = (req, res, paramName, paramValue) => {
    const referer = req.get('referer') || '/lobby';
    try {
        const refUrl = new URL(referer, `${req.protocol}://${req.get('host')}`);
        refUrl.searchParams.set(paramName, paramValue);
        res.redirect(refUrl.pathname + refUrl.search);
    } catch (e) {
        res.redirect(`/lobby?${paramName}=` + encodeURIComponent(paramValue));
    }
};

const requireJsonAuth = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: 'Authentication required'
    });
};

const mergeAchievementUnlocks = (...groups) => {
    const merged = [];
    const seen = new Set();

    groups.flat().filter(Boolean).forEach((achievement) => {
        if (!achievement.code || seen.has(achievement.code)) return;
        seen.add(achievement.code);
        merged.push(achievement);
    });

    return merged;
};

const queueSessionAchievementUnlocks = (req, unlocks) => {
    if (!unlocks || unlocks.length === 0) return;
    const current = Array.isArray(req.session.achievementUnlocks) ? req.session.achievementUnlocks : [];
    req.session.achievementUnlocks = mergeAchievementUnlocks(current, unlocks);
};

const emitAchievementUnlocksToUser = (io, userId, unlocks) => {
    if (!io || !unlocks || unlocks.length === 0) return;
    unlocks.forEach((achievement) => {
        io.to(`user_${userId}`).emit('achievementUnlocked', achievement);
    });
};

const handleFriendAchievementUnlocks = async (req, io, userIdA, userIdB) => {
    const [unlocksA, unlocksB] = await Promise.all([
        Achievement.checkFriendAchievements(userIdA),
        Achievement.checkFriendAchievements(userIdB)
    ]);

    if (String(req.session.userId) === String(userIdA)) {
        queueSessionAchievementUnlocks(req, unlocksA);
    } else {
        emitAchievementUnlocksToUser(io, userIdA, unlocksA);
    }

    if (String(req.session.userId) === String(userIdB)) {
        queueSessionAchievementUnlocks(req, unlocksB);
    } else {
        emitAchievementUnlocksToUser(io, userIdB, unlocksB);
    }
};

router.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/lobby');
    } else {
        res.redirect('/auth/login');
    }
});

router.get('/lobby', authController.isAuthenticated, async (req, res) => {
    const queuedAchievementUnlocks = Array.isArray(req.session.achievementUnlocks) ? req.session.achievementUnlocks : [];
    req.session.achievementUnlocks = [];
    const dailyUnlocks = await Achievement.checkDailyLoginAchievements(req.session.userId);
    const user = await User.findById(req.session.userId);
    const leaders = await User.getTopPlayers(25);
    const friends = await Friendship.getFriends(req.session.userId);
    friends.forEach(f => {
        f.isOnline = gameSocket.isUserOnline(f.id);
        f.activeGameId = gameSocket.getUserActiveGameId(f.id);
        f.isPlaying = f.activeGameId !== null;
    });
    const pendingRequests = await Friendship.getPendingIncomingRequests(req.session.userId);
    const allCards = await Card.getAll();
    let userCardIdsSet = await Card.getUserCardIds(req.session.userId);
    if (userCardIdsSet.size === 0) {
        await Card.giveStarterCards(req.session.userId);
        userCardIdsSet = await Card.getUserCardIds(req.session.userId);
    }
    const userCardIds = Array.from(userCardIdsSet);
    const shopCards = await Card.getUnownedShopCards(req.session.userId);
    const achievements = await Achievement.getUserAchievements(req.session.userId);
    const recentAchievementUnlocks = mergeAchievementUnlocks(queuedAchievementUnlocks, dailyUnlocks);
    res.render('lobby', {
        nickname: req.session.nickname,
        userId: req.session.userId,
        elo: user.elo,
        avatar: user.avatar,
        coins: user.coins,
        leaders: leaders,
        friends: friends,
        pendingRequests: pendingRequests,
        allCards: allCards,
        userCardIds: userCardIds,
        shopCards: shopCards,
        achievements: achievements,
        recentAchievementUnlocks: recentAchievementUnlocks,
        error: req.query.error,
        success: req.query.success
    });
});

router.get('/profile', authController.isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/auth/login');
        }
        const matches = await Match.getHistoryForUser(req.session.userId, 5);
        user.isOnline = gameSocket.isUserOnline(user.id);
        user.activeGameId = gameSocket.getUserActiveGameId(user.id);
        user.isPlaying = user.activeGameId !== null;
        const friends = await Friendship.getFriends(req.session.userId);
        friends.forEach(f => {
            f.isOnline = gameSocket.isUserOnline(f.id);
            f.activeGameId = gameSocket.getUserActiveGameId(f.id);
            f.isPlaying = f.activeGameId !== null;
        });
        res.render('profile', {
            user,
            matches,
            friends,
            isOwnProfile: true,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.redirect('/lobby');
    }
});

router.get('/profile/:nickname', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;

        // If it's the current user, redirect to /profile
        if (nickname === req.session.nickname) {
            return res.redirect('/profile');
        }

        const user = await User.findByNickname(nickname);
        if (!user) {
            return res.redirect('/lobby?error=' + encodeURIComponent('User not found.'));
        }

        const matches = await Match.getHistoryForUser(user.id, 5);
        const friends = await Friendship.getFriends(user.id);
        const loggedInUserFriends = await Friendship.getFriends(req.session.userId);
        const loggedInUserFriendIds = new Set(loggedInUserFriends.map(f => f.id));

        user.isOnline = gameSocket.isUserOnline(user.id);
        user.isPlaying = gameSocket.getUserActiveGameId(user.id) !== null;
        if (loggedInUserFriendIds.has(user.id)) {
            user.activeGameId = gameSocket.getUserActiveGameId(user.id);
        } else {
            user.activeGameId = null;
        }

        friends.forEach(f => {
            f.isOnline = gameSocket.isUserOnline(f.id);
            f.isPlaying = gameSocket.getUserActiveGameId(f.id) !== null;
            if (f.id === req.session.userId || loggedInUserFriendIds.has(f.id)) {
                f.activeGameId = gameSocket.getUserActiveGameId(f.id);
            } else {
                f.activeGameId = null;
            }
        });
        const relation = await Friendship.getRelation(req.session.userId, user.id);
        res.render('profile', {
            user,
            matches,
            friends,
            relation,
            isOwnProfile: false,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Foreign profile error:', error);
        res.redirect('/lobby?error=' + encodeURIComponent('Failed to load profile history. ' + error.message));
    }
});

router.get('/profile/:nickname/history', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;
        const user = await User.findByNickname(nickname);
        if (!user) {
            return res.redirect('/lobby?error=' + encodeURIComponent('User not found.'));
        }

        const matches = await Match.getHistoryForUser(user.id, 100); // Fetch up to 100 recent matches
        res.render('history', {
            user,
            matches,
            isOwnProfile: nickname === req.session.nickname,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('History error:', error);
        res.redirect('/profile/' + req.params.nickname);
    }
});

router.get('/profile/:nickname/friends', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;
        const user = await User.findByNickname(nickname);
        if (!user) {
            return res.redirect('/lobby?error=' + encodeURIComponent('User not found.'));
        }
        const friends = await Friendship.getFriends(user.id);
        const loggedInUserFriends = await Friendship.getFriends(req.session.userId);
        const loggedInUserFriendIds = new Set(loggedInUserFriends.map(f => f.id));

        friends.forEach(f => {
            f.isOnline = gameSocket.isUserOnline(f.id);
            f.isPlaying = gameSocket.getUserActiveGameId(f.id) !== null;
            if (f.id === req.session.userId || loggedInUserFriendIds.has(f.id)) {
                f.activeGameId = gameSocket.getUserActiveGameId(f.id);
            } else {
                f.activeGameId = null;
            }
        });
        const pendingRequests = nickname === req.session.nickname ? await Friendship.getPendingIncomingRequests(user.id) : [];
        const allRegisteredUsers = await User.getAllUsers();
        const availableUsersForSearch = allRegisteredUsers.filter(u => u.id !== req.session.userId);
        res.render('friends', {
            user,
            friends,
            pendingRequests,
            availableUsers: availableUsersForSearch,
            isOwnProfile: nickname === req.session.nickname,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Friends page error:', error);
        res.redirect('/profile/' + req.params.nickname);
    }
});

router.post('/profile/add-friend-by-nickname', authController.isAuthenticated, async (req, res) => {
    try {
        const nickname = req.body.nickname ? req.body.nickname.trim() : '';
        if (!nickname) {
            return redirectBackWithParam(req, res, 'error', 'Please enter a nickname.');
        }

        if (nickname.toLowerCase() === req.session.nickname.toLowerCase()) {
            return redirectBackWithParam(req, res, 'error', "You cannot send a friend request to yourself.");
        }

        const targetUser = await User.findByNickname(nickname);
        if (!targetUser) {
            return redirectBackWithParam(req, res, 'error', `User with nickname "${nickname}" not found.`);
        }

        await Friendship.sendRequest(req.session.userId, targetUser.id);
        const io = req.app.get('io');
        const relation = await Friendship.getRelation(req.session.userId, targetUser.id);
        if (relation && relation.status === 'accepted') {
            await handleFriendAchievementUnlocks(req, io, req.session.userId, targetUser.id);
        }

        // Emit real-time notification
        if (io) {
            const sender = await User.findById(req.session.userId);
            io.to(`user_${targetUser.id}`).emit('friendRequestReceived', {
                nickname: sender.nickname,
                avatar: sender.avatar || '/assets/default_avatar.png'
            });
        }

        redirectBackWithParam(req, res, 'success', `Sent friend request to ${targetUser.nickname}!`);
    } catch (error) {
        console.error('Add friend by nickname error:', error);
        redirectBackWithParam(req, res, 'error', error.message || 'Failed to send friend request.');
    }
});

router.post('/profile/:nickname/add-friend', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;
        const targetUser = await User.findByNickname(nickname);
        if (!targetUser) {
            return redirectBackWithParam(req, res, 'error', 'User not found.');
        }
        await Friendship.sendRequest(req.session.userId, targetUser.id);
        const io = req.app.get('io');
        const relation = await Friendship.getRelation(req.session.userId, targetUser.id);
        if (relation && relation.status === 'accepted') {
            await handleFriendAchievementUnlocks(req, io, req.session.userId, targetUser.id);
        }

        // Emit real-time notification
        if (io) {
            const sender = await User.findById(req.session.userId);
            io.to(`user_${targetUser.id}`).emit('friendRequestReceived', {
                senderId: req.session.userId,
                nickname: req.session.nickname,
                avatar: sender ? sender.avatar : '/assets/default_avatar.png'
            });
        }

        redirectBackWithParam(req, res, 'success', `Sent friend request to ${nickname}!`);
    } catch (error) {
        console.error('Add friend error:', error);
        redirectBackWithParam(req, res, 'error', error.message);
    }
});

router.post('/profile/:nickname/remove-friend', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;
        const targetUser = await User.findByNickname(nickname);
        if (!targetUser) {
            return redirectBackWithParam(req, res, 'error', 'User not found.');
        }
        await Friendship.removeFriend(req.session.userId, targetUser.id);
        redirectBackWithParam(req, res, 'success', `Removed ${nickname} from friends.`);
    } catch (error) {
        console.error('Remove friend error:', error);
        redirectBackWithParam(req, res, 'error', error.message);
    }
});

router.post('/profile/:nickname/accept-friend', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;
        const targetUser = await User.findByNickname(nickname);
        if (!targetUser) {
            return redirectBackWithParam(req, res, 'error', 'User not found.');
        }
        await Friendship.acceptRequest(req.session.userId, targetUser.id);
        await handleFriendAchievementUnlocks(req, req.app.get('io'), req.session.userId, targetUser.id);
        redirectBackWithParam(req, res, 'success', `You are now friends with ${nickname}!`);
    } catch (error) {
        if (error.message !== "This friend request is no longer valid.") {
            console.error('Accept friend error:', error);
        }
        redirectBackWithParam(req, res, 'error', error.message);
    }
});

router.post('/profile/:nickname/decline-friend', authController.isAuthenticated, async (req, res) => {
    try {
        const { nickname } = req.params;
        const targetUser = await User.findByNickname(nickname);
        if (!targetUser) {
            return redirectBackWithParam(req, res, 'error', 'User not found.');
        }
        await Friendship.declineRequest(req.session.userId, targetUser.id);
        redirectBackWithParam(req, res, 'success', `Declined friend request from ${nickname}.`);
    } catch (error) {
        console.error('Decline friend error:', error);
        redirectBackWithParam(req, res, 'error', error.message);
    }
});

router.post('/profile/avatar', authController.isAuthenticated, (req, res) => {
    upload.single('avatar')(req, res, async function (err) {
        if (err) {
            return res.redirect('/profile?error=' + encodeURIComponent(err.message));
        }
        if (!req.file) {
            return res.redirect('/profile?error=' + encodeURIComponent('Please select a file.'));
        }
        try {
            // Find old avatar and delete it if it exists and is not the default
            const user = await User.findById(req.session.userId);
            if (user && user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                const oldAvatarPath = path.join(__dirname, '../public', user.avatar);
                if (fs.existsSync(oldAvatarPath)) {
                    try {
                        fs.unlinkSync(oldAvatarPath);
                    } catch (err) {
                        console.error(`Failed to delete old avatar: ${oldAvatarPath}`, err);
                    }
                }
            }

            const avatarPath = '/uploads/avatars/' + req.file.filename;
            await User.updateAvatar(req.session.userId, avatarPath);
            res.redirect('/profile');
        } catch (error) {
            console.error('Database error during avatar update:', error);
            res.redirect('/profile?error=' + encodeURIComponent('Database error.'));
        }
    });
});

router.post('/profile/nickname', authController.isAuthenticated, async (req, res) => {
    const { nickname } = req.body;
    const nicknameRegex = /^[a-zA-Z0-9_]+$/;

    if (!nickname || nickname.length < 4 || nickname.length > 20 || !nicknameRegex.test(nickname)) {
        return res.redirect('/profile?error=' + encodeURIComponent('Nickname must be 4-20 characters long and contain only letters, numbers, and underscores (_).'));
    }

    try {
        // Check if the new nickname is the same as the current one
        const currentUser = await User.findById(req.session.userId);
        if (currentUser.nickname === nickname) {
            return res.redirect('/profile');
        }

        // Check uniqueness
        const existing = await User.findByNickname(nickname);
        if (existing) {
            return res.redirect('/profile?error=' + encodeURIComponent('This nickname is already taken.'));
        }

        await User.updateNickname(req.session.userId, nickname);
        req.session.nickname = nickname; // Sync session so lobby and game use the new nick
        req.session.save((err) => {
            if (err) console.error('[PROFILE] Session save error:', err);
            res.redirect('/profile?success=' + encodeURIComponent('Nickname changed successfully!'));
        });
    } catch (error) {
        console.error('Database error during nickname update:', error);
        res.redirect('/profile?error=' + encodeURIComponent('Database error.'));
    }
});

router.post('/shop/buy', requireJsonAuth, async (req, res) => {
    try {
        const result = await Card.purchaseForUser(req.session.userId, req.body.cardId);
        const achievementsUnlocked = await Achievement.checkShopAchievements(req.session.userId);
        const achievements = await Achievement.getUserAchievements(req.session.userId);
        const user = await User.findById(req.session.userId);
        const ownedCards = await Card.getUserCards(req.session.userId);
        const shopCards = await Card.getUnownedShopCards(req.session.userId);

        res.json({
            success: true,
            message: 'Purchase successful',
            coins: user.coins,
            card: result.card,
            ownedCards,
            shopCards,
            achievements,
            achievementsUnlocked
        });
    } catch (error) {
        const messages = {
            NOT_ENOUGH_COINS: 'Not enough coins',
            ALREADY_OWNED: 'Card already owned',
            CARD_NOT_FOUND: 'Card not found'
        };
        const statuses = {
            NOT_ENOUGH_COINS: 400,
            ALREADY_OWNED: 409,
            CARD_NOT_FOUND: 404
        };

        if (!messages[error.code]) {
            console.error('Shop purchase error:', error);
        }

        res.status(statuses[error.code] || 500).json({
            success: false,
            message: messages[error.code] || 'Purchase failed'
        });
    }
});

router.post('/achievements/claim', requireJsonAuth, async (req, res) => {
    try {
        const achievementCode = req.body.achievementCode || req.body.code;
        if (!achievementCode || typeof achievementCode !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Achievement code is required'
            });
        }

        const claimedAchievement = await Achievement.claimAchievementReward(req.session.userId, achievementCode);
        const achievements = await Achievement.getUserAchievements(req.session.userId);

        res.json({
            success: true,
            message: 'Reward claimed',
            coins: claimedAchievement.coins,
            achievement: claimedAchievement,
            achievements
        });
    } catch (error) {
        const messages = {
            ACHIEVEMENT_NOT_FOUND: 'Achievement not found',
            ACHIEVEMENT_NOT_COMPLETED: 'Achievement is not completed yet',
            ACHIEVEMENT_ALREADY_CLAIMED: 'Achievement reward already claimed'
        };
        const statuses = {
            ACHIEVEMENT_NOT_FOUND: 404,
            ACHIEVEMENT_NOT_COMPLETED: 400,
            ACHIEVEMENT_ALREADY_CLAIMED: 409
        };

        if (!messages[error.code]) {
            console.error('Achievement claim error:', error);
        }

        res.status(statuses[error.code] || 500).json({
            success: false,
            message: messages[error.code] || 'Failed to claim reward'
        });
    }
});

router.get('/game/:id', authController.isAuthenticated, (req, res) => {
    res.render('game', { gameId: req.params.id, nickname: req.session.nickname, userId: req.session.userId });
});

module.exports = router;
