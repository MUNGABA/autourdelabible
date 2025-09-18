require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "secret123";

// Middleware pour vérifier le token
function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'Token manquant' });
    try {
        const decoded = jwt.verify(token.split(" ")[1], JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: 'Token invalide' });
    }
}

// Middleware rôle
function roleMiddleware(role) {
    return (req, res, next) => {
        if (req.user.role !== role && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Accès refusé' });
        }
        next();
    }
}

// ------------------- AUTH -------------------
app.post('/auth/register', async (req, res) => {
    const { nom, postnom, prenom, email, password, telephone, adresse } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const user = await prisma.user.create({
            data: { nom, postnom, prenom, email, passwordHash: hashedPassword, telephone, adresse }
        });
        res.json({ message: 'Inscription réussie', user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: 'Utilisateur non trouvé' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ message: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Connexion réussie', token, role: user.role });
});

// ------------------- CANDIDATURE -------------------
app.post('/candidature', authMiddleware, roleMiddleware('candidat'), async (req, res) => {
    try {
        const existing = await prisma.candidature.findUnique({ where: { userId: req.user.id } });
        if (existing) return res.status(400).json({ message: 'Déjà postulé' });

        const candidature = await prisma.candidature.create({
            data: { userId: req.user.id, paiementOnline: req.body.paiementOnline, paiementCash: req.body.paiementCash }
        });
        res.json({ message: 'Candidature envoyée', candidature });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- MESSAGES -------------------
app.post('/messages', authMiddleware, async (req, res) => {
    const { receiverId, message } = req.body;
    try {
        const msg = await prisma.message.create({
            data: { senderId: req.user.id, receiverId, message }
        });
        res.json({ message: 'Message envoyé', msg });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/messages/:withUserId', authMiddleware, async (req, res) => {
    const otherId = parseInt(req.params.withUserId);
    try {
        const msgs = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: req.user.id, receiverId: otherId },
                    { senderId: otherId, receiverId: req.user.id }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json(msgs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- USERS / ADMIN -------------------
app.get('/users', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users);
});

app.delete('/users/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
    const id = parseInt(req.params.id);
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Utilisateur supprimé' });
});

// ------------------- SERVER -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
