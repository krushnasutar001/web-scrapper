const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkCurrentJobs() {
    let connection;
    
    try {
        // Create connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: 'Krushna_Sutar@0809',
            database: process.env.DB_NAME || 'linkedin_automation'
        });

        console.log('Connected to MySQL database');

        // Check jobs with results
        console.log('\n=== JOBS WITH RESULTS ===');
        const [jobs] = await connection.execute(`
            SELECT j.id, j.type, j.query, j.status, j.total_results, j.processed_results, COUNT(jr.id) as result_count
            FROM jobs j
            LEFT JOIN job_results jr ON j.id = jr.job_id
            GROUP BY j.id, j.type, j.query, j.status, j.total_results, j.processed_results
            ORDER BY result_count DESC
        `);
        
        jobs.forEach(job => {
            console.log(`Job ID: ${job.id}`);
            console.log(`Type: ${job.type}`);
            console.log(`Query: ${job.query}`);
            console.log(`Status: ${job.status}`);
            console.log(`Total Results: ${job.total_results}`);
            console.log(`Processed Results: ${job.processed_results}`);
            console.log(`Actual DB Results: ${job.result_count}`);
            console.log('---');
        });

        // Find the job with 6 results
        const jobWith6Results = jobs.find(job => job.result_count == 6);
        if (jobWith6Results) {
            console.log(`\n=== JOB WITH 6 RESULTS: ${jobWith6Results.id} ===`);
            
            const [results] = await connection.execute(`
                SELECT id, linkedin_url, scraped_data, created_at
                FROM job_results 
                WHERE job_id = ?
                ORDER BY created_at DESC
            `, [jobWith6Results.id]);

            console.log(`Found ${results.length} results for job ${jobWith6Results.id}:`);
            results.forEach((result, index) => {
                console.log(`\nResult ${index + 1}:`);
                console.log(`  ID: ${result.id}`);
                console.log(`  LinkedIn URL: ${result.linkedin_url}`);
                console.log(`  Has Data: ${result.scraped_data ? 'Yes' : 'No'}`);
                console.log(`  Data Length: ${result.scraped_data ? result.scraped_data.length : 0} chars`);
                if (result.scraped_data) {
                    try {
                        const data = JSON.parse(result.scraped_data);
                        console.log(`  Name: ${data.name || 'N/A'}`);
                        console.log(`  Title: ${data.title || 'N/A'}`);
                        console.log(`  Company: ${data.company || 'N/A'}`);
                    } catch (e) {
                        console.log(`  Raw Data Preview: ${result.scraped_data.substring(0, 100)}...`);
                    }
                }
                console.log(`  Created: ${result.created_at}`);
            });
        } else {
            console.log('\nNo job found with exactly 6 results');
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\nConnection closed');
        }
    }
}

checkCurrentJobs();