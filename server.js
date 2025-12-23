const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = './database.json';

// --- HELPER FUNCTIONS TO READ/WRITE JSON ---
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        // Default data if file doesn't exist
        return { users: [], withdrawals: [] };
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
};

const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// Add a withdrawal request
app.post('/api/withdraw', (req, res) => {
    const db = readDB();
    const newRequest = {
        id: req.body.id,
        type: req.body.type,
        amount: req.body.amount,
        details: req.body.details,
        status: 'PENDING'
    };
    db.withdrawals.push(newRequest);
    writeDB(db);
    res.json({ success: true });
});


// --- GAME LOGIC ---
app.post('/api/mines/start', (req, res) => {
    const bombLocations = [];
    while(bombLocations.length < 5) {
        let r = Math.floor(Math.random() * 25);
        if(!bombLocations.includes(r)) bombLocations.push(r);
    }
    res.json({ message: "Game Started (JSON Mode)", totalMines: 5 });
});

// --- ADMIN LOGIC ---

// 1. Get all users
app.get('/api/admin/users', (req, res) => {
    const db = readDB();
    res.json(db.users);
});

// 2. Get all pending withdrawals
app.get('/api/admin/withdrawals', (req, res) => {
    const db = readDB();
    const pending = db.withdrawals.filter(w => w.status === 'PENDING');
    res.json(pending);
});

// 3. Admin Approval Action
app.post('/api/admin/approve', (req, res) => {
    const { id } = req.body;
    const db = readDB();
    const index = db.withdrawals.findIndex(w => w.id === id);
    
    if (index !== -1) {
        db.withdrawals[index].status = 'COMPLETED';
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Request not found" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running with JSON DB! http://localhost:${PORT}`);
});
