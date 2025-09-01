// db.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password123', // your MySQL password
    database: 'event'
});

connection.connect(err => {
    if (err) throw err;
    console.log("Connected to MySQL");
});

module.exports = connection;
