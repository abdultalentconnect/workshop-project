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
    
    let isConnected = false;

    connection.connect(err => {
        if (err) {
            console.error("MySQL connection failed:", err && err.message ? err.message : err);
            isConnected = false;
            return; // Do not throw; allow server to start without DB
        }
        isConnected = true;
        console.log("Connected to MySQL");

        // Create event_details table if not exists (only when connected)
        const createEventDetailsTable = `
        CREATE TABLE IF NOT EXISTS event_details (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            date VARCHAR(255),
            time VARCHAR(255),
            about TEXT,
            features TEXT,
            price DECIMAL(10, 2) DEFAULT 0.00,
            eventLink VARCHAR(255),
            targetAudience TEXT,
            brandLogo VARCHAR(255),
            brandName VARCHAR(255)
        );
        `;

        connection.query(createEventDetailsTable, (err) => {
            if (err) {
                console.error("Failed to ensure event_details table:", err && err.message ? err.message : err);
                return;
            }
            console.log("Event details table checked/created.");

            // Create admin table if not exists
            const createAdminTable = `
            CREATE TABLE IF NOT EXISTS admin (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
            `;

            connection.query(createAdminTable, (adminErr) => {
                if (adminErr) {
                    console.error("Failed to ensure admin table:", adminErr && adminErr.message ? adminErr.message : adminErr);
                } else {
                    console.log("Admin table checked/created.");

                    // Optionally seed default admin if env provided
                    const adminEmail = process.env.ADMIN_EMAIL;
                    const adminPassword = process.env.ADMIN_PASSWORD;
                    if (adminEmail && adminPassword) {
                        const seedSql = "INSERT IGNORE INTO admin (email, password) VALUES (?, ?)";
                        connection.query(seedSql, [adminEmail, adminPassword], (seedErr) => {
                            if (seedErr) {
                                console.error("Failed to seed default admin:", seedErr && seedErr.message ? seedErr.message : seedErr);
                            } else {
                                console.log("Default admin ensured (using ADMIN_EMAIL).");
                            }
                        });
                    } else {
                        console.warn("ADMIN_EMAIL/ADMIN_PASSWORD not set. Skipping default admin seed.");
                    }
                }
            });

            // Add eventLink column if it doesn't exist
            const addEventLinkColumn = `
            ALTER TABLE event_details
            ADD COLUMN IF NOT EXISTS eventLink VARCHAR(255);
            `;

            connection.query(addEventLinkColumn, (err) => {
                if (err) {
                    console.error("Failed to ensure eventLink column:", err && err.message ? err.message : err);
                    return;
                }
                console.log("eventLink column checked/added.");
                
                // Add targetAudience column if it doesn't exist
                const addTargetAudienceColumn = `
                ALTER TABLE event_details
                ADD COLUMN IF NOT EXISTS targetAudience TEXT;
                `;

                connection.query(addTargetAudienceColumn, (err) => {
                    if (err) {
                        console.error("Failed to ensure targetAudience column:", err && err.message ? err.message : err);
                        return;
                    }
                    console.log("targetAudience column checked/added.");
                    
                    // Add brandLogo column if it doesn't exist
                    const addBrandLogoColumn = `
                    ALTER TABLE event_details
                    ADD COLUMN IF NOT EXISTS brandLogo VARCHAR(255);
                    `;

                    connection.query(addBrandLogoColumn, (err) => {
                        if (err) {
                            console.error("Failed to ensure brandLogo column:", err && err.message ? err.message : err);
                            return;
                        }
                        console.log("brandLogo column checked/added.");
                        
                        // Add brandName column if it doesn't exist
                        const addBrandNameColumn = `
                        ALTER TABLE event_details
                        ADD COLUMN IF NOT EXISTS brandName VARCHAR(255);
                        `;

                        connection.query(addBrandNameColumn, (err) => {
                            if (err) {
                                console.error("Failed to ensure brandName column:", err && err.message ? err.message : err);
                                return;
                            }
                            console.log("brandName column checked/added.");
                        });
                    });
                });
            });
        });
    });

    // Attach helpers while preserving existing export shape
    connection.getDbStatus = function() {
        return { connected: isConnected };
    };

    connection.tryPing = function(callback) {
        if (!isConnected) return callback(new Error('Not connected'));
        connection.ping(callback);
    };

    module.exports = connection;
