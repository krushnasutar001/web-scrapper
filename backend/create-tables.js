const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'linkedin_automation_saas'
};

async function createTables() {
    try {
        const connection = await mysql.createConnection(config);
        
        console.log('🔗 Connected to database');
        
        // Step 1: Create scraping_jobs table first (base table)
        console.log('📋 Creating scraping_jobs table...');
        const scrapingJobsSQL = fs.readFileSync('create-scraping-jobs-table.sql', 'utf8');
        await connection.execute(scrapingJobsSQL);
        console.log('✅ scraping_jobs table created successfully!');
        
        // Step 2: Create profile_results table (depends on scraping_jobs)
        console.log('📋 Creating profile_results table...');
        const profileResultsSQL = fs.readFileSync('create-profile-results-table.sql', 'utf8');
        await connection.execute(profileResultsSQL);
        console.log('✅ profile_results table created successfully!');
        
        // Verify tables were created
        console.log('🔍 Verifying tables...');
        const [tables] = await connection.execute('SHOW TABLES');
        const tableNames = tables.map(row => Object.values(row)[0]);
        
        if (tableNames.includes('scraping_jobs')) {
            console.log('✅ scraping_jobs table exists');
        } else {
            console.log('❌ scraping_jobs table missing');
        }
        
        if (tableNames.includes('profile_results')) {
            console.log('✅ profile_results table exists');
        } else {
            console.log('❌ profile_results table missing');
        }
        
        await connection.end();
        console.log('🎉 All tables created successfully!');
        
    } catch (err) {
        console.log('❌ Error:', err.message);
        process.exit(1);
    }
}

createTables();