const { initializeDatabase, query } = require('./utils/database');

async function testUrlValidation() {
  console.log("🔗 Testing URL Format and Accessibility...");
  
  try {
    // Initialize database
    process.env.DB_PASSWORD = "Krushna_Sutar@0809";
    await initializeDatabase();
    
    // Get sample URLs from database
    const urls = await query('SELECT id, url, status FROM job_urls LIMIT 5');
    console.log(`Found ${urls.length} URLs to validate`);
    
    for (const urlRecord of urls) {
      console.log(`\n🔍 Validating URL: ${urlRecord.url}`);
      console.log(`   ID: ${urlRecord.id}`);
      console.log(`   Status: ${urlRecord.status}`);
      
      // Validate URL format
      try {
        const urlObj = new URL(urlRecord.url);
        console.log(`   ✅ Valid URL format`);
        console.log(`   🌐 Domain: ${urlObj.hostname}`);
        console.log(`   📍 Path: ${urlObj.pathname}`);
        
        // Check if it's a LinkedIn URL
        if (urlObj.hostname.includes('linkedin.com')) {
          console.log(`   ✅ LinkedIn domain confirmed`);
          
          // Determine URL type
          if (urlObj.pathname.includes('/in/')) {
            console.log(`   👤 Profile URL detected`);
          } else if (urlObj.pathname.includes('/company/')) {
            console.log(`   🏢 Company URL detected`);
          } else {
            console.log(`   ❓ Unknown LinkedIn URL type`);
          }
        } else {
          console.log(`   ⚠️ Non-LinkedIn URL detected`);
        }
        
        // Test accessibility (basic check)
        console.log(`   🔄 Testing accessibility...`);
        
        // Use fetch to test if URL is reachable
        const https = require('https');
        const http = require('http');
        
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const accessibilityTest = new Promise((resolve, reject) => {
          const req = client.request(urlObj, { 
            method: 'HEAD',
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }, (res) => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers
            });
          });
          
          req.on('error', reject);
          req.on('timeout', () => reject(new Error('Request timeout')));
          req.setTimeout(5000);
          req.end();
        });
        
        try {
          const response = await accessibilityTest;
          console.log(`   📊 HTTP Status: ${response.statusCode}`);
          
          if (response.statusCode >= 200 && response.statusCode < 300) {
            console.log(`   ✅ URL is accessible`);
          } else if (response.statusCode >= 300 && response.statusCode < 400) {
            console.log(`   🔄 URL redirects (${response.statusCode})`);
          } else if (response.statusCode >= 400 && response.statusCode < 500) {
            console.log(`   ❌ Client error (${response.statusCode})`);
          } else {
            console.log(`   ❌ Server error (${response.statusCode})`);
          }
        } catch (accessError) {
          console.log(`   ❌ Accessibility test failed: ${accessError.message}`);
        }
        
      } catch (urlError) {
        console.log(`   ❌ Invalid URL format: ${urlError.message}`);
      }
    }
    
    console.log("\n📊 URL Validation Summary:");
    
    // Get URL statistics
    const stats = await query(`
      SELECT 
        COUNT(*) as total_urls,
        SUM(CASE WHEN url LIKE '%linkedin.com/in/%' THEN 1 ELSE 0 END) as profile_urls,
        SUM(CASE WHEN url LIKE '%linkedin.com/company/%' THEN 1 ELSE 0 END) as company_urls,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_urls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_urls,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_urls
      FROM job_urls
    `);
    
    const stat = stats[0];
    console.log(`   📈 Total URLs: ${stat.total_urls}`);
    console.log(`   👤 Profile URLs: ${stat.profile_urls}`);
    console.log(`   🏢 Company URLs: ${stat.company_urls}`);
    console.log(`   ⏳ Pending: ${stat.pending_urls}`);
    console.log(`   ✅ Completed: ${stat.completed_urls}`);
    console.log(`   ❌ Failed: ${stat.failed_urls}`);
    
  } catch (error) {
    console.error("❌ Error in URL validation test:", error.message);
  }
}

testUrlValidation().then(() => {
  console.log("✅ URL validation test completed");
  process.exit(0);
}).catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});