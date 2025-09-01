const express = require('express');
const router = express.Router();

// getting connection from server.js
module.exports = (connection) => {
    router.post('/', (req, res) => {
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

    return router;
};