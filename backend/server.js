const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const connection = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend"))); // frontend folder

// ----------------- ADMIN LOGIN -----------------
app.post('/admin/login', (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM admin WHERE email = ? AND password = ?";
    connection.query(sql, [email, password], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (results.length > 0) res.json({ success: true, message: "Login successful" });
        else res.status(401).json({ success: false, message: "Invalid credentials" });
    });
});

// ----------------- GET LATEST EVENT -----------------
app.get('/event', (req, res) => {
    const sql = "SELECT * FROM event_details ORDER BY id DESC LIMIT 1";
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });

        if (results.length > 0) {
            const event = results[0];

            // Convert features string to array
            if (typeof event.features === 'string' && event.features.length > 0) {
                event.features = event.features.split(',').map(f => f.trim());
            } else {
                event.features = [];
            }

            res.json(event);
        } else {
            res.json({
                title: "",
                date: "",
                time: "",
                about: "",
                features: []
            });
        }
    });
});

// ----------------- UPDATE EVENT -----------------
app.put('/event', (req, res) => {
    const { title, date, time, about, features } = req.body;
    const featuresStr = Array.isArray(features) ? features.join(',') : features || '';
    const sql = "UPDATE event_details SET title=?, date=?, time=?, about=?, features=? WHERE id=1";
    connection.query(sql, [title, date, time, about, featuresStr], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        res.json({ success: true, message: "Event updated successfully" });
    });
});

// ----------------- GET REGISTRATIONS -----------------
app.get('/registrations', (req, res) => {
    const sql = "SELECT * FROM registration ORDER BY id DESC";
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(results);
    });
});

// ----------------- REGISTER PARTICIPANT -----------------
app.post('/register', (req, res) => {
    const { fullName, email, phone, org, role } = req.body;
    const sql = "INSERT INTO registration (fullName, email, phone, org, role) VALUES (?, ?, ?, ?, ?)";
    connection.query(sql, [fullName, email, phone, org, role], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        res.json({ success: true, id: results.insertId });
    });
});

// ----------------- START SERVER -----------------
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
