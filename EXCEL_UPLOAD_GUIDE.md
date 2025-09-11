# Excel Upload Features Guide

This LinkedIn automation tool now supports Excel/CSV file uploads for bulk operations. Here's how to use each feature:

## 1. Add Accounts via Excel Upload

### File Format Requirements:
- **Supported formats**: .xlsx, .xls, .csv
- **Required columns**: `name`, `cookies`
- **Maximum file size**: 10MB

### Sample Excel Structure:
```
name                | cookies
--------------------|------------------------------------------
Sales Account 1     | li_at=AQEDAVIYJnMDhdEQ...
Marketing Account   | li_at=BQFEBWJZK4P...
HR Account         | li_at=CQGFCXKZL5Q...
```

### How to Use:
1. Go to **LinkedIn Accounts** page
2. Click **Upload Excel** button (green button)
3. Select your Excel/CSV file
4. Preview the data and click **Upload Accounts**
5. The system will validate each LinkedIn cookie and add valid accounts

### Features:
- ✅ Automatic LinkedIn cookie validation
- ✅ Batch processing with success/failure reporting
- ✅ Real-time progress tracking
- ✅ Detailed error messages for failed accounts

---

## 2. Bulk Search Result Export

### File Format Requirements:
- **Supported formats**: .xlsx, .xls, .csv
- **Required columns**: `url`, `urls`, `search url`, or `linkedin url`
- **Maximum file size**: 10MB

### Sample Excel Structure:
```
url
------------------------------------------------------------
https://www.linkedin.com/search/results/people/?keywords=software%20engineer
https://www.linkedin.com/search/results/people/?keywords=data%20scientist
https://www.linkedin.com/search/results/people/?keywords=product%20manager
```

### How to Use:
1. Go to **Jobs** page
2. Click **Bulk Search** button (purple button)
3. Select your Excel/CSV file with LinkedIn search URLs
4. Preview the URLs and click **Start Bulk Export**
5. Monitor progress in real-time
6. Results will be combined into a single dataset

### Features:
- ✅ Background job processing
- ✅ Real-time progress tracking
- ✅ URL validation
- ✅ Error handling per URL
- ✅ Combined results export

---

## 3. Bulk Company Scraping

### File Format Requirements:
- **Supported formats**: .xlsx, .xls, .csv
- **Required columns**: `url`, `company url`, `company_url`, or `linkedin url`
- **Maximum file size**: 10MB

### Sample Excel Structure:
```
company url
--------------------------------------------
https://www.linkedin.com/company/microsoft
https://www.linkedin.com/company/google
https://www.linkedin.com/company/apple
https://www.linkedin.com/company/amazon
```

### How to Use:
1. Go to **Jobs** page
2. Click **Bulk Company** button (orange button)
3. Select your Excel/CSV file with LinkedIn company URLs
4. Preview the URLs and click **Start Bulk Scraping**
5. Monitor progress (company scraping takes longer due to detailed data extraction)
6. Results will be combined into a single dataset

### Features:
- ✅ Background job processing with longer intervals
- ✅ Real-time progress tracking
- ✅ Company URL validation
- ✅ Detailed company profile extraction
- ✅ Error handling per company

---

## Technical Implementation

### Backend Features:
- **File Processing**: Multer middleware for secure file uploads
- **Excel Parsing**: XLSX library for .xlsx/.xls files, CSV parsing for .csv files
- **Cookie Validation**: Automatic LinkedIn cookie verification via axios requests
- **Background Jobs**: Asynchronous processing with job queue system
- **Progress Tracking**: Real-time status updates via polling endpoints
- **Error Handling**: Comprehensive error reporting per item

### Frontend Features:
- **Drag & Drop**: Intuitive file upload interface
- **File Validation**: Format and size checking before upload
- **Live Preview**: Display first 5 rows before processing
- **Progress Bars**: Visual progress indicators
- **Real-time Updates**: Live status polling during processing
- **Error Display**: Detailed success/failure reporting

### API Endpoints:
```
POST /api/accounts/upload        # Upload Excel file with LinkedIn accounts
POST /api/search/export-bulk     # Start bulk search export job
GET  /api/search/jobs/:id/status # Check bulk search job status
POST /api/company/scrape-bulk    # Start bulk company scraping job
GET  /api/company/jobs/:id/status # Check bulk company job status
```

---

## Sample Files

Create these sample files to test the features:

### accounts_sample.csv
```csv
name,cookies
Test Account 1,li_at=AQEDAVIYJnMDhdEQ...
Test Account 2,li_at=BQFEBWJZK4P...
```

### search_urls_sample.csv
```csv
url
https://www.linkedin.com/search/results/people/?keywords=software%20engineer
https://www.linkedin.com/search/results/people/?keywords=data%20scientist
```

### company_urls_sample.csv
```csv
company url
https://www.linkedin.com/company/microsoft
https://www.linkedin.com/company/google
```

---

## Error Messages & Troubleshooting

### Common Error Messages:
- **"Invalid cookies. Please add account manually"**: LinkedIn cookie is expired or invalid
- **"File must contain 'name' and 'cookies' columns"**: Missing required columns in Excel file
- **"No valid LinkedIn search URLs found"**: URLs in file are not valid LinkedIn search URLs
- **"File size must be less than 10MB"**: File exceeds size limit

### Troubleshooting Tips:
1. **Cookie Issues**: Ensure LinkedIn cookies are fresh and include the `li_at` value
2. **File Format**: Use exact column names as specified in the guide
3. **URL Format**: Ensure URLs are complete and valid LinkedIn URLs
4. **File Size**: Keep files under 10MB for optimal performance

---

## Security & Best Practices

### Security Features:
- ✅ **Cookie Encryption**: All LinkedIn cookies are encrypted before storage
- ✅ **User Isolation**: Accounts are tied to specific users
- ✅ **Input Validation**: Comprehensive validation at all levels
- ✅ **File Validation**: Strict file type and size checking
- ✅ **Rate Limiting**: Built-in delays to prevent LinkedIn blocking

### Best Practices:
1. **Cookie Management**: Regularly update LinkedIn cookies to maintain validity
2. **Batch Size**: Keep Excel files reasonable in size (under 1000 rows recommended)
3. **Monitoring**: Monitor job progress and check for errors
4. **Rate Limits**: Respect LinkedIn's rate limits to avoid account blocking

---

Your LinkedIn automation tool is now equipped with powerful Excel upload capabilities for efficient bulk operations! 🚀