const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/User');
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

router.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/lobby');
    } else {
        res.redirect('/auth/login');
    }
});

router.get('/lobby', authController.isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const leaders = await User.getTopPlayers(25);
    res.render('lobby', { 
        nickname: req.session.nickname, 
        userId: req.session.userId,
        elo: user.elo,
        avatar: user.avatar,
        leaders: leaders
    });
});

router.get('/profile', authController.isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('profile', { user, error: req.query.error, success: req.query.success });
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

router.get('/game/:id', authController.isAuthenticated, (req, res) => {
    res.render('game', { gameId: req.params.id, nickname: req.session.nickname, userId: req.session.userId });
});

module.exports = router;
