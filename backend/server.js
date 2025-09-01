// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const connection = require('./db'); // import db.js

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Test route
app.get('/', (req, res) => {
    res.send('Backend server is running!');
});

// Registration route
app.post('/register', (req, res) => {
    const { fullName, email, phone, org, role } = req.body;

    if (!fullName || !email || !phone) {
        return res.status(400).json({ message: "Please fill all required fields" });
    }

    const sql = "INSERT INTO registration (fullName, email, phone, org, role) VALUES (?, ?, ?, ?, ?)";
    const values = [fullName, email, phone, org, role];

    connection.query(sql, values, (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Database error" });
        }
        res.status(201).json({ message: "Registration successful", id: result.insertId });
    });
});
// Get all registrations
app.get('/registrations', (req, res) => {
    const sql = "SELECT * FROM registration ORDER BY id DESC";
    connection.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Database error" });
        }
        res.json(results);
    });
});


// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
