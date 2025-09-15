// debug-jobs-api.js

const express = require('express');
const axios = require('axios');
const app = express();

// Simulate API endpoint for debugging
app.get('/api/jobs/debug', async (req, res) => {
  try {
    // Simulate database query
    const jobs = await simulateDatabaseQuery();

    // Simulate API response
    const response = simulateApiResponse(jobs);

    res.status(200).json(response);
  } catch (error) {
    console.error('Error debugging Jobs API:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Simulate database query function
async function simulateDatabaseQuery() {
  // Replace with actual database query logic
  return [
    { id: 1, title: 'Software Engineer', status: 'ACTIVE' },
    { id: 2, title: 'Product Manager', status: 'PENDING' },
  ];
}

// Simulate API response function
function simulateApiResponse(jobs) {
  // Replace with actual API response logic
  return jobs.filter(job => job.status === 'ACTIVE');
}

// Start debugging server
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Debugging server running on http://localhost:${PORT}/api/jobs/debug`);
});