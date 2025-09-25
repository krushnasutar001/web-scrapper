const mysql = require('mysql2/promise');
const exportService = require('./services/exportService');
require('dotenv').config();

async function debugExportIssue() {
    let connection;
    
    try {
        // Create connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: 'Krushna_Sutar@0809',
            database: process.env.DB_NAME || 'linkedin_automation'
        });

        console.log('🔍 DEBUGGING EXPORT ISSUE');
        console.log('Connected to MySQL database\n');

        // 1. Check all tables that might contain results
        console.log('=== CHECKING ALL RESULT TABLES ===');
        
        const resultTables = [
            'scraping_results', 'job_results', 'profile_results', 
            'company_results', 'sales_navigator_results', 'results'
        ];
        
        for (const table of resultTables) {
            try {
                const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`${table}: ${count[0].count} records`);
                
                if (count[0].count > 0) {
                    const [sample] = await connection.execute(`SELECT * FROM ${table} LIMIT 1`);
                    console.log(`  Sample columns: ${Object.keys(sample[0] || {}).join(', ')}`);
                }
            } catch (error) {
                console.log(`${table}: Table doesn't exist or error - ${error.message}`);
            }
        }

        // 2. Check scraping_jobs table for jobs with progress
        console.log('\n=== CHECKING SCRAPING JOBS ===');
        const [scrapingJobs] = await connection.execute(`
            SELECT id, job_name, job_type, status, 
                   total_urls, processed_urls, successful_urls, failed_urls,
                   created_at, updated_at
            FROM scraping_jobs 
            WHERE successful_urls > 0 OR processed_urls > 0
            ORDER BY updated_at DESC
            LIMIT 5
        `);
        
        if (scrapingJobs.length > 0) {
            console.log('Jobs with processing activity:');
            scrapingJobs.forEach(job => {
                console.log(`  Job: ${job.id} - ${job.job_name}`);
                console.log(`    Type: ${job.job_type}, Status: ${job.status}`);
                console.log(`    Progress: ${job.processed_urls}/${job.total_urls} (${job.successful_urls} successful, ${job.failed_urls} failed)`);
                console.log(`    Updated: ${job.updated_at}`);
                console.log('    ---');
            });
        } else {
            console.log('No jobs found with processing activity');
        }

        // 3. Check if there are any jobs in the jobs table
        console.log('\n=== CHECKING JOBS TABLE ===');
        const [jobs] = await connection.execute(`
            SELECT id, user_id, type, query, status, total_results, processed_results, created_at
            FROM jobs 
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        if (jobs.length > 0) {
            console.log('Recent jobs:');
            jobs.forEach(job => {
                console.log(`  Job: ${job.id}`);
                console.log(`    Type: ${job.type}, Status: ${job.status}`);
                console.log(`    Results: ${job.total_results}, Processed: ${job.processed_results}`);
                console.log('    ---');
            });
        } else {
            console.log('No jobs found in jobs table');
        }

        // 4. Test export with the test job ID from test-export.js
        console.log('\n=== TESTING EXPORT WITH TEST JOB ID ===');
        const testJobId = '02f5650d-7008-44c9-9813-c66b7f8f37a9';
        const testUserId = 'af77771c-6504-470f-b05e-d68e045652a2';
        
        try {
            console.log(`Attempting to export job: ${testJobId}`);
            const csvResult = await exportService.exportJobResults(testJobId, 'csv', testUserId);
            console.log('✅ CSV Export successful:');
            console.log(`  Filename: ${csvResult.filename}`);
            console.log(`  Size: ${csvResult.buffer.length} bytes`);
            console.log(`  Content preview: ${csvResult.buffer.toString().substring(0, 200)}...`);
        } catch (error) {
            console.log('❌ CSV Export failed:', error.message);
        }

        // 5. Check what the frontend might be seeing
        console.log('\n=== CHECKING FRONTEND DATA SOURCE ===');
        
        // Check if there's a specific API endpoint or service that provides job stats
        const [dashboardStats] = await connection.execute(`
            SELECT 
                (SELECT COUNT(*) FROM scraping_jobs) as total_jobs,
                (SELECT COUNT(*) FROM scraping_jobs WHERE status = 'completed') as completed_jobs,
                (SELECT SUM(successful_urls) FROM scraping_jobs) as total_successful_results
        `);
        
        console.log('Dashboard stats that frontend might see:');
        console.log(`  Total jobs: ${dashboardStats[0].total_jobs}`);
        console.log(`  Completed jobs: ${dashboardStats[0].completed_jobs}`);
        console.log(`  Total successful results: ${dashboardStats[0].total_successful_results || 0}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\nConnection closed');
        }
    }
}

debugExportIssue();