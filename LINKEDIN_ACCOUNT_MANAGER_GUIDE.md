# LinkedIn Account Manager - Complete Setup Guide

## 🚀 Overview

A comprehensive LinkedIn account management tool with:
- **Node.js/Express.js** backend with MySQL database
- **Playwright** browser automation for validation
- **React** frontend with Tailwind CSS
- **Automatic validation** with cron jobs
- **Proxy support** and custom user agents
- **Real-time status tracking**

## 📋 Requirements

- Node.js 16+ 
- MySQL 8.0+
- Modern web browser
- LinkedIn cookies (exported from browser)

## 🛠️ Installation & Setup

### 1. Backend Setup

```bash
# Navigate to backend directory
cd linkedin-automation-saas/backend

# Install dependencies
npm install express mysql2 cors multer playwright node-cron dotenv axios

# Install Playwright browsers
npx playwright install

# Install nodemon for development (optional)
npm install -D nodemon
```

### 2. Database Setup

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS linkedin_automation;"

# Import schema
mysql -u root -p linkedin_automation < linkedin-account-manager-schema.sql
```

### 3. Environment Configuration

Create `.env` file in backend directory:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=linkedin_automation

# Server Configuration
PORT=3001

# Optional: Validation Settings
VALIDATION_INTERVAL_MINUTES=5
MAX_CONCURRENT_VALIDATIONS=3
```

### 4. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies (if not already installed)
npm install axios

# Add environment variable for API URL
echo "REACT_APP_API_URL=http://localhost:3001" > .env
```

## 🚀 Running the Application

### Start Backend Server

```bash
# From backend directory
cd backend

# Production mode
node linkedin-account-manager.js

# Development mode (with auto-restart)
npm run dev
```

**Expected Output:**
```
✅ Database connected successfully
🚀 LinkedIn Account Manager Server Started
📡 Server running on port 3001
🔗 Health check: http://localhost:3001/health
📋 API endpoints:
   GET    /api/accounts - List accounts
   POST   /api/accounts - Add account
   GET    /api/accounts/:id - Get account
   DELETE /api/accounts/:id - Delete account
   POST   /api/accounts/:id/validate - Validate account
   GET    /api/stats - Get statistics
⏰ Validation worker: Every 5 minutes
```

### Start Frontend (Option 1: Standalone)

```bash
# From frontend directory
cd frontend

# Start React development server
npm start
```

### Start Frontend (Option 2: Integrated)

Add to your existing React app:

```jsx
// In your main App.js or routing file
import LinkedInManagerApp from './LinkedInManagerApp';

// Add route or component
<Route path="/linkedin-manager" component={LinkedInManagerApp} />
```

## 📊 Database Schema

### linkedin_accounts Table

```sql
CREATE TABLE linkedin_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cookies JSON NOT NULL,
    proxy_url VARCHAR(500) NULL,
    user_agent TEXT NULL,
    status ENUM('pending', 'valid', 'invalid') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_validated_at TIMESTAMP NULL,
    validation_error TEXT NULL
);
```

### validation_logs Table

```sql
CREATE TABLE validation_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    status ENUM('valid', 'invalid') NOT NULL,
    validation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT NULL,
    response_time_ms INT NULL,
    FOREIGN KEY (account_id) REFERENCES linkedin_accounts(id) ON DELETE CASCADE
);
```

## 🔧 API Endpoints

### GET /api/accounts
**List all accounts**

```bash
curl http://localhost:3001/api/accounts
```

Response:
```json
{
  "success": true,
  "accounts": [
    {
      "id": 1,
      "name": "John Doe LinkedIn",
      "status": "valid",
      "proxy_url": null,
      "user_agent": null,
      "created_at": "2024-01-01T10:00:00.000Z",
      "last_validated_at": "2024-01-01T10:05:00.000Z",
      "validation_error": null
    }
  ]
}
```

### POST /api/accounts
**Add new account**

```bash
# With file upload
curl -X POST http://localhost:3001/api/accounts \
  -F "name=John Doe LinkedIn" \
  -F "cookiesFile=@cookies.json" \
  -F "proxy_url=http://proxy.example.com:8080" \
  -F "user_agent=Mozilla/5.0..."

