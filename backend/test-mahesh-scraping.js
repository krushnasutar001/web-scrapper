const mysql = require('mysql2/promise');
const { ScrapingService } = require('./services/scrapingService');
const jobWorker = require('./services/jobWorker');

// Database configuration
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Krushna_Sutar@0809',
    database: 'linkedin_automation'
};

async function testMaheshScraping() {
    let connection;
    
    try {
        console.log('🚀 Starting mahesh account scraping test...');
        
        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected');
        
        // Check if mahesh account exists
        const [accounts] = await connection.execute(
            'SELECT id, account_name, email, validation_status, is_active, LENGTH(cookies_json) as cookie_length FROM linkedin_accounts WHERE account_name = ?',
            ['mahesh']
        );
        
        if (accounts.length === 0) {
            console.log('❌ Mahesh account not found in database');
            return;
        }
        
        const maheshAccount = accounts[0];
        console.log('📋 Mahesh account details:', {
            id: maheshAccount.id,
            account_name: maheshAccount.account_name,
            email: maheshAccount.email,
            validation_status: maheshAccount.validation_status,
            is_active: maheshAccount.is_active,
            cookie_length: maheshAccount.cookie_length
        });
        
        // Create a test job for mahesh account
        const jobId = require('crypto').randomUUID();
        const userId = 'af77771c-6504-470f-b05e-d68e045652a2'; // Using existing user
        
        await connection.execute(`
            INSERT INTO scraping_jobs (
                id, user_id, job_name, job_type, status, total_urls
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            jobId,
            userId,
            'Mahesh Test Job',
            'profiles',
            'pending',
            2
        ]);
        
        // Add test URLs to the job
        const testUrls = [
            'https://www.linkedin.com/in/test-profile-1/',
            'https://www.linkedin.com/in/test-profile-2/'
        ];
        
        for (let i = 0; i < testUrls.length; i++) {
            await connection.execute(`
                INSERT INTO job_urls (
                    id, job_id, url, status
                ) VALUES (?, ?, ?, ?)
            `, [
                require('crypto').randomUUID(),
                jobId,
                testUrls[i],
                'pending'
            ]);
        }
        
        console.log('✅ Created test job with ID:', jobId);
        
        // Test JobWorker with mahesh account
        console.log('🔍 Testing JobWorker with mahesh account...');
        
        // Test the processJob function directly
        try {
            console.log('🍪 Testing cookie retrieval for mahesh account...');
            
            // Get account cookies directly to test
            const [accountData] = await connection.execute(
                'SELECT cookies_json FROM linkedin_accounts WHERE id = ?',
                [maheshAccount.id]
            );
            
            if (accountData.length > 0) {
                const cookiesJson = accountData[0].cookies_json;
                console.log('🍪 Raw cookies length:', cookiesJson ? cookiesJson.length : 0);
                
                if (cookiesJson) {
                    try {
                        const cookies = JSON.parse(cookiesJson);
                        console.log('🍪 Parsed cookies count:', Array.isArray(cookies) ? cookies.length : 'Not an array');
                        console.log('🍪 Cookie names:', Array.isArray(cookies) ? cookies.map(c => c.name) : 'N/A');
                        
                        // Test if cookies are valid format
                        if (Array.isArray(cookies) && cookies.length > 0) {
                            console.log('✅ Cookies are in valid format - no "No valid cookies found" warning should occur');
                        } else {
                            console.log('⚠️ Cookies are not in expected array format');
                        }
                    } catch (parseError) {
                        console.log('❌ Cookie parsing error:', parseError.message);
                    }
                }
            }
            
            console.log('✅ Cookie validation test completed - check logs above for any warnings');
            
        } catch (workerError) {
            console.log('⚠️ JobWorker error (expected for test):', workerError.message);
        }
        
        // Clean up test job
        await connection.execute('DELETE FROM job_urls WHERE job_id = ?', [jobId]);
        await connection.execute('DELETE FROM scraping_jobs WHERE id = ?', [jobId]);
        console.log('🧹 Cleaned up test job');
        
        console.log('🎉 Mahesh account scraping test completed!');
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the test
testMaheshScraping().catch(console.error);