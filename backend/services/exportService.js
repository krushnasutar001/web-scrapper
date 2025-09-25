const Job = require('../models/Job');
const { query } = require('../utils/database');
const xlsx = require('xlsx');
const csv = require('csv-stringify').stringify;

/**
 * Export job results in specified format
 */
const exportJobResults = async (jobId, format, userId) => {
  try {
    console.log(`📥 Exporting job results: ${jobId} in ${format} format`);
    
    // Verify job exists and belongs to user
    const job = await Job.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    
    console.log('🔍 Export access check:', {
      jobUserId: job.user_id,
      requestUserId: userId,
      match: job.user_id === userId
    });
    
    if (job.user_id !== userId) {
      throw new Error('Access denied to this job');
    }
    
    if (job.status !== 'completed') {
      throw new Error('Job is not completed yet');
    }
    
    // Get job results
    const results = await job.getResults();
    
    if (results.length === 0) {
      throw new Error('No results available for export');
    }
    
    console.log(`📊 Exporting ${results.length} results`);
    
    // Format data for export based on job type
    let exportData;
    
    switch (job.job_type) {
      case 'profile_scraping':
        exportData = results.map(result => ({
          'Full Name': result.full_name || '',
          'First Name': result.first_name || '',
          'Last Name': result.last_name || '',
          'Headline': result.headline || '',
          'About': result.about || '',
          'Country': result.country || '',
          'City': result.city || '',
          'Industry': result.industry || '',
          'Email': result.email || '',
          'Phone': result.phone || '',
          'Website': result.website || '',
          'Current Job Title': result.current_job_title || '',
          'Current Company URL': result.current_company_url || '',
          'Company Name': result.company_name || '',
          'Skills': Array.isArray(result.skills) ? result.skills.join(', ') : result.skills || '',
          'Education': Array.isArray(result.education) ? result.education.map(edu => `${edu.school || ''} - ${edu.degree || ''}`).join('; ') : result.education || '',
          'Experience': Array.isArray(result.experience) ? result.experience.map(exp => `${exp.title || ''} at ${exp.company || ''}`).join('; ') : result.experience || '',
          'Profile URL': result.profile_url || '',
          'Status': result.status || '',
          'Scraped At': result.created_at ? new Date(result.created_at).toISOString() : '',
          'Job Name': job.job_name,
          'Job Type': job.job_type
        }));
        break;
        
      case 'company_scraping':
        exportData = results.map(result => ({
          'Company Name': result.company_name || '',
          'Company URL': result.company_url || '',
          'Industry': result.company_industry || '',
          'Company Size': result.company_size || '',
          'Location': result.company_location || '',
          'Description': result.company_description || '',
          'Website': result.company_website || '',
          'Specialties': result.company_specialties || '',
          'Scraped At': result.created_at ? new Date(result.created_at).toISOString() : '',
          'Job Name': job.job_name,
          'Job Type': job.job_type
        }));
        break;
        
      case 'search_result_scraping':
        exportData = results.map(result => ({
          'Job Title': result.title || '',
          'Company': result.company || '',
          'Location': result.location || '',
          'Description': result.description || '',
          'Job URL': result.url || '',
          'Posted Date': result.posted_date || '',
          'Salary Range': result.salary_range || '',
          'Employment Type': result.employment_type || '',
          'Experience Level': result.experience_level || '',
          'Scraped At': result.created_at ? new Date(result.created_at).toISOString() : '',
          'Job Name': job.job_name,
          'Job Type': job.job_type
        }));
        break;
        
      default:
        throw new Error(`Unsupported job type for export: ${job.job_type}`);
    }
    
    // Generate export based on format
    switch (format.toLowerCase()) {
      case 'csv':
        return await generateCSV(exportData, job);
      case 'excel':
      case 'xlsx':
        return await generateExcel(exportData, job);
      case 'json':
        return await generateJSON(results, job);
      default:
        throw new Error('Unsupported export format');
    }
    
  } catch (error) {
    console.error('❌ Export error:', error);
    throw error;
  }
};

/**
 * Generate CSV export
 */
const generateCSV = async (data, job) => {
  return new Promise((resolve, reject) => {
    // Get column headers based on job type
    let columns;
    
    switch (job.job_type) {
      case 'profile_scraping':
        columns = [
          'Full Name', 'First Name', 'Last Name', 'Headline', 'About', 
          'Country', 'City', 'Industry', 'Email', 'Phone', 'Website',
          'Current Job Title', 'Current Company URL', 'Company Name', 
          'Skills', 'Education', 'Experience', 'Profile URL', 'Status',
          'Scraped At', 'Job Name', 'Job Type'
        ];
        break;
        
      case 'company_scraping':
        columns = [
          'Company Name', 'Company URL', 'Industry', 'Company Size', 
          'Location', 'Description', 'Website', 'Specialties',
          'Scraped At', 'Job Name', 'Job Type'
        ];
        break;
        
      case 'search_result_scraping':
        columns = [
          'Job Title', 'Company', 'Location', 'Description', 'Job URL',
          'Posted Date', 'Salary Range', 'Employment Type', 'Experience Level',
          'Scraped At', 'Job Name', 'Job Type'
        ];
        break;
        
      default:
        columns = Object.keys(data[0] || {});
    }
    
    csv(data, {
      header: true,
      columns: columns
    }, (err, output) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          data: output,
          filename: `${sanitizeFilename(job.job_name)}_results.csv`,
          contentType: 'text/csv',
          size: Buffer.byteLength(output, 'utf8')
        });
      }
    });
  });
};

