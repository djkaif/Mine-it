const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = express();

const PORT = process.env.PORT || 3000;

// Your MongoDB Connection String
// This tells the code: "Look for a secret called MONGO_URI. If you can't find it, use a local test link."
const MONGO_URI = process.env.MONGO_URI;


app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = "1234nah";

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- MONGODB SCHEMAS ---
const User = mongoose.model('User', {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    credits: { type: Number, default: 100 },
    joined: String
});

const Withdrawal = mongoose.model('Withdrawal', {
    username: String,
    type: String,
    amount: Number,
    code: String,
    status: { type: String, default: 'PENDING' },
    date: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', {
    key: String,
    value: Number
});

// Setup Initial Platform Config
async function setupConfig() {
    const reward = await Config.findOne({ key: 'mineReward' });
    if (!reward) await Config.create({ key: 'mineReward', value: 5 });
    
    const startCreds = await Config.findOne({ key: 'startCredits' });
    if (!startCreds) await Config.create({ key: 'startCredits', value: 100 });
}
setupConfig();

// --- AUTH API ---
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const startCreditsEntry = await Config.findOne({ key: 'startCredits' });
        const startCredits = startCreditsEntry ? startCreditsEntry.value : 100;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            password: hashedPassword,
            credits: startCredits,
            joined: new Date().toISOString().split('T')[0]
        });
        await newUser.save();
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: "Username already exists" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ success: true, user: { username: user.username, credits: user.credits } });
    } else {
        res.status(401).json({ error: "Invalid username or password" });
    }
});

// --- GAME & BALANCE API ---
app.post('/api/user/update-balance', async (req, res) => {
    const { username, amount } = req.body;
    try {
        const user = await User.findOneAndUpdate(
            { username }, 
            { $inc: { credits: amount } }, 
            { new: true }
        );
        if (user) {
            res.json({ success: true, balance: user.credits });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (e) {
        res.status(500).json({ error: "Balance update failed" });
    }
});

// --- WITHDRAWAL API ---
app.post('/api/withdraw', async (req, res) => {
    const { username, amount, type } = req.body;
    const user = await User.findOne({ username });

    if (!user || user.credits < amount) {
        return res.status(400).json({ error: "Insufficient credits" });
    }

    const claimCode = "GP-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    
    // Deduct credits and create record
    await User.updateOne({ username }, { $inc: { credits: -amount } });
    const newWithdrawal = new Withdrawal({
        username,
        type,
        amount,
        code: claimCode,
        status: 'PENDING'
    });
    await newWithdrawal.save();

    res.json({ success: true, code: claimCode });
});

// --- ADMIN API ---
app.post('/api/admin/auth', (req, res) => {
    res.json({ success: req.body.password === ADMIN_PASSWORD });
});

app.get('/api/admin/stats', async (req, res) => {
    const totalUsers = await User.countDocuments();
    const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'PENDING' });
    const mineReward = await Config.findOne({ key: 'mineReward' });
    const startCredits = await Config.findOne({ key: 'startCredits' });

    res.json({
        totalUsers,
        totalWithdrawals: pendingWithdrawals,
        config: {
            mineReward: mineReward ? mineReward.value : 5,
            startCredits: startCredits ? startCredits.value : 100
        }
    });
});

app.get('/api/admin/withdrawals', async (req, res) => {
    const pending = await Withdrawal.find({ status: 'PENDING' });
    res.json(pending);
});

app.post('/api/admin/update-credits', async (req, res) => {
    const { username, amount, action, adminPass } = req.body;
    if(adminPass !== ADMIN_PASSWORD) return res.status(403).send();
    
    const change = action === 'add' ? parseInt(amount) : -parseInt(amount);
    const user = await User.findOneAndUpdate({ username }, { $inc: { credits: change } });
    
    res.json({ success: !!user });
});

app.post('/api/admin/config', async (req, res) => {
    const { startCredits, mineReward, adminPass } = req.body;
    if(adminPass !== ADMIN_PASSWORD) return res.status(403).send();
    
    await Config.updateOne({ key: 'startCredits' }, { value: parseInt(startCredits) });
    await Config.updateOne({ key: 'mineReward' }, { value: parseInt(mineReward) });
    
    res.json({ success: true });
});

app.post('/api/admin/approve', async (req, res) => {
    const { id } = req.body;
    // For MongoDB, we use _id
    const updated = await Withdrawal.findByIdAndUpdate(id, { status: 'COMPLETED' });
    res.json({ success: !!updated });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
