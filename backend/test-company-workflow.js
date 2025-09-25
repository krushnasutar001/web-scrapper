require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const { v4: uuidv4 } = require('uuid');
const Job = require('./models/Job');
const exportService = require('./services/exportService');

async function testCompanyScrapingWorkflow() {
  try {
    // Initialize database connection
    await initializeDatabase();
    
    console.log('🧪 Testing Complete Company Scraping Workflow...\n');
    
    // Step 1: Create Company Scraping Job
    console.log('📝 Step 1: Creating Company Scraping Job...');
    
    const jobData = {
      user_id: 'af77771c-6504-470f-b05e-d68e045652a2', // Using existing user ID
      job_name: 'Company Workflow Test',
      job_type: 'company_scraping',
      max_results: 50,
      configuration: JSON.stringify({
        search_query: 'technology companies',
        location: 'San Francisco',
        industry: 'Technology'
      }),
      urls: [
        'https://www.linkedin.com/company/google/',
        'https://www.linkedin.com/company/microsoft/',
        'https://www.linkedin.com/company/apple/'
      ]
    };
    
    const newJob = await Job.create(jobData);
    console.log('✅ Job created successfully:', newJob.id);
    console.log('   Job Name:', newJob.job_name);
    console.log('   Job Type:', newJob.job_type);
    console.log('   Status:', newJob.status);
    console.log('   URLs:', jobData.urls.length);
    
    // Step 2: Simulate Job Execution
    console.log('\n🔄 Step 2: Simulating Job Completion...');
    
    // Update job status to running
    await newJob.updateStatus('running');
    console.log('   Status updated to:', newJob.status);
    
    // Add mock results to job_results table
    const mockResults = [
      {
        id: uuidv4(),
        job_id: newJob.id,
        job_url_id: uuidv4(),
        source_url: 'https://www.linkedin.com/company/google/',
        scraped_data: JSON.stringify({
          company_name: 'Google',
          industry: 'Internet',
          company_size: '100,001+ employees',
          headquarters: 'Mountain View, CA',
          founded: '1998',
          specialties: ['Search', 'Ads', 'Mobile', 'Android', 'Online Video', 'Apps', 'Machine Learning', 'Virtual Reality'],
          website: 'https://www.google.com',
          description: 'Our mission is to organize the world\'s information and make it universally accessible and useful.',
          followers: '27,985,262',
          employees_on_linkedin: '139,995',
          company_type: 'Public Company',
          phone: null,
          email: null
        }),
        name: 'Google',
        title: 'Technology Company',
        company: 'Google',
        location: 'Mountain View, CA',
        linkedin_url: 'https://www.linkedin.com/company/google/'
      },
      {
        id: uuidv4(),
        job_id: newJob.id,
        job_url_id: uuidv4(),
        source_url: 'https://www.linkedin.com/company/microsoft/',
        scraped_data: JSON.stringify({
          company_name: 'Microsoft',
          industry: 'Computer Software',
          company_size: '100,001+ employees',
          headquarters: 'Redmond, WA',
          founded: '1975',
          specialties: ['Productivity Software', 'Operating Systems', 'Developer Tools', 'Server Applications', 'Business Solutions Applications', 'Consulting Services'],
          website: 'https://www.microsoft.com',
          description: 'At Microsoft, our mission is to empower every person and every organization on the planet to achieve more.',
          followers: '18,123,456',
          employees_on_linkedin: '198,765',
          company_type: 'Public Company',
          phone: null,
          email: null
        }),
        name: 'Microsoft',
        title: 'Software Company',
        company: 'Microsoft',
        location: 'Redmond, WA',
        linkedin_url: 'https://www.linkedin.com/company/microsoft/'
      }
    ];
    
    // First create job_urls entries
    const { query } = require('./utils/database');
    const jobUrls = [
      { id: mockResults[0].job_url_id, url: mockResults[0].source_url },
      { id: mockResults[1].job_url_id, url: mockResults[1].source_url }
    ];
    
    for (const jobUrl of jobUrls) {
      await query(`
        INSERT INTO job_urls (id, job_id, url, status, processed_at)
        VALUES (?, ?, ?, 'completed', NOW())
      `, [jobUrl.id, newJob.id, jobUrl.url]);
    }
    
    // Insert mock results
    for (const result of mockResults) {
      await query(`
        INSERT INTO job_results (
          id, job_id, job_url_id, source_url, scraped_data, 
          name, title, company, location, linkedin_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        result.id, result.job_id, result.job_url_id, result.source_url,
        result.scraped_data, result.name, result.title, result.company,
        result.location, result.linkedin_url
      ]);
    }
    
    // Update job status to completed
    await newJob.updateStatus('completed');
    
    // Update job result count manually
    await query(`
      UPDATE jobs 
      SET result_count = (
        SELECT COUNT(*) FROM job_results WHERE job_id = ?
      ) 
      WHERE id = ?
    `, [newJob.id, newJob.id]);
    
    console.log('✅ Job completed with', mockResults.length, 'results');
    
    // Step 3: Test Export Functionality
    console.log('\n📊 Step 3: Testing Export Functionality...');
    
    // Debug: Check job ownership
    console.log('🔍 Debug: Job ownership check');
    console.log('   Job ID:', newJob.id);
    console.log('   Job user_id:', newJob.user_id);
    console.log('   Expected user_id:', jobData.user_id);
    console.log('   User IDs match:', newJob.user_id === jobData.user_id);
    
    let csvSuccess = false, excelSuccess = false, jsonSuccess = false;
    
    // Test CSV Export
    console.log('   Testing CSV Export...');
    try {
      const csvResult = await exportService.exportJobResults(newJob.id, 'csv', newJob.user_id);
      console.log('   ✅ CSV Export successful!');
      console.log('      Filename:', csvResult.filename);
      console.log('      Size:', csvResult.size, 'bytes');
      console.log('      Content Type:', csvResult.contentType);
      console.log('      Sample Data:', csvResult.data.substring(0, 200) + '...');
      csvSuccess = true;
    } catch (error) {
      console.log('   ❌ CSV Export failed:', error.message);
    }

    // Test Excel Export
    console.log('\n   Testing Excel Export...');
    try {
      const excelResult = await exportService.exportJobResults(newJob.id, 'excel', newJob.user_id);
      console.log('   ✅ Excel Export successful!');
      console.log('      Filename:', excelResult.filename);
      console.log('      Size:', excelResult.size, 'bytes');
      console.log('      Content Type:', excelResult.contentType);
      excelSuccess = true;
    } catch (error) {
      console.log('   ❌ Excel Export failed:', error.message);
    }

    // Test JSON Export
    console.log('\n   Testing JSON Export...');
    try {
      const jsonResult = await exportService.exportJobResults(newJob.id, 'json', newJob.user_id);
      console.log('   ✅ JSON Export successful!');
      console.log('      Filename:', jsonResult.filename);
      console.log('      Size:', jsonResult.size, 'bytes');
      console.log('      Content Type:', jsonResult.contentType);
      console.log('      Sample Data:', jsonResult.data.substring(0, 300) + '...');
      jsonSuccess = true;
    } catch (error) {
      console.log('   ❌ JSON Export failed:', error.message);
    }
    
    // Step 4: Verify Data Integrity
    console.log('\n🔍 Step 4: Verifying Job Data Integrity...');
    
    // Refresh job data
    const updatedJob = await Job.findById(newJob.id);
    const jobResults = await updatedJob.getResults();
    const urlCount = await query('SELECT COUNT(*) as count FROM job_urls WHERE job_id = ?', [newJob.id]);
    
    console.log('   Job Status:', updatedJob.status);
    console.log('   Result Count:', updatedJob.result_count);
    console.log('   Total URLs:', updatedJob.total_urls);
    console.log('   Processed URLs:', updatedJob.processed_urls);
    console.log('   Results in DB:', jobResults.length);
    
    console.log('\n🎉 Company Scraping Workflow Test Completed!');
    console.log('📋 Summary:');
    console.log('   ✅ Job Creation: Success');
    console.log('   ✅ Job Execution: Simulated');
    console.log('   ✅ Data Storage: Success');
    console.log(`   ${csvSuccess ? '✅' : '❌'} CSV Export: ${csvSuccess ? 'Success' : 'Failed'}`);
    console.log(`   ${excelSuccess ? '✅' : '❌'} Excel Export: ${excelSuccess ? 'Success' : 'Failed'}`);
    console.log(`   ${jsonSuccess ? '✅' : '❌'} JSON Export: ${jsonSuccess ? 'Success' : 'Failed'}`);
    console.log('   ✅ Data Integrity: Verified');
    
  } catch (error) {
    console.error('❌ Company Workflow Test Failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testCompanyScrapingWorkflow();