/**
 * Generate Excel export
 */
const generateExcel = async (data, job) => {
  try {
    // Create workbook and worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(data);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Full Name
      { wch: 15 }, // First Name
      { wch: 15 }, // Last Name
      { wch: 30 }, // Headline
      { wch: 40 }, // About
      { wch: 15 }, // Country
      { wch: 15 }, // City
      { wch: 20 }, // Industry
      { wch: 25 }, // Email
      { wch: 15 }, // Phone
      { wch: 30 }, // Website
      { wch: 25 }, // Current Job Title
      { wch: 30 }, // Current Company URL
      { wch: 20 }, // Company Name
      { wch: 40 }, // Skills
      { wch: 40 }, // Education
      { wch: 40 }, // Experience
      { wch: 40 }, // Profile URL
      { wch: 15 }, // Status
      { wch: 20 }, // Scraped At
      { wch: 20 }, // Job Name
      { wch: 15 }  // Job Type
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Results');
    
    // Add summary sheet
    const summaryData = [
      { Metric: 'Job Name', Value: job.job_name },
      { Metric: 'Job Type', Value: job.job_type },
      { Metric: 'Total URLs', Value: job.total_urls },
      { Metric: 'Successful Results', Value: job.result_count },
      { Metric: 'Success Rate', Value: `${Math.round((job.result_count / job.total_urls) * 100)}%` },
      { Metric: 'Created At', Value: job.created_at },
      { Metric: 'Completed At', Value: job.completed_at },
      { Metric: 'Export Date', Value: new Date().toISOString() }
    ];
    
    const summarySheet = xlsx.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    return {
      data: buffer,
      filename: `${sanitizeFilename(job.job_name)}_results.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length
    };
    
  } catch (error) {
    console.error('❌ Excel generation error:', error);
    throw error;
  }
};

/**
 * Generate JSON export
 */
const generateJSON = async (results, job) => {
  try {
    const exportData = {
      job: {
        id: job.id,
        name: job.job_name,
        type: job.job_type,
        status: job.status,
        total_urls: job.total_urls,
        result_count: job.result_count,
        created_at: job.created_at,
        completed_at: job.completed_at
      },
      export_info: {
        exported_at: new Date().toISOString(),
        total_results: results.length,
        format: 'json'
      },
      results: results.map(result => ({
        id: result.id,
        name: result.name,
        title: result.title,
        company: result.company,
        location: result.location,
        email: result.email,
        linkedin_url: result.linkedin_url,
        source_url: result.source_url,
        scraped_data: result.scraped_data,
        scraped_at: result.created_at
      }))
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    
    return {
      data: jsonString,
      filename: `${sanitizeFilename(job.job_name)}_results.json`,
      contentType: 'application/json',
      size: Buffer.byteLength(jsonString, 'utf8')
    };
    
  } catch (error) {
    console.error('❌ JSON generation error:', error);
    throw error;
  }
};

/**
 * Export multiple jobs results
 */
const exportMultipleJobs = async (jobIds, format, userId) => {
  try {
    console.log(`📥 Exporting multiple jobs: ${jobIds.length} jobs in ${format} format`);
    
    const allResults = [];
    const jobSummaries = [];
    
    // Get results from all jobs
    for (const jobId of jobIds) {
      const job = await Job.findById(jobId);
      if (!job || job.user_id !== userId) {
        console.warn(`⚠️ Skipping job ${jobId}: not found or access denied`);
        continue;
      }
      
      if (job.status !== 'completed') {
        console.warn(`⚠️ Skipping job ${jobId}: not completed`);
        continue;
      }
      
      const results = await job.getResults();
      
      // Add job info to each result
      const jobResults = results.map(result => ({
        ...result,
        job_id: job.id,
        job_name: job.job_name,
        job_type: job.job_type,
        job_created_at: job.created_at
      }));
      
      allResults.push(...jobResults);
      
      jobSummaries.push({
        id: job.id,
        name: job.job_name,
        type: job.job_type,
        total_urls: job.total_urls,
        result_count: job.result_count,
        created_at: job.created_at,
        completed_at: job.completed_at
      });
    }
    
    if (allResults.length === 0) {
      throw new Error('No results available from the selected jobs');
    }
    
    console.log(`📊 Exporting ${allResults.length} results from ${jobSummaries.length} jobs`);
    
    // Format data for export
    const exportData = allResults.map(result => ({
      'Job Name': result.job_name || '',
      'Job Type': result.job_type || '',
      Name: result.name || '',
      Title: result.title || '',
      Company: result.company || '',
      Location: result.location || '',
      Email: result.email || '',
      'LinkedIn URL': result.linkedin_url || result.source_url || '',
      'Source URL': result.source_url || '',
      'Scraped At': result.created_at ? new Date(result.created_at).toISOString() : ''
    }));
    
    // Generate export based on format
    switch (format.toLowerCase()) {
      case 'csv':
        return await generateMultipleCSV(exportData, jobSummaries);
      case 'excel':
      case 'xlsx':
        return await generateMultipleExcel(exportData, jobSummaries);
      case 'json':
        return await generateMultipleJSON(allResults, jobSummaries);
      default:
        throw new Error('Unsupported export format');
    }
    
  } catch (error) {
    console.error('❌ Multiple jobs export error:', error);
    throw error;
  }
};

/**
 * Generate CSV for multiple jobs
 */
const generateMultipleCSV = async (data, jobSummaries) => {
  return new Promise((resolve, reject) => {
    csv(data, {
      header: true,
      columns: [
        'Job Name', 'Job Type', 'Name', 'Title', 'Company', 'Location', 
        'Email', 'LinkedIn URL', 'Source URL', 'Scraped At'
      ]
    }, (err, output) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          data: output,
          filename: `multiple_jobs_results_${new Date().toISOString().split('T')[0]}.csv`,
          contentType: 'text/csv',
          size: Buffer.byteLength(output, 'utf8')
        });
      }
    });
  });
};

/**
 * Generate Excel for multiple jobs
 */
const generateMultipleExcel = async (data, jobSummaries) => {
  try {
    const workbook = xlsx.utils.book_new();
    
    // Results sheet
    const resultsSheet = xlsx.utils.json_to_sheet(data);
    const columnWidths = [
      { wch: 20 }, // Job Name
      { wch: 15 }, // Job Type
      { wch: 20 }, // Name
      { wch: 25 }, // Title
      { wch: 20 }, // Company
      { wch: 20 }, // Location
      { wch: 25 }, // Email
      { wch: 40 }, // LinkedIn URL
      { wch: 40 }, // Source URL
      { wch: 20 }  // Scraped At
    ];
    resultsSheet['!cols'] = columnWidths;
    xlsx.utils.book_append_sheet(workbook, resultsSheet, 'All Results');
    
    // Jobs summary sheet
    const summarySheet = xlsx.utils.json_to_sheet(jobSummaries.map(job => ({
      'Job Name': job.name,
      'Job Type': job.type,
      'Total URLs': job.total_urls,
      'Results Count': job.result_count,
      'Success Rate': `${Math.round((job.result_count / job.total_urls) * 100)}%`,
      'Created At': job.created_at,
      'Completed At': job.completed_at
    })));
    summarySheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, 
      { wch: 12 }, { wch: 20 }, { wch: 20 }
    ];
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Jobs Summary');
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    return {
      data: buffer,
      filename: `multiple_jobs_results_${new Date().toISOString().split('T')[0]}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length
    };
    
  } catch (error) {
    console.error('❌ Multiple jobs Excel generation error:', error);
    throw error;
  }
};

