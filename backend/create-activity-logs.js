// Create activity_logs table using Node.js database connection
const { execute } = require('./database');

async function createActivityLogsTable() {
  try {
    console.log('Creating activity_logs table...');
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at)
      )
    `;
    
    await execute(createTableQuery);
    console.log('✅ activity_logs table created successfully');
    
  } catch (error) {
    console.error('❌ Error creating activity_logs table:', error);
    throw error;
  }
}

// Run the function
createActivityLogsTable()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });