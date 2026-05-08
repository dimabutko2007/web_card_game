const mysql = require('mysql2');
const config = require('./config');

const pool = mysql.createPool({
    host: config.DB.HOST,
    user: config.DB.USER,
    password: config.DB.PASS,
    database: config.DB.NAME,
    port: config.DB.PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();
