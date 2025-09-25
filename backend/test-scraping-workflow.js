require('dotenv').config();
const { initializeDatabase, query } = require('./utils/database');
const Job = require('./models/Job');
const exportService = require('./services/exportService');

async function testScrapingWorkflow() {
  console.log('🚀 Testing complete scraping workflow...\n');
  
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized\n');

    // Create a test job
    const testJobData = {
      user_id: 'af77771c-6504-470f-b05e-d68e045652a2', // Using existing user ID
      job_name: 'Workflow Test Job',
      job_type: 'profile_scraping', // Using correct enum value from jobs table
      max_results: 5,
      configuration: JSON.stringify({
        search_terms: ['software engineer', 'developer'],
        location: 'San Francisco',
        industry: 'Technology'
      }),
      total_urls: 3
    };

    console.log('📝 Creating test job...');
    const job = await Job.create(testJobData);
    console.log(`✅ Created job: ${job.id}\n`);

    // Create corresponding scraping_jobs entry
    console.log('📝 Creating scraping_jobs entry...');
    const scrapingJobSql = `
      INSERT INTO scraping_jobs (
        id, job_name, job_type, status, total_items, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    await query(scrapingJobSql, [
      job.id,
      testJobData.job_name,
      'profiles', // Map profile_scraping to profiles
      'pending',
      testJobData.total_urls,
      testJobData.user_id
    ]);
    console.log(`✅ Created scraping_jobs entry for job: ${job.id}\n`);

    // Test profile URLs
    const testUrls = [
      'https://linkedin.com/in/johndoe',
      'https://linkedin.com/in/janesmith',
      'https://linkedin.com/in/mikejohnson'
    ];

    console.log('🔍 Testing profile scraping...');
    
    // Simulate scraping results for each URL
    for (let i = 0; i < testUrls.length; i++) {
      const mockProfileData = {
        full_name: `Test User ${i + 1}`,
        first_name: `Test${i + 1}`,
        last_name: `User${i + 1}`,
        headline: `Senior Software Engineer at Company ${i + 1}`,
        about: `Experienced software engineer with ${5 + i} years in the industry.`,
        country: 'United States',
        city: 'San Francisco',
        industry: 'Technology',
        email: `testuser${i + 1}@example.com`,
        phone: `+1-555-000${i + 1}`,
        website: `https://testuser${i + 1}.com`,
        current_job_title: `Senior Software Engineer`,
        current_company_url: `https://company${i + 1}.com`,
        company_name: `Company ${i + 1}`,
        skills: JSON.stringify(['JavaScript', 'Python', 'React', 'Node.js']),
        education: JSON.stringify([{
          school: `University ${i + 1}`,
          degree: 'Bachelor of Computer Science',
          year: '2018'
        }]),
        experience: JSON.stringify([{
          title: 'Senior Software Engineer',
          company: `Company ${i + 1}`,
          duration: '2020-Present'
        }])
      };

      // Use the new Job model addResult method
      await job.addResult({
        profile_url: testUrls[i],
        full_name: mockProfileData.full_name,
        first_name: mockProfileData.first_name,
        last_name: mockProfileData.last_name,
        headline: mockProfileData.headline,
        about: mockProfileData.about,
        country: mockProfileData.country,
        city: mockProfileData.city,
        industry: mockProfileData.industry,
        email: mockProfileData.email,
        phone: mockProfileData.phone,
        website: mockProfileData.website,
        current_job_title: mockProfileData.current_job_title,
        current_company_url: mockProfileData.current_company_url,
        company_name: mockProfileData.company_name,
        skills: mockProfileData.skills,
        education: mockProfileData.education,
        experience: mockProfileData.experience,
        status: 'completed'
      });

      console.log(`✅ Scraped profile: ${mockProfileData.full_name}`);
    }

    // Update job status and result count using Job model method
    await job.updateStatus('completed', { result_count: testUrls.length });

    console.log(`✅ Job completed with ${testUrls.length} results\n`);

    // Test export functionality
    console.log('\n🔍 Testing export functionality...');
    
    // Get the job to ensure we have the correct user_id
    const jobForExport = await query('SELECT * FROM jobs WHERE id = ?', [job.id]);
    const correctUserId = jobForExport[0].user_id;
    
    console.log('🔍 Using user_id for export:', correctUserId);
    
    // Test CSV export
    console.log('🔍 Testing CSV export...');
    const csvResult = await exportService.exportJobResults(job.id, 'csv', correctUserId);
    console.log('✅ CSV export successful:', csvResult.filename);
    
    // Test Excel export
    console.log('🔍 Testing Excel export...');
    const excelResult = await exportService.exportJobResults(job.id, 'excel', correctUserId);
    console.log('✅ Excel export successful:', excelResult.filename);
    
    // Test JSON export
    console.log('🔍 Testing JSON export...');
    const jsonResult = await exportService.exportJobResults(job.id, 'json', correctUserId);
    console.log('✅ JSON export successful:', jsonResult.filename);

    console.log('\n🎉 Complete workflow test successful!');
    console.log('✅ All components working with new profile_results schema');

  } catch (error) {
    console.error('❌ Workflow test failed:', error);
    throw error;
  }
}

// Run the test
testScrapingWorkflow()
  .then(() => {
    console.log('\n✅ Workflow test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Workflow test failed:', error);
    process.exit(1);
  });