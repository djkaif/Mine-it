const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = "1234nah";

// --- DATABASE SETUP ---
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to SQLite database.');
});

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        credits INTEGER,
        joined TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        type TEXT,
        amount INTEGER,
        code TEXT,
        status TEXT,
        date TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value INTEGER
    )`);
    
    // Default Config
    db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('mineReward', 5)`);
    db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('startCredits', 100)`);
});

// Helper for Config
const getConfig = (key) => {
    return new Promise((resolve) => {
        db.get(`SELECT value FROM config WHERE key = ?`, [key], (err, row) => {
            resolve(row ? row.value : 0);
        });
    });
};

// --- AUTH API ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    const startCredits = await getConfig('startCredits');
    const hashedPassword = await bcrypt.hash(password, 10);
    const date = new Date().toISOString().split('T')[0];

    db.run(`INSERT INTO users (username, password, credits, joined) VALUES (?, ?, ?, ?)`, 
        [username, hashedPassword, startCredits, date], (err) => {
        if (err) return res.status(400).json({ error: "Username taken" });
        res.json({ success: true });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (user && await bcrypt.compare(password, user.password)) {
            res.json({ success: true, user: { username: user.username, credits: user.credits } });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    });
});

// --- GAME LOGIC ---
app.post('/api/user/update-balance', (req, res) => {
    const { username, amount } = req.body;
    db.run(`UPDATE users SET credits = credits + ? WHERE username = ?`, [amount, username], function(err) {
        if (err) return res.status(500).send();
        db.get(`SELECT credits FROM users WHERE username = ?`, [username], (err, row) => {
            res.json({ success: true, balance: row.credits });
        });
    });
});

// --- WITHDRAWAL ---
app.post('/api/withdraw', (req, res) => {
    const { username, amount, type } = req.body;
    db.get(`SELECT credits FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user || user.credits < amount) return res.status(400).json({ error: "Insufficient credits" });

        const claimCode = "GP-" + Math.random().toString(36).substring(2, 9).toUpperCase();
        db.serialize(() => {
            db.run(`UPDATE users SET credits = credits - ? WHERE username = ?`, [amount, username]);
            db.run(`INSERT INTO withdrawals (username, type, amount, code, status, date) VALUES (?, ?, ?, ?, 'PENDING', ?)`,
                [username, type, amount, claimCode, new Date().toISOString()]);
            res.json({ success: true, code: claimCode });
        });
    });
});

// --- ADMIN API ---
app.post('/api/admin/auth', (req, res) => {
    res.json({ success: req.body.password === ADMIN_PASSWORD });
});

app.get('/api/admin/stats', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const mineReward = await getConfig('mineReward');
    const startCredits = await getConfig('startCredits');

    db.get(`SELECT COUNT(*) as total, SUM(CASE WHEN joined = ? THEN 1 ELSE 0 END) as daily FROM users`, [today], (err, row) => {
        db.get(`SELECT COUNT(*) as pending FROM withdrawals WHERE status = 'PENDING'`, (err, wRow) => {
            res.json({
                totalUsers: row.total || 0,
                dailyUsers: row.daily || 0,
                totalWithdrawals: wRow.pending || 0,
                config: { mineReward, startCredits }
            });
        });
    });
});

app.get('/api/admin/withdrawals', (req, res) => {
    db.all(`SELECT * FROM withdrawals WHERE status = 'PENDING'`, (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/admin/update-credits', (req, res) => {
    const { username, amount, action, adminPass } = req.body;
    if(adminPass !== ADMIN_PASSWORD) return res.status(403).send();
    const val = action === 'add' ? parseInt(amount) : -parseInt(amount);
    db.run(`UPDATE users SET credits = credits + ? WHERE username = ?`, [val, username], (err) => {
        res.json({ success: !err });
    });
});

app.post('/api/admin/config', (req, res) => {
    const { startCredits, mineReward, adminPass } = req.body;
    if(adminPass !== ADMIN_PASSWORD) return res.status(403).send();
    db.serialize(() => {
        db.run(`UPDATE config SET value = ? WHERE key = 'startCredits'`, [startCredits]);
        db.run(`UPDATE config SET value = ? WHERE key = 'mineReward'`, [mineReward]);
        res.json({ success: true });
    });
});

app.post('/api/admin/approve', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE withdrawals SET status = 'COMPLETED' WHERE id = ?`, [id], (err) => {
        res.json({ success: !err });
    });
});

app.listen(3000, () => console.log('Server running with SQLite on port 3000'));
