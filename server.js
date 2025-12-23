const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

app.use(express.json());
// This tells the server to show files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE SETUP ---
const db = new sqlite3.Database('./game.db');

// Create tables for Users and Withdrawals if they don't exist
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, credits INTEGER DEFAULT 100)");
    db.run("CREATE TABLE IF NOT EXISTS withdrawals (id INTEGER PRIMARY KEY, userId INTEGER, type TEXT, amount INTEGER, details TEXT, status TEXT DEFAULT 'PENDING')");
});

// --- GAME LOGIC ---
app.post('/api/mines/start', (req, res) => {
    // Basic logic for testing: random bomb locations
    const bombLocations = [];
    while(bombLocations.length < 5) {
        let r = Math.floor(Math.random() * 25);
        if(!bombLocations.includes(r)) bombLocations.push(r);
    }
    // In production, we'd save these bombs to the DB to prevent cheating
    res.json({ message: "Game Started", totalMines: 5 });
});

// --- ADMIN LOGIC ---

// 1. Get all users for the Admin Panel
app.get('/api/admin/users', (req, res) => {
    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Get all pending withdrawals for the Admin Panel
app.get('/api/admin/withdrawals', (req, res) => {
    db.all("SELECT * FROM withdrawals WHERE status = 'PENDING'", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. Admin Approval Action
app.post('/api/admin/approve', (req, res) => {
    const { id } = req.body;
    db.run("UPDATE withdrawals SET status = 'COMPLETED' WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running! View it at http://localhost:${PORT}`);
});
