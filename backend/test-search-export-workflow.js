require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const Job = require('./models/Job');
const exportService = require('./services/exportService');

async function testSearchExportWorkflow() {
  try {
    console.log('🚀 Starting Search Result Export Workflow Test...\n');

    // Initialize database connection
    await initializeDatabase();
    console.log('✅ Database connected\n');

    // Create a new search result scraping job
    console.log('📝 Creating search result export job...');
    const job = await Job.create({
      user_id: 'af77771c-6504-470f-b05e-d68e045652a2',
      job_name: 'Search Result Export Test',
      job_type: 'search_result_scraping',
      max_results: 5,
      configuration: {
        search_terms: ['Software Engineer', 'Product Manager', 'Data Scientist'],
        location: 'United States'
      },
      urls: []
    });

    console.log(`✅ Job created with ID: ${job.id}\n`);

    // Mock search queries
    const testSearchQueries = [
      'Software Engineer at Microsoft',
      'Product Manager at Google',
      'Data Scientist at Apple',
      'Marketing Director at Amazon',
      'UX Designer at Meta'
    ];

    console.log('🔍 Starting search result scraping simulation...');

    // Simulate scraping each search result
    for (let i = 0; i < testSearchQueries.length; i++) {
      console.log(`📊 Processing search result ${i + 1}/${testSearchQueries.length}: ${testSearchQueries[i]}`);

      // Mock search result data
      const mockSearchData = {
        search_query: testSearchQueries[i],
        profile_url: `https://www.linkedin.com/in/test-profile-${i + 1}/`,
        full_name: `Test User ${i + 1}`,
        headline: `${testSearchQueries[i]} | Tech Professional`,
        location: ['San Francisco, CA', 'Seattle, WA', 'New York, NY', 'Austin, TX', 'Boston, MA'][i],
        company: ['Microsoft', 'Google', 'Apple', 'Amazon', 'Meta'][i],
        position: testSearchQueries[i].split(' at ')[0],
        profile_image_url: `https://example.com/profile-${i + 1}.jpg`,
        connection_degree: ['1st', '2nd', '3rd'][Math.floor(Math.random() * 3)],
        mutual_connections: Math.floor(Math.random() * 50),
        premium_account: Math.random() > 0.5,
        search_rank: i + 1,
        search_page: 1
      };

      // Use the new Job model addResult method
      await job.addResult({
        search_url: 'https://linkedin.com/search/results/people/',
        result_type: 'profile',
        result_url: mockSearchData.profile_url,
        title: mockSearchData.full_name,
        subtitle: mockSearchData.company,
        description: mockSearchData.headline,
        location: mockSearchData.location,
        search_query: mockSearchData.search_query,
        additional_info: {
          position: mockSearchData.position,
          profile_image_url: mockSearchData.profile_image_url,
          connection_degree: mockSearchData.connection_degree,
          mutual_connections: mockSearchData.mutual_connections,
          premium_account: mockSearchData.premium_account,
          search_rank: mockSearchData.search_rank,
          search_page: mockSearchData.search_page
        }
      });

      console.log(`✅ Processed search result: ${mockSearchData.full_name}`);
    }

    // Update job status and result count using Job model method
    await job.updateStatus('completed', { result_count: testSearchQueries.length });

    console.log(`✅ Job completed with ${testSearchQueries.length} results\n`);

    // Test export functionality
    console.log('📊 Testing export functionality...');
    
    // Test CSV export
    console.log('🔍 Testing CSV export...');
    const csvResult = await exportService.exportJobResults(job.id, 'csv', job.user_id);
    console.log(`✅ CSV Export: ${csvResult.filename} (${csvResult.size} bytes)`);

    // Test JSON export
    console.log('🔍 Testing JSON export...');
    const jsonResult = await exportService.exportJobResults(job.id, 'json', job.user_id);
    console.log(`✅ JSON Export: ${jsonResult.filename} (${jsonResult.size} bytes)`);

    console.log('\n🎉 Search result export workflow test completed successfully!');

  } catch (error) {
    console.error('❌ Error in search result export workflow test:', error);
    process.exit(1);
  }
}

// Run the test
testSearchExportWorkflow();