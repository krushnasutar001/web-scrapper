const { initializeDatabase, query } = require('./utils/database');
const LinkedInScraper = require('./services/linkedin-scraper');
const LinkedInAccount = require('./models/LinkedInAccount');
const { v4: uuidv4 } = require('uuid');

async function runComprehensiveScrapeTest() {
  console.log("🚀 Starting Comprehensive LinkedIn Scraping Test\n");
  
  let scraper = null;
  let testJobId = null;
  
  try {
    // 1. Initialize Database
    console.log("📊 Initializing database...");
    await initializeDatabase();
    console.log("✅ Database initialized successfully\n");
    
    // 2. Create Test Job
    console.log("📋 Creating test scraping job...");
    testJobId = uuidv4();
    await query(`
      INSERT INTO scraping_jobs (id, job_name, status, created_at, updated_at)
      VALUES (?, 'Comprehensive Test Job', 'pending', NOW(), NOW())
    `, [testJobId]);
    console.log("✅ Test job created\n");
    
    // 3. Check LinkedIn Accounts
    console.log("👤 Checking LinkedIn accounts...");
    const accounts = await query('SELECT * FROM linkedin_accounts ORDER BY created_at DESC LIMIT 5');
    console.log(`   Found ${accounts.length} LinkedIn accounts`);
    
    let accountWithCookies = null;
    for (const account of accounts) {
      if (account.cookies_json) {
        accountWithCookies = account;
        console.log(`   ✅ Account '${account.account_name}' has cookies`);
        break;
      } else {
        console.log(`   ⚠️ Account '${account.account_name}' has no cookies`);
      }
    }
    
    if (!accountWithCookies) {
      console.log("   ⚠️ No accounts with cookies found - proceeding without authentication\n");
    } else {
      console.log("   ✅ Will use authenticated account for scraping\n");
    }
    
    // 4. Initialize Scraper
    console.log("🤖 Initializing LinkedIn scraper...");
    scraper = new LinkedInScraper();
    await scraper.initialize();
    console.log("✅ Scraper initialized successfully\n");
    
    // 5. Test Profile URLs
    console.log("🔗 Testing profile URL scraping...");
    const testUrls = [
      'https://www.linkedin.com/in/satyanadella/',
      'https://www.linkedin.com/in/jeffweiner08/',
      'https://www.linkedin.com/in/reidhoffman/'
    ];
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const url of testUrls) {
      console.log(`   Testing: ${url}`);
      
      try {
        // Update job status to fetching
        await query(`
          UPDATE scraping_jobs 
          SET status = 'fetching', started_at = NOW() 
          WHERE id = ?
        `, [testJobId]);
        
        // Attempt to scrape profile
        const result = await scraper.scrapeProfile(url, accountWithCookies || { account_name: 'no-auth' });
        
        if (result && result.full_name) {
          console.log(`   ✅ Successfully scraped: ${result.full_name}`);
          
          // Save result to database
          const resultId = uuidv4();
          await query(`
            INSERT INTO profile_results (
              id, job_id, profile_url, full_name, headline, 
              about, current_position, current_company, 
              connections, profile_image_url, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
          `, [
            resultId,
            testJobId,
            url,
            result.full_name || 'N/A',
            result.headline || 'N/A',
            result.about || 'N/A',
            result.current_position || 'N/A',
            result.current_company || 'N/A',
            result.connections || 'N/A',
            result.profile_image_url || null
          ]);
          
          successCount++;
        } else {
          console.log(`   ❌ Failed to scrape profile data`);
          
          // Save failed result
          const resultId = uuidv4();
          await query(`
            INSERT INTO profile_results (
              id, job_id, profile_url, status, error_message
            ) VALUES (?, ?, ?, 'failed', 'No profile data extracted')
          `, [resultId, testJobId, url]);
          
          failureCount++;
        }
        
      } catch (error) {
        console.log(`   ❌ Error scraping ${url}: ${error.message}`);
        
        // Save error result
        const resultId = uuidv4();
        await query(`
          INSERT INTO profile_results (
            id, job_id, profile_url, status, error_message
          ) VALUES (?, ?, ?, 'failed', ?)
        `, [resultId, testJobId, url, error.message]);
        
        failureCount++;
      }
      
      // Add delay between requests to avoid rate limiting
      console.log("   ⏳ Waiting 3 seconds before next request...");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // 6. Test Company URL
    console.log("\n🏢 Testing company URL scraping...");
    const companyUrl = 'https://www.linkedin.com/company/microsoft/';
    
    try {
      console.log(`   Testing: ${companyUrl}`);
      const companyResult = await scraper.scrapeCompany(companyUrl, accountWithCookies || { account_name: 'no-auth' });
      
      if (companyResult && companyResult.company_name) {
        console.log(`   ✅ Successfully scraped company: ${companyResult.company_name}`);
      } else {
        console.log(`   ❌ Failed to scrape company data`);
      }
    } catch (error) {
      console.log(`   ❌ Error scraping company: ${error.message}`);
    }
    
    // 7. Update Job Status
    console.log("\n📊 Updating job status...");
    await query(`
      UPDATE scraping_jobs 
      SET status = 'completed', completed_at = NOW() 
      WHERE id = ?
    `, [testJobId]);
    console.log("✅ Job status updated\n");
    
    // 8. Generate Report
    console.log("📈 Test Results Summary:");
    console.log(`   ✅ Successful scrapes: ${successCount}`);
    console.log(`   ❌ Failed scrapes: ${failureCount}`);
    console.log(`   📊 Success rate: ${((successCount / (successCount + failureCount)) * 100).toFixed(1)}%`);
    
    // Get final database stats
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM profile_results WHERE job_id = ?) as test_results,
        (SELECT COUNT(*) FROM profile_results WHERE job_id = ? AND status = 'success') as successful_results
    `, [testJobId, testJobId]);
    
    console.log(`   💾 Results saved to database: ${stats[0].test_results}`);
    console.log(`   ✅ Successful results in DB: ${stats[0].successful_results}\n`);
    
    // 9. Test Error Handling
    console.log("🛡️ Testing error handling...");
    try {
      await scraper.scrapeProfile('https://invalid-url', { account_name: 'test' });
    } catch (error) {
      console.log("   ✅ Error handling working correctly for invalid URLs");
    }
    
    console.log("\n🎉 Comprehensive scraping test completed successfully!");
    
  } catch (error) {
    console.error("❌ Critical error in comprehensive test:", error.message);
    console.error("Stack trace:", error.stack);
    
    // Update job status to failed if we have a job ID
    if (testJobId) {
      try {
        await query(`
          UPDATE scraping_jobs 
          SET status = 'failed', completed_at = NOW() 
          WHERE id = ?
        `, [testJobId]);
      } catch (updateError) {
        console.error("Failed to update job status:", updateError.message);
      }
    }
    
  } finally {
    // Cleanup
    if (scraper) {
      try {
        await scraper.close();
        console.log("✅ Scraper closed successfully");
      } catch (closeError) {
        console.error("❌ Error closing scraper:", closeError.message);
      }
    }
  }
}

// Run the test
if (require.main === module) {
  runComprehensiveScrapeTest()
    .then(() => {
      console.log("\n✅ Test execution completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test execution failed:", error.message);
      process.exit(1);
    });
}

module.exports = { runComprehensiveScrapeTest };