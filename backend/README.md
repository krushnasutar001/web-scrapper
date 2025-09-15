# LinkedIn Automation SaaS Backend - Refactored

## 🚀 Complete System Overhaul

This is a **completely refactored** version of the LinkedIn scraping tool with:

- ✅ **Real MySQL Database** (no more in-memory arrays)
- ✅ **MVC Architecture** (proper separation of concerns)
- ✅ **Job Queue System** (actual job processing)
- ✅ **Authentication System** (JWT with refresh tokens)
- ✅ **Real-time Progress Tracking** (live job updates)
- ✅ **Export System** (CSV, Excel, JSON downloads)
- ✅ **Pause/Resume/Cancel** (full job control)
- ✅ **Error Handling & Logging** (comprehensive debugging)

## 🏗️ Architecture Overview

```
backend/
├── controllers/          # Business logic
│   ├── authController.js
│   ├── accountController.js
│   ├── jobController.js
│   └── dashboardController.js
├── models/              # Database models
│   ├── User.js
│   ├── LinkedInAccount.js
│   └── Job.js
├── routes/              # API endpoints
│   ├── auth.js
│   ├── accounts.js
│   ├── jobs.js
│   └── dashboard.js
├── services/            # Core services
│   ├── jobWorker.js
│   └── exportService.js
├── middleware/          # Authentication & validation
│   └── auth.js
├── utils/               # Utilities
│   └── database.js
├── database/            # Database schema
│   └── schema.sql
└── server.js           # Main application
```

## 🔧 Setup Instructions

### 1. Prerequisites

- **Node.js** >= 16.0.0
- **MySQL** >= 8.0
- **npm** >= 8.0.0

### 2. Database Setup

```bash
# Install MySQL and create database
mysql -u root -p
CREATE DATABASE linkedin_automation_saas;
EXIT;
```

### 3. Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

### 4. Environment Configuration

Update `.env` file:

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=linkedin_automation_saas

# JWT Secrets (change these!)
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key
```

### 5. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start

# Legacy server (old version)
npm run legacy
```

## 📊 Database Schema

The system uses 6 main tables:

- **users** - User accounts and authentication
- **linkedin_accounts** - LinkedIn account management
- **jobs** - Job definitions and status
- **job_urls** - URLs to be processed
- **job_results** - Scraped data results
- **job_account_assignments** - Job-account relationships

## 🔄 Job Processing Flow

1. **Job Creation** → Validates URLs and creates database records
2. **Queue Addition** → Adds job to processing queue
3. **Worker Processing** → Processes URLs one by one
4. **Progress Updates** → Real-time status updates in database
5. **Result Storage** → Saves scraped data to database
6. **Completion** → Marks job as completed with statistics

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/profile` - Get user profile

### LinkedIn Accounts
- `GET /api/linkedin-accounts` - Get all accounts
- `GET /api/linkedin-accounts/available` - Get available accounts
- `POST /api/linkedin-accounts` - Add new account
- `PUT /api/linkedin-accounts/:id` - Update account
- `DELETE /api/linkedin-accounts/:id` - Delete account

### Jobs
- `GET /api/jobs` - Get all jobs
- `POST /api/jobs` - Create new job (with file upload)
- `GET /api/jobs/:id/status` - Get job progress
- `POST /api/jobs/:id/pause` - Pause job
- `POST /api/jobs/:id/resume` - Resume job
- `POST /api/jobs/:id/cancel` - Cancel job
- `GET /api/jobs/:id/download/:format` - Download results

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/analytics/jobs` - Job analytics
- `GET /api/dashboard/analytics/accounts` - Account analytics

## 🎯 Key Fixes Implemented

### ❌ **Before (Issues)**
- Jobs showed "failed" immediately
- Fake accounts (Test Account 1/2/3) displayed
- Dashboard showed "0 URLs", "Invalid Date"
- No real scraping process
- Data lost on server restart
- No progress tracking
- No pause/resume functionality

### ✅ **After (Solutions)**
- Jobs start scraping immediately
- Only user-added accounts with custom names
- Real statistics from database
- Actual URL processing with progress
- Persistent data storage
- Real-time progress updates
- Full job control (pause/resume/cancel)

## 🔍 Testing the System

### 1. Add LinkedIn Account
```bash
curl -X POST http://localhost:5000/api/linkedin-accounts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_name": "My LinkedIn Account",
    "email": "my.email@company.com"
  }'
```

### 2. Create Job
```bash
curl -X POST http://localhost:5000/api/jobs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobType": "profile_scraping",
    "jobName": "Test Scraping Job",
    "urls": "https://linkedin.com/in/example1\nhttps://linkedin.com/in/example2"
  }'
```

### 3. Monitor Progress
```bash
curl -X GET http://localhost:5000/api/jobs/JOB_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📈 Performance Improvements

- **Database Indexing** - Optimized queries for fast data retrieval
- **Connection Pooling** - Efficient database connection management
- **Job Queue** - Concurrent job processing (max 3 simultaneous)
- **Rate Limiting** - Prevents API abuse and LinkedIn blocking
- **Caching** - Reduced database queries for frequently accessed data

## 🛡️ Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt with salt rounds
- **Rate Limiting** - API endpoint protection
- **Input Validation** - Prevents SQL injection and XSS
- **CORS Configuration** - Controlled cross-origin requests

## 📊 Monitoring & Logging

- **Comprehensive Logging** - All operations logged with timestamps
- **Error Tracking** - Detailed error messages and stack traces
- **Performance Metrics** - Job completion times and success rates
- **Health Checks** - Database and system status monitoring

## 🚀 Production Deployment

### Environment Variables
```env
NODE_ENV=production
DB_HOST=your-production-db-host
JWT_SECRET=your-production-jwt-secret
```

### PM2 Process Manager
```bash
npm install -g pm2
pm2 start server.js --name "linkedin-automation"
pm2 startup
pm2 save
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check MySQL service
   sudo systemctl status mysql
   
   # Verify credentials in .env
   mysql -u root -p
   ```

2. **Jobs Not Starting**
   ```bash
   # Check job worker logs
   tail -f logs/app.log
   
   # Restart job worker
   npm run worker:start
   ```

3. **Authentication Issues**
   ```bash
   # Verify JWT secret in .env
   # Check token expiration
   # Clear browser localStorage
   ```

### Debug Mode
```bash
DEBUG=* npm run dev
```

## 📚 API Documentation

Full API documentation available at:
- Development: `http://localhost:5000/api/docs`
- Postman Collection: `docs/postman_collection.json`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---

**🎉 The system is now production-ready with real database persistence, proper job processing, and comprehensive error handling!**