# With JSON cookies
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe LinkedIn",
    "cookies": [{"name":"li_at","value":"cookie_value","domain":".linkedin.com"}],
    "proxy_url": "http://proxy.example.com:8080"
  }'
```

### POST /api/accounts/:id/validate
**Manually validate account**

```bash
curl -X POST http://localhost:3001/api/accounts/1/validate
```

### GET /api/stats
**Get validation statistics**

```bash
curl http://localhost:3001/api/stats
```

Response:
```json
{
  "success": true,
  "stats": {
    "total": 10,
    "valid": 7,
    "invalid": 2,
    "pending": 1
  }
}
```

## 🍪 Cookie Export Guide

### Method 1: Browser Extension (Recommended)

1. Install "Cookie Editor" or "EditThisCookie" extension
2. Navigate to LinkedIn while logged in
3. Open extension and export cookies for `linkedin.com` domain
4. Save as JSON file

### Method 2: Developer Tools

1. Open LinkedIn in browser (logged in)
2. Press F12 → Application → Cookies → https://www.linkedin.com
3. Copy all cookie values
4. Format as JSON array:

```json
[
  {
    "name": "li_at",
    "value": "AQEDAVIYJnMEMkOTAAABmR7Mn30AAAGZQtkjfU0AKhtt5629U5o1HPZck8LzDXMnFQAKSr8afXu6UsGc2nXzPQ6QvIAHSxCanTYAp2Y-WWzSEhdIkRifsIm3jT8RM3mMJNGl3NpnYnDT7jWeQshZGih2",
    "domain": ".linkedin.com",
    "path": "/",
    "expires": 1756899252,
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
  },
  {
    "name": "JSESSIONID",
    "value": "ajax:1234567890123456789",
    "domain": ".linkedin.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
  }
]
```

## 🔄 Validation Process

### Automatic Validation
- Runs every 5 minutes via cron job
- Processes accounts with `pending` status
- Updates status to `valid` or `invalid`
- Logs validation results

### Manual Validation
- Click "Validate" button in UI
- Or use API endpoint
- Immediate validation with real-time results

### Validation Logic

```javascript
// Playwright validation function
async function validateLinkedInAccount(account) {
  // 1. Launch browser with optional proxy
  // 2. Create context with user agent
  // 3. Add cookies to context
  // 4. Navigate to https://www.linkedin.com/feed/
  // 5. Check for login indicators
  // 6. Look for authenticated elements
  // 7. Return validation result
}
```

## 🎯 Frontend Features

### Account Management
- ✅ Add accounts with cookies (file upload or JSON paste)
- ✅ View account list with status badges
- ✅ Manual validation with real-time feedback
- ✅ Delete accounts
- ✅ Auto-refresh every 30 seconds

### Status Indicators
- 🟢 **Valid**: Account successfully logged in
- 🔴 **Invalid**: Login failed or cookies expired
- 🟡 **Pending**: Waiting for validation

### Statistics Dashboard
- Total accounts count
- Valid/Invalid/Pending breakdown
- Success rate percentage

## 🔧 Configuration Options

### Validation Settings

```javascript
// In linkedin-account-manager.js

// Change validation interval (default: 5 minutes)
cron.schedule('*/10 * * * *', runValidationWorker); // Every 10 minutes

// Adjust validation timeout
const VALIDATION_TIMEOUT = 30000; // 30 seconds

// Modify concurrent validations
const MAX_CONCURRENT = 3; // Process 3 accounts at once
```

### Browser Settings

```javascript
// Custom browser options
const browserOptions = {
  headless: true, // Set to false for debugging
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ]
};

