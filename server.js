const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = './database.json';
const ADMIN_PASSWORD = "1234"; // Master Admin Password

// --- DB HELPERS ---
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        return { 
            users: [], 
            withdrawals: [], 
            config: { mineReward: 5, startCredits: 100 } 
        };
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
};
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- AUTH API ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    if (db.users.find(u => u.username === username)) return res.status(400).json({ error: "Username taken" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { 
        username, 
        password: hashedPassword, 
        credits: db.config.startCredits, 
        joined: new Date().toISOString().split('T')[0] 
    };
    db.users.push(newUser);
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ success: true, user: { username: user.username, credits: user.credits } });
    } else {
        res.status(401).json({ error: "Invalid credentials" });
    }
});

// Update Credits (Used by Mines game to save winnings)
app.post('/api/user/update-balance', (req, res) => {
    const { username, amount } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username);
    if (user) {
        user.credits += amount;
        writeDB(db);
        res.json({ success: true, balance: user.credits });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// --- WITHDRAWAL LOGIC ---
app.post('/api/withdraw', (req, res) => {
    const { username, amount, type } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username);
    if (!user || user.credits < amount) return res.status(400).json({ error: "Insufficient credits" });

    const claimCode = "GP-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    user.credits -= amount;
    db.withdrawals.push({
        id: Date.now(),
        username,
        type,
        amount,
        code: claimCode,
        status: 'PENDING',
        date: new Date().toISOString()
    });
    writeDB(db);
    res.json({ success: true, code: claimCode });
});

// --- ADMIN API ---
app.post('/api/admin/auth', (req, res) => {
    res.json({ success: req.body.password === ADMIN_PASSWORD });
});

app.get('/api/admin/stats', (req, res) => {
    const db = readDB();
    const today = new Date().toISOString().split('T')[0];
    res.json({
        totalUsers: db.users.length,
        dailyUsers: db.users.filter(u => u.joined === today).length,
        totalWithdrawals: db.withdrawals.filter(w => w.status === 'PENDING').length,
        config: db.config
    });
});

app.get('/api/admin/withdrawals', (req, res) => {
    const db = readDB();
    res.json(db.withdrawals.filter(w => w.status === 'PENDING'));
});

app.post('/api/admin/update-credits', (req, res) => {
    const { username, amount, action, adminPass } = req.body;
    if(adminPass !== ADMIN_PASSWORD) return res.status(403).send();
    const db = readDB();
    const user = db.users.find(u => u.username === username);
    if(user) {
        user.credits = action === 'add' ? user.credits + parseInt(amount) : user.credits - parseInt(amount);
        writeDB(db);
        res.json({ success: true });
    } else { res.status(404).send(); }
});

app.post('/api/admin/config', (req, res) => {
    const { startCredits, mineReward, adminPass } = req.body;
    if(adminPass !== ADMIN_PASSWORD) return res.status(403).send();
    const db = readDB();
    db.config.startCredits = parseInt(startCredits);
    db.config.mineReward = parseInt(mineReward);
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/admin/approve', (req, res) => {
    const { id } = req.body;
    const db = readDB();
    const reqIndex = db.withdrawals.findIndex(w => w.id === id);
    if(reqIndex !== -1) {
        db.withdrawals[reqIndex].status = 'COMPLETED';
        writeDB(db);
        res.json({ success: true });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));
