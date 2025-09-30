const mysql = require('mysql2/promise');

async function fixScrapingJobsStatus() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Krushna_Sutar@0809',
      database: 'linkedin_automation_saas'
    });
    
    console.log('Connected to MySQL database');
    
    // First, check current status values
    const [rows] = await connection.execute('SELECT DISTINCT status FROM scraping_jobs');
    console.log('Current status values:', rows.map(r => r.status));
    
    // Update any invalid status values to 'pending'
    const validStatuses = ['pending', 'fetching', 'parsing', 'completed', 'failed', 'cancelled'];
    
    for (const row of rows) {
      if (!validStatuses.includes(row.status)) {
        console.log(`Updating invalid status '${row.status}' to 'pending'`);
        await connection.execute('UPDATE scraping_jobs SET status = ? WHERE status = ?', ['pending', row.status]);
      }
    }
    
    // Now modify the column to use proper ENUM
    try {
      const statusEnum = 'ENUM("pending","fetching","parsing","completed","failed","cancelled")';
      await connection.execute(`ALTER TABLE scraping_jobs MODIFY COLUMN status ${statusEnum} DEFAULT "pending"`);
      console.log('✅ Fixed scraping_jobs status column ENUM');
    } catch (err) {
      console.log('❌ Error fixing scraping_jobs status:', err.message);
    }
    
    console.log('Scraping jobs status fix completed');
    
  } catch (error) {
    console.error('Database connection error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

fixScrapingJobsStatus();