// Custom context options
const contextOptions = {
  userAgent: 'Custom User Agent',
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
  timezoneId: 'America/New_York'
};
```

## 🚨 Troubleshooting

### Common Issues

#### 1. "Database connection failed"
```bash
# Check MySQL service
sudo systemctl status mysql

# Verify credentials
mysql -u root -p

# Check database exists
SHOW DATABASES;
```

#### 2. "Playwright browser not found"
```bash
# Install browsers
npx playwright install

# Install system dependencies (Linux)
npx playwright install-deps
```

#### 3. "Validation always fails"
- Check if cookies are fresh and valid
- Verify LinkedIn account is not locked
- Test cookies manually in browser
- Check proxy connectivity (if used)

#### 4. "CORS errors in frontend"
```javascript
// Ensure CORS is enabled in backend
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true
}));
```

### Debug Mode

```javascript
// Enable debug logging
const browserOptions = {
  headless: false, // Show browser
  slowMo: 1000,   // Slow down actions
  devtools: true  // Open DevTools
};
```

## 📈 Performance Optimization

### Database Indexing
```sql
-- Add indexes for better performance
CREATE INDEX idx_status ON linkedin_accounts(status);
CREATE INDEX idx_last_validated ON linkedin_accounts(last_validated_at);
CREATE INDEX idx_created_at ON linkedin_accounts(created_at);
```

### Validation Optimization
- Limit concurrent validations
- Use connection pooling for database
- Implement validation queuing
- Cache validation results

## 🔒 Security Best Practices

1. **Environment Variables**: Store sensitive data in `.env`
2. **Input Validation**: Validate all user inputs
3. **SQL Injection**: Use parameterized queries
4. **Cookie Security**: Store cookies securely
5. **Rate Limiting**: Implement API rate limiting
6. **HTTPS**: Use HTTPS in production

## 🚀 Production Deployment

### Backend Deployment

```bash
# Using PM2
npm install -g pm2
pm2 start linkedin-account-manager.js --name "linkedin-manager"

# Using Docker
docker build -t linkedin-manager .
docker run -p 3001:3001 linkedin-manager
```

### Frontend Deployment

```bash
# Build for production
npm run build

# Serve with nginx or deploy to Vercel/Netlify
```

### Environment Variables (Production)

```env
NODE_ENV=production
DB_HOST=your-production-db-host
DB_USER=your-db-user
DB_PASSWORD=your-secure-password
DB_NAME=linkedin_automation
PORT=3001
```

## 📊 Monitoring & Logging

### Health Check
```bash
curl http://localhost:3001/health
```

### Validation Logs
```sql
-- View recent validation attempts
SELECT 
  la.name,
  vl.status,
  vl.validation_time,
  vl.response_time_ms,
  vl.error_message
FROM validation_logs vl
JOIN linkedin_accounts la ON vl.account_id = la.id
ORDER BY vl.validation_time DESC
LIMIT 10;
```

## 🎯 Usage Examples

### Adding Account via API

```javascript
// JavaScript example
const formData = new FormData();
formData.append('name', 'John Doe LinkedIn');
formData.append('cookiesFile', cookiesFile);
formData.append('proxy_url', 'http://proxy.example.com:8080');

fetch('http://localhost:3001/api/accounts', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

### Bulk Account Import

```javascript
// Import multiple accounts
const accounts = [
  { name: 'Account 1', cookies: cookies1 },
  { name: 'Account 2', cookies: cookies2 }
];

for (const account of accounts) {
  await fetch('http://localhost:3001/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account)
  });
}
```

---

## 🎉 You're All Set!

Your LinkedIn Account Manager is now ready to:
- ✅ Manage multiple LinkedIn accounts
- ✅ Validate cookies automatically
- ✅ Track account status in real-time
- ✅ Support proxies and custom user agents
- ✅ Provide a beautiful React UI

**Access your application:**
- Backend API: http://localhost:3001
- Frontend UI: http://localhost:3000
- Health Check: http://localhost:3001/health

**Need help?** Check the troubleshooting section or review the API documentation above.