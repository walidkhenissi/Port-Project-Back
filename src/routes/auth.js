// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {User} = require('../models');
const Response = require("../utils/response");

router.post('/login', async (req, res) => {
    const {username, password} = req.body;

    try {
        const user = await User.findOne({where: {username}});

        if (!user) {
            return res.status(401).json({message: 'Invalid credentials'});
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({message: 'Invalid credentials'});
        }
        req.session.username = username;
        console.log("Session créée:",username);

        const token = jwt.sign({userId: user.id}, '94896d7d1c3b5da582e91cf72ba8d230', {expiresIn: '1h'});
        delete user.password;
        res.status(200).json(new Response({token: token, user: user}));
        // res.status(200).json({token});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Internal Server Error'});
    }
});

module.exports = router;
