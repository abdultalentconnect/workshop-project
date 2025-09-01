const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password123',
    database: 'event',
})

connection.connect(err =>{
    if (err) throw err;
    console.log("Connected to MYSQL")
}); 