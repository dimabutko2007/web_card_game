const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/User');

router.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/lobby');
    } else {
        res.redirect('/auth/login');
    }
});

router.get('/lobby', authController.isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('lobby', { 
        nickname: req.session.nickname, 
        userId: req.session.userId,
        elo: user.elo 
    });
});

router.get('/profile', authController.isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('profile', { user });
});

router.get('/game/:id', authController.isAuthenticated, (req, res) => {
    res.render('game', { gameId: req.params.id, nickname: req.session.nickname });
});

module.exports = router;