/**
 * Generate JSON for multiple jobs
 */
const generateMultipleJSON = async (results, jobSummaries) => {
  try {
    const exportData = {
      export_info: {
        exported_at: new Date().toISOString(),
        total_jobs: jobSummaries.length,
        total_results: results.length,
        format: 'json'
      },
      jobs_summary: jobSummaries,
      results: results.map(result => ({
        job_id: result.job_id,
        job_name: result.job_name,
        job_type: result.job_type,
        result_id: result.id,
        name: result.name,
        title: result.title,
        company: result.company,
        location: result.location,
        email: result.email,
        linkedin_url: result.linkedin_url,
        source_url: result.source_url,
        scraped_data: result.scraped_data,
        scraped_at: result.created_at
      }))
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    
    return {
      data: jsonString,
      filename: `multiple_jobs_results_${new Date().toISOString().split('T')[0]}.json`,
      contentType: 'application/json',
      size: Buffer.byteLength(jsonString, 'utf8')
    };
    
  } catch (error) {
    console.error('❌ Multiple jobs JSON generation error:', error);
    throw error;
  }
};

/**
 * Sanitize filename for safe file system usage
 */
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
};

/**
 * Get export statistics for a user
 */
const getExportStats = async (userId) => {
  try {
    const sql = `
      SELECT 
        COUNT(DISTINCT j.id) as exportable_jobs,
        SUM(j.result_count) as total_exportable_results,
        COUNT(DISTINCT CASE WHEN j.status = 'completed' THEN j.id END) as completed_jobs
      FROM jobs j
      WHERE j.user_id = ? AND j.status = 'completed' AND j.result_count > 0
    `;
    
    const results = await query(sql, [userId]);
    return results[0] || {
      exportable_jobs: 0,
      total_exportable_results: 0,
      completed_jobs: 0
    };
  } catch (error) {
    console.error('❌ Error getting export stats:', error);
    throw error;
  }
};

module.exports = {
  exportJobResults,
  exportMultipleJobs,
  getExportStats
};