const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static('public'));

const DB_FILE = './database.json';

// Helper to read/write JSON database
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) return { users: [] };
    return JSON.parse(fs.readFileSync(DB_FILE));
};

const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Game Route: Start
app.post('/api/mines/start', (req, res) => {
    const bombLocations = [];
    while(bombLocations.length < 5) {
        let r = Math.floor(Math.random() * 25);
        if(!bombLocations.includes(r)) bombLocations.push(r);
    }
    res.json({ message: "Game Started", totalMines: 5 });
});

// Admin Route: Add Credits
app.post('/api/admin/add-credits', (req, res) => {
    const { username, amount } = req.body;
    let data = readDB();
    let user = data.users.find(u => u.username === username);
    
    if (user) {
        user.credits += amount;
    } else {
        data.users.push({ username, credits: 100 + amount });
    }
    
    writeDB(data);
    res.json({ success: true, message: "Credits updated" });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));

