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
    res.render('profile', { user, error: req.query.error });
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
                        console.log(`Deleted old avatar: ${oldAvatarPath}`);
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

router.get('/game/:id', authController.isAuthenticated, (req, res) => {
    res.render('game', { gameId: req.params.id, nickname: req.session.nickname });
});

module.exports = router;
