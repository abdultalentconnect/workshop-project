const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MySQL connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',           
    password: 'password123',
    database: 'event'
});

connection.connect(err => {
    if (err) {
        console.log("Database connection failed", err);
        return;
    }
    console.log("Connected to MySQL database.");
});

// GET route to test server
app.get('/', (req, res) => {
    res.send('Hello from backend!');
});

// POST route to handle registration
app.post('/register', (req, res) => {
    const { fullName, email, phone, org, role } = req.body;

    if (!fullName || !email || !phone) {
        return res.status(400).json({ message: "Please fill all required fields" });
    }

    const sql = "INSERT INTO registration (fullName, email, phone, org, role) VALUES (?, ?, ?, ?, ?)";
    const values = [fullName, email, phone, org, role];

    connection.query(sql, values, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ message: "Database error" });
        }
        res.status(201).json({ message: "Registration successful", id: result.insertId });
    });
});

// Start server
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
