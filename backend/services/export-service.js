const XLSX = require('xlsx');

class ExportService {
  constructor() {
    this.profileColumns = [
      'profile_url', 'full_name', 'first_name', 'last_name', 'headline', 'about',
      'last_activity', 'country', 'city', 'industry', 'email', 'phone', 'website',
      'current_job_title', 'current_job_start', 'current_job_end', 'current_job_location',
      'current_job_type', 'current_job_description', 'current_company_url',
      'company_name', 'company_industry', 'company_hq', 'company_size',
      'company_followers', 'company_website', 'company_type', 'company_specialties'
    ];
    
    this.companyColumns = [
      'company_url', 'company_id', 'company_name', 'company_industry', 'company_hq',
      'company_followers', 'company_employee_size', 'company_website', 'company_type',
      'company_specialties', 'company_associated_members'
    ];
    
    this.salesNavigatorColumns = [
      'search_url', 'profile_url', 'full_name', 'headline', 'current_title',
      'current_company', 'location', 'industry'
    ];
  }

  async exportToCSV(results, jobType) {
    try {
      let columns;
      let processedResults;
      
      switch (jobType) {
        case 'profiles':
          columns = this.profileColumns;
          processedResults = this.processProfileResults(results);
          break;
          
        case 'companies':
          columns = this.companyColumns;
          processedResults = this.processCompanyResults(results);
          break;
          
        case 'sales_navigator':
          columns = this.salesNavigatorColumns;
          processedResults = this.processSalesNavigatorResults(results);
          break;
          
        default:
          // Generic export for legacy results
          return this.exportGenericCSV(results);
      }
      
      // Create CSV header
      let csvContent = columns.join(',') + '\n';
      
      // Add data rows
      for (const result of processedResults) {
        const row = columns.map(column => {
          let value = result[column] || '';
          
          // Handle JSON fields
          if (typeof value === 'object' && value !== null) {
            value = JSON.stringify(value).replace(/"/g, '""');
          }
          
          // Escape commas and quotes in CSV
          if (typeof value === 'string') {
            value = value.replace(/"/g, '""');
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              value = `"${value}"`;
            }
          }
          
          return value;
        });
        
        csvContent += row.join(',') + '\n';
      }
      
      return csvContent;
      
    } catch (error) {
      console.error('❌ Error exporting to CSV:', error.message);
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }

  async exportToExcel(results, jobType) {
    try {
      let columns;
      let processedResults;
      let sheetName;
      
      switch (jobType) {
        case 'profiles':
          columns = this.profileColumns;
          processedResults = this.processProfileResults(results);
          sheetName = 'LinkedIn Profiles';
          break;
          
        case 'companies':
          columns = this.companyColumns;
          processedResults = this.processCompanyResults(results);
          sheetName = 'LinkedIn Companies';
          break;
          
        case 'sales_navigator':
          columns = this.salesNavigatorColumns;
          processedResults = this.processSalesNavigatorResults(results);
          sheetName = 'Sales Navigator Results';
          break;
          
        default:
          return this.exportGenericExcel(results);
      }
      
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      
      // Prepare data for Excel
      const excelData = processedResults.map(result => {
        const row = {};
        columns.forEach(column => {
          let value = result[column] || '';
          
          // Handle JSON fields for Excel
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              value = value.map(item => 
                typeof item === 'object' ? JSON.stringify(item) : item
              ).join('; ');
            } else {
              value = JSON.stringify(value);
            }
          }
          
          row[this.formatColumnHeader(column)] = value;
        });
        return row;
      });
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Set column widths
      const columnWidths = columns.map(column => {
        const maxLength = Math.max(
          column.length,
          ...processedResults.map(result => {
            const value = result[column];
            return value ? value.toString().length : 0;
          })
        );
        return { wch: Math.min(maxLength + 2, 50) }; // Max width of 50
      });
      
      worksheet['!cols'] = columnWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      return excelBuffer;
      
    } catch (error) {
      console.error('❌ Error exporting to Excel:', error.message);
      throw new Error(`Excel export failed: ${error.message}`);
    }
  }

  processProfileResults(results) {
    return results.map(result => {
      // Parse JSON fields
      const skills = this.parseJSONField(result.skills);
      const education = this.parseJSONField(result.education);
      const experience = this.parseJSONField(result.experience);
      const licenses = this.parseJSONField(result.licenses_certificates);
      
      return {
        ...result,
        skills: Array.isArray(skills) ? skills.join('; ') : skills,
        education: Array.isArray(education) ? 
          education.map(edu => `${edu.degree || ''} at ${edu.school || ''}`).join('; ') : education,
        experience: Array.isArray(experience) ? 
          experience.map(exp => `${exp.title || ''} at ${exp.company || ''}`).join('; ') : experience,
        licenses_certificates: Array.isArray(licenses) ? 
          licenses.map(lic => `${lic.name || ''} from ${lic.issuer || ''}`).join('; ') : licenses
      };
    });
  }

  processCompanyResults(results) {
    return results.map(result => {
      const associatedMembers = this.parseJSONField(result.company_associated_members);
      
      return {
        ...result,
        company_associated_members: Array.isArray(associatedMembers) ? 
          associatedMembers.map(member => `${member.name || ''} (${member.title || ''})`).join('; ') : associatedMembers
      };
    });
  }

  processSalesNavigatorResults(results) {
    // Sales Navigator results are already in the correct format
    return results.map(result => ({
      search_url: result.search_url,
      profile_url: result.profile_url,
      full_name: result.full_name,
      headline: result.headline,
      current_title: result.current_title,
      current_company: result.current_company,
      location: result.location,
      industry: result.industry
    }));
  }

  parseJSONField(field) {
    if (!field) return '';
    
    try {
      const { safeJsonParse } = require('../utils/responseValidator');
      const parseResult = safeJsonParse(field);
      
      if (parseResult.success) {
        return parseResult.data;
      } else {
        console.warn(`⚠️ Failed to parse JSON field: ${parseResult.error}`);
        return typeof field === 'string' ? field : {};
      }
    } catch (error) {
      console.warn(`⚠️ Error in parseJSONField: ${error.message}`);
      return typeof field === 'string' ? field : {};
    }
  }

  formatColumnHeader(column) {
    return column
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  exportGenericCSV(results) {
    if (results.length === 0) {
      return 'No results to export\n';
    }
    
    // Get all unique keys from results
    const allKeys = new Set();
    results.forEach(result => {
      Object.keys(result).forEach(key => allKeys.add(key));
    });
    
    const columns = Array.from(allKeys);
    
    // Create CSV header
    let csvContent = columns.join(',') + '\n';
    
    // Add data rows
    for (const result of results) {
      const row = columns.map(column => {
        let value = result[column] || '';
        
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value).replace(/"/g, '""');
        }
        
        if (typeof value === 'string') {
          value = value.replace(/"/g, '""');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value}"`;
          }
        }
        
        return value;
      });
      
      csvContent += row.join(',') + '\n';
    }
    
    return csvContent;
  }

  exportGenericExcel(results) {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = ExportService;