require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const Job = require('./models/Job');
const exportService = require('./services/exportService');

async function testCompanyScrapingWorkflow() {
  try {
    console.log('🚀 Starting Company Scraping Workflow Test...\n');

    // Initialize database connection
    await initializeDatabase();
    console.log('✅ Database connected\n');

    // Create a new company scraping job
    console.log('📝 Creating company scraping job...');
    const job = await Job.create({
      user_id: 'af77771c-6504-470f-b05e-d68e045652a2',
      job_type: 'company_scraping',
      status: 'running',
      total_urls: 3
    });

    console.log(`✅ Job created with ID: ${job.id}\n`);

    // Mock company URLs to scrape
    const testCompanyUrls = [
      'https://www.linkedin.com/company/microsoft/',
      'https://www.linkedin.com/company/google/',
      'https://www.linkedin.com/company/apple/'
    ];

    console.log('🔍 Starting company scraping simulation...');

    // Simulate scraping each company
    for (let i = 0; i < testCompanyUrls.length; i++) {
      console.log(`📊 Scraping company ${i + 1}/${testCompanyUrls.length}: ${testCompanyUrls[i]}`);

      // Mock company data
      const mockCompanyData = {
        company_name: `Test Company ${i + 1}`,
        company_url: testCompanyUrls[i],
        industry: 'Technology',
        company_size: '10,001+ employees',
        headquarters: 'Redmond, WA',
        founded: '1975',
        specialties: 'Software, Cloud Computing, AI',
        about: `This is a test company description for company ${i + 1}`,
        website: `https://company${i + 1}.com`,
        phone: `+1-555-000-${i + 1}00${i + 1}`,
        followers: Math.floor(Math.random() * 1000000) + 100000,
        employees_on_linkedin: Math.floor(Math.random() * 50000) + 10000
      };

      // Use the new Job model addResult method
      await job.addResult({
        company_name: mockCompanyData.company_name,
        company_url: mockCompanyData.company_url,
        industry: mockCompanyData.industry,
        company_size: mockCompanyData.company_size,
        headquarters: mockCompanyData.headquarters,
        founded: mockCompanyData.founded,
        specialties: mockCompanyData.specialties,
        about: mockCompanyData.about,
        website: mockCompanyData.website,
        phone: mockCompanyData.phone,
        followers: mockCompanyData.followers,
        employees_on_linkedin: mockCompanyData.employees_on_linkedin
      });

      console.log(`✅ Scraped company: ${mockCompanyData.company_name}`);
    }

    // Update job status and result count using Job model method
    await job.updateStatus('completed', { result_count: testCompanyUrls.length });

    console.log(`✅ Job completed with ${testCompanyUrls.length} results\n`);

    // Test export functionality
    console.log('📊 Testing export functionality...');
    
    // Test CSV export
    console.log('🔍 Testing CSV export...');
    const csvResult = await exportService.exportJobResults(job.id, 'af77771c-6504-470f-b05e-d68e045652a2', 'csv');
    console.log(`✅ CSV Export: ${csvResult.filename} (${csvResult.size} bytes)`);

    // Test JSON export
    console.log('🔍 Testing JSON export...');
    const jsonResult = await exportService.exportJobResults(job.id, 'af77771c-6504-470f-b05e-d68e045652a2', 'json');
    console.log(`✅ JSON Export: ${jsonResult.filename} (${jsonResult.size} bytes)`);

    console.log('\n🎉 Company scraping workflow test completed successfully!');

  } catch (error) {
    console.error('❌ Error in company scraping workflow test:', error);
    process.exit(1);
  }
}

// Run the test
testCompanyScrapingWorkflow();