require('dotenv').config();
const { initializeDatabase, query } = require('./utils/database');
const { v4: uuidv4 } = require('uuid');

async function createTestData() {
  try {
    await initializeDatabase();
    console.log('🔍 Creating test data for export testing...');
    
    const testJobId = '02f5650d-7008-44c9-9813-c66b7f8f37a9';
    
    // Create sample profile results
    const testProfiles = [
      {
        job_id: testJobId,
        profile_url: 'https://linkedin.com/in/john-doe',
        full_name: 'John Doe',
        first_name: 'John',
        last_name: 'Doe',
        headline: 'Software Engineer at Tech Corp',
        about: 'Experienced software engineer with 5+ years in web development',
        country: 'United States',
        city: 'San Francisco',
        industry: 'Technology',
        email: 'john.doe@example.com',
        phone: '+1-555-0123',
        website: 'https://johndoe.dev',
        current_job_title: 'Senior Software Engineer',
        current_company_url: 'https://linkedin.com/company/tech-corp',
        company_name: 'Tech Corp',
        skills: JSON.stringify(['JavaScript', 'React', 'Node.js', 'Python']),
        education: JSON.stringify([{school: 'Stanford University', degree: 'BS Computer Science'}]),
        experience: JSON.stringify([{title: 'Software Engineer', company: 'Tech Corp', duration: '2019-Present'}]),
        status: 'completed'
      },
      {
        job_id: testJobId,
        profile_url: 'https://linkedin.com/in/jane-smith',
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        headline: 'Product Manager at Innovation Inc',
        about: 'Product manager passionate about user experience and innovation',
        country: 'United States',
        city: 'New York',
        industry: 'Technology',
        email: 'jane.smith@example.com',
        phone: '+1-555-0456',
        website: 'https://janesmith.com',
        current_job_title: 'Senior Product Manager',
        current_company_url: 'https://linkedin.com/company/innovation-inc',
        company_name: 'Innovation Inc',
        skills: JSON.stringify(['Product Management', 'User Research', 'Analytics', 'Agile']),
        education: JSON.stringify([{school: 'MIT', degree: 'MBA'}]),
        experience: JSON.stringify([{title: 'Product Manager', company: 'Innovation Inc', duration: '2020-Present'}]),
        status: 'completed'
      },
      {
        job_id: testJobId,
        profile_url: 'https://linkedin.com/in/mike-johnson',
        full_name: 'Mike Johnson',
        first_name: 'Mike',
        last_name: 'Johnson',
        headline: 'Data Scientist at Analytics Pro',
        about: 'Data scientist specializing in machine learning and AI',
        country: 'Canada',
        city: 'Toronto',
        industry: 'Data Science',
        email: 'mike.johnson@example.com',
        phone: '+1-416-555-0789',
        website: null,
        current_job_title: 'Senior Data Scientist',
        current_company_url: 'https://linkedin.com/company/analytics-pro',
        company_name: 'Analytics Pro',
        skills: JSON.stringify(['Python', 'Machine Learning', 'SQL', 'TensorFlow']),
        education: JSON.stringify([{school: 'University of Toronto', degree: 'PhD Statistics'}]),
        experience: JSON.stringify([{title: 'Data Scientist', company: 'Analytics Pro', duration: '2018-Present'}]),
        status: 'completed'
      }
    ];
    
    // Insert test data
    for (const profile of testProfiles) {
      const sql = `
        INSERT INTO profile_results (
          job_id, profile_url, full_name, first_name, last_name, headline, about,
          country, city, industry, email, phone, website, current_job_title,
          current_company_url, company_name, skills, education, experience, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      
      await query(sql, [
        profile.job_id, profile.profile_url, profile.full_name,
        profile.first_name, profile.last_name, profile.headline, profile.about,
        profile.country, profile.city, profile.industry, profile.email,
        profile.phone, profile.website, profile.current_job_title,
        profile.current_company_url, profile.company_name, profile.skills,
        profile.education, profile.experience, profile.status
      ]);
      
      console.log(`✅ Created test profile: ${profile.full_name}`);
    }
    
    // Update job result count
    await query('UPDATE jobs SET result_count = ? WHERE id = ?', [testProfiles.length, testJobId]);
    console.log(`✅ Updated job result count to ${testProfiles.length}`);
    
    console.log('🎉 Test data created successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating test data:', error);
    process.exit(1);
  }
}

createTestData();