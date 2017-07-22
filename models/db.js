// Imports
const mysql = require('mysql');
const logger = require('../logger');

// Import the environment variables defined in the ".env" file
require('dotenv').config();

// Configuration
const databaseConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};

// Create the MySQL connection pool and export it
// (we want to do a pool instead of a single connection so that we don't have
// to worry about dealing with connection timeouts)
const pool = mysql.createPool(databaseConfig); // Default is 10 connections
module.exports = pool;

pool.on('connection', (connection) => {
    logger.info('A new MySQL connection has been created.');
});
