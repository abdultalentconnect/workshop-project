    // db.js
    const mysql = require('mysql2');
    require('dotenv').config();

    const connection = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        ssl: { rejectUnauthorized: false }
    });

    connection.connect(err => {
        if (err) throw err;
        console.log("Connected to MySQL");
    });

    module.exports = connection;
