const mysql = require('mysql2/promise');
require('dotenv').config();

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'linkedin_automation_saas'
};

async function checkScrapingJobsTable() {
    try {
        const connection = await mysql.createConnection(config);
        
        // Check if scraping_jobs table exists
        const [rows] = await connection.execute('SHOW TABLES LIKE "scraping_jobs"');
        console.log('scraping_jobs table exists:', rows.length > 0);
        
        if (rows.length === 0) {
            console.log('❌ Table does not exist - need to create it first');
        } else {
            console.log('✅ Table exists. Getting schema...');
            const [schema] = await connection.execute('SHOW CREATE TABLE scraping_jobs');
            console.log('Schema:', schema[0]['Create Table']);
        }
        
        await connection.end();
    } catch (err) {
        console.log('❌ Error:', err.message);
    }
}

checkScrapingJobsTable();