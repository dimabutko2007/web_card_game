const User = require('../models/User');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

exports.getRegister = (req, res) => {
    res.render('register');
};

exports.postRegister = async (req, res) => {
    const { nickname, email, password } = req.body;
    
    // 1. Validation
    const nicknameRegex = /^[a-zA-Z0-9_]+$/;
    
    if (!nickname || nickname.length < 4 || nickname.length > 20 || !nicknameRegex.test(nickname)) {
        return res.render('register', { 
            error: 'Nickname must be 4-20 characters long and contain only letters, numbers, and underscores (_).' 
        });
    }

    if (!password || password.length < 8 || password.length > 50) {
        return res.render('register', { 
            error: 'Password must be 8-50 characters long.' 
        });
    }

    try {
        // 2. Uniqueness checks
        const existingNickname = await User.findByNickname(nickname);
        if (existingNickname) {
            return res.render('register', { error: 'This nickname is already taken.' });
        }

        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            return res.render('register', { error: 'This email is already registered.' });
        }

        // 3. Create user
        await User.create(nickname, email, password);
        console.log(`[AUTH] User registered: ${nickname} (${email})`);
        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        res.render('register', { error: 'An error occurred during registration. Please try again.' });
    }
};

exports.getLogin = (req, res) => {
    let success = null;
    if (req.query.status === 'reset_success') {
        success = 'Password has been reset successfully! You can now login.';
    }
    res.render('login', { success });
};

exports.postLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findByEmail(email);
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user.id;
            req.session.nickname = user.nickname;
            console.log(`[AUTH] User logged in: ${user.nickname}`);
            res.redirect('/lobby');
        } else {
            res.render('login', { error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error(error);
        res.render('login', { error: 'An error occurred' });
    }
};

exports.logout = (req, res) => {
    const nickname = req.session.nickname;
    req.session.destroy();
    console.log(`[AUTH] User logged out: ${nickname}`);
    res.redirect('/auth/login');
};

exports.isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

exports.getPasswordReminder = (req, res) => {
    let success = null;
    let error = null;

    if (req.query.status === 'sent') {
        success = 'A password reset link has been sent to your email! (Check the server console for the preview link)';
    } else if (req.query.error === 'failed') {
        error = 'Failed to send email. Try again later.';
    } else if (req.query.error === 'not_found') {
        error = 'User not found with this email.';
    }

    res.render('password-reminder', { success, error });
};

exports.postPasswordReminder = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findByEmail(email);
        if (!user) {
            return res.redirect('/auth/password-reminder?error=not_found');
        }

        // Generate token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour from now

        await User.setResetToken(email, token, expires);

        // Email emulation
        let testAccount = await nodemailer.createTestAccount();
        let transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });

        const resetUrl = `http://localhost:3000/auth/reset-password?token=${token}`;

        let info = await transporter.sendMail({
            from: '"Security" <service@sword.gov>',
            to: user.email,
            subject: "Password Reset Request",
            text: `Agent, click the link to reset your password: ${resetUrl}`,
            html: `<p>Agent, click the link to reset your password:</p><a href="${resetUrl}">${resetUrl}</a><p>This link expires in 1 hour.</p>`,
        });

        console.log("[EMAIL] Reset link sent: %s", info.messageId);
        console.log("[EMAIL] Preview URL: %s", nodemailer.getTestMessageUrl(info));

        // Use PRG pattern to prevent form resubmission and clear state on refresh
        res.redirect('/auth/password-reminder?status=sent');

    } catch (error) {
        console.error(error);
        res.redirect('/auth/password-reminder?error=failed');
    }
};

exports.getResetPassword = async (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/auth/login');

    const user = await User.findByToken(token);
    if (!user) {
        return res.render('login', { error: 'Password reset token is invalid or has expired.' });
    }

    res.render('reset-password', { token });
};

exports.postResetPassword = async (req, res) => {
    const { token, password } = req.body;
    
    if (!password || password.length < 8 || password.length > 50) {
        return res.render('reset-password', { token, error: 'Password must be 8-50 characters long.' });
    }

    try {
        const user = await User.findByToken(token);
        if (!user) {
            return res.render('login', { error: 'Password reset token is invalid or has expired.' });
        }

        await User.updatePassword(user.id, password);
        console.log(`[AUTH] Password reset for user: ${user.nickname}`);
        
        res.redirect('/auth/login?status=reset_success');
    } catch (error) {
        console.error(error);
        res.render('reset-password', { token, error: 'An error occurred. Please try again.' });
    }
};
