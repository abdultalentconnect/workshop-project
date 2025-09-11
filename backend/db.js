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

        // Create event_details table if not exists
        const createEventDetailsTable = `
        CREATE TABLE IF NOT EXISTS event_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            date VARCHAR(255),
            time VARCHAR(255),
            about TEXT,
            features TEXT,
            price DECIMAL(10, 2) DEFAULT 0.00,
            eventLink VARCHAR(255) 
        );
        `;

        connection.query(createEventDetailsTable, (err) => {
            if (err) throw err;
            console.log("Event details table checked/created.");

            // Add eventLink column if it doesn't exist
            const addEventLinkColumn = `
            ALTER TABLE event_details
            ADD COLUMN IF NOT EXISTS eventLink VARCHAR(255);
            `;

            connection.query(addEventLinkColumn, (err) => {
                if (err) throw err;
                console.log("eventLink column checked/added.");
            });
        });
    });

    module.exports = connection;
