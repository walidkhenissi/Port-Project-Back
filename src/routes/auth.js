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

        const token = jwt.sign({userId: user.id}, '94896d7d1c3b5da582e91cf72ba8d230', {expiresIn: '1h'});

        req.session.save(err => {   // ✅ Sauvegarde explicitement la session
            if (err) {
                console.error('Erreur lors de l’enregistrement de la session :', err);
                return res.status(500).json({message: 'Erreur serveur'});
            }
            console.log("Session après login:", req.session);
            console.log("Session name après login:", req.session.username);
        });
        delete user.password;
        res.status(200).json(new Response({message: "Connexion réussie", token: token, user: user}));

        // res.status(200).json({token});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Internal Server Error'});
    }
});

module.exports = router;
