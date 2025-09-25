require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const exportService = require('./services/exportService');

async function testExport() {
  try {
    await initializeDatabase();
    console.log('📊 Testing export service...');
    
    const jobId = '02f5650d-7008-44c9-9813-c66b7f8f37a9';
    const userId = 'af77771c-6504-470f-b05e-d68e045652a2'; // Correct user_id from database
    
    console.log(`🔍 Testing CSV export for job: ${jobId}`);
    
    try {
      const csvResult = await exportService.exportJobResults(jobId, 'csv', userId);
      console.log('✅ CSV Export successful!');
      console.log('📄 Filename:', csvResult.filename);
      console.log('📊 Size:', csvResult.size, 'bytes');
      console.log('🔤 Content type:', csvResult.contentType);
      console.log('📝 First 200 chars of data:', csvResult.data.substring(0, 200));
    } catch (csvError) {
      console.error('❌ CSV Export failed:', csvError.message);
    }
    
    console.log('\n🔍 Testing Excel export for job:', jobId);
    
    try {
      const excelResult = await exportService.exportJobResults(jobId, 'excel', userId);
      console.log('✅ Excel Export successful!');
      console.log('📄 Filename:', excelResult.filename);
      console.log('📊 Size:', excelResult.size, 'bytes');
      console.log('🔤 Content type:', excelResult.contentType);
    } catch (excelError) {
      console.error('❌ Excel Export failed:', excelError.message);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testExport();