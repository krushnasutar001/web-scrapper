const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin
puppeteer.use(StealthPlugin());

async function testBasicBrowser() {
  console.log('🚀 Starting basic browser test...');
  
  let browser = null;
  let page = null;
  
  try {
    // Launch browser with basic settings
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    console.log('✅ Browser launched successfully');
    
    // Create new page
    page = await browser.newPage();
    console.log('✅ New page created');
    
    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });
    console.log('✅ Viewport set');
    
    // Test basic navigation
    console.log('🌐 Testing navigation to Google...');
    await page.goto('https://www.google.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    console.log('✅ Successfully navigated to Google');
    
    // Get page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Test LinkedIn navigation
    console.log('🌐 Testing navigation to LinkedIn...');
    await page.goto('https://www.linkedin.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    console.log('✅ Successfully navigated to LinkedIn');
    
    const linkedinTitle = await page.title();
    console.log(`📄 LinkedIn page title: ${linkedinTitle}`);
    
    // Wait a bit to see the page
    console.log('⏳ Waiting 5 seconds to observe the page...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('✅ Basic browser test completed successfully!');
    
  } catch (error) {
    console.error('❌ Basic browser test failed:', error.message);
    console.error('🔍 Error details:', error);
  } finally {
    // Cleanup
    if (page) {
      await page.close();
      console.log('📄 Page closed');
    }
    
    if (browser) {
      await browser.close();
      console.log('🌐 Browser closed');
    }
  }
}

// Run the test
testBasicBrowser().catch(console.error);