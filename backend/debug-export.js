require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const exportService = require('./services/exportService');
const Job = require('./models/Job');

async function debugExport() {
  try {
    await initializeDatabase();
    console.log('🔍 Debugging export service access denied issue...');
    
    const jobId = '02f5650d-7008-44c9-9813-c66b7f8f37a9';
    
    // Test with correct user_id
    const correctUserId = 'af77771c-6504-470f-b05e-d68e045652a2';
    
    // Test with wrong user_id
    const wrongUserId = '25922f59-ff76-4b5c-854e-e19170c754e6';
    
    console.log('\n📊 Testing with CORRECT user_id:', correctUserId);
    try {
      const job = await Job.findById(jobId);
      console.log('🔍 Job found:', !!job);
      console.log('🔍 Job user_id:', job?.user_id);
      console.log('🔍 Provided user_id:', correctUserId);
      console.log('🔍 User IDs match:', job?.user_id === correctUserId);
      
      const result = await exportService.exportJobResults(jobId, 'csv', correctUserId);
      console.log('✅ Export successful with correct user_id');
    } catch (error) {
      console.error('❌ Export failed with correct user_id:', error.message);
    }
    
    console.log('\n📊 Testing with WRONG user_id:', wrongUserId);
    try {
      const job = await Job.findById(jobId);
      console.log('🔍 Job found:', !!job);
      console.log('🔍 Job user_id:', job?.user_id);
      console.log('🔍 Provided user_id:', wrongUserId);
      console.log('🔍 User IDs match:', job?.user_id === wrongUserId);
      
      const result = await exportService.exportJobResults(jobId, 'csv', wrongUserId);
      console.log('✅ Export successful with wrong user_id (this should not happen!)');
    } catch (error) {
      console.error('❌ Export failed with wrong user_id (expected):', error.message);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }
}

debugExport();