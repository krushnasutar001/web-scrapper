# Scralytics Hub - LinkedIn Automation Platform

**Automate. Enrich. Analyze.**

A comprehensive LinkedIn automation and data analytics SaaS platform built with Node.js, React, and Docker. Scralytics Hub empowers users to automate LinkedIn data extraction for profiles, companies, job postings, and search results with a modern web dashboard and powerful analytics capabilities.

## 🚀 Features

### Core Functionality
- **Multi-type Scraping**: Profiles, companies, job postings, and general search
- **Automated Scheduling**: Cron-based job scheduling with retry mechanisms
- **Data Quality Assessment**: Automatic quality scoring and deduplication
- **Multi-format Export**: CSV, Excel, and JSON export capabilities
- **Real-time Progress**: Live job progress tracking and status updates

### Security & Authentication
- **JWT Authentication**: Secure token-based authentication
- **AES-256 Encryption**: Encrypted credential storage
- **Rate Limiting**: User and IP-based rate limiting
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin resource sharing

### User Experience
- **Modern Dashboard**: React-based responsive UI with TailwindCSS
- **Real-time Updates**: Live job status and progress updates
- **Data Visualization**: Charts and statistics for job performance
- **Comprehensive API**: RESTful API with Swagger documentation

## 🏗️ Architecture

```
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── config/         # Database and app configuration
│   │   ├── controllers/    # API route controllers
│   │   ├── middleware/     # Authentication and validation
│   │   ├── models/         # Sequelize database models
│   │   ├── routes/         # Express route definitions
│   │   ├── services/       # Business logic and scraping
│   │   └── utils/          # Utilities and helpers
│   ├── Dockerfile
│   └── package.json
├── frontend/               # React dashboard
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React context providers
│   │   ├── pages/          # Application pages
│   │   ├── services/       # API service layer
│   │   └── utils/          # Frontend utilities
│   ├── Dockerfile
│   └── package.json
├── database/               # Database initialization
├── docker-compose.yml      # Container orchestration
└── .env.example           # Environment variables template
```

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL 8.0 (SQLite for development)
- **ORM**: Sequelize
- **Scraping**: Puppeteer, Playwright, Cheerio
- **Authentication**: JWT, bcrypt
- **Security**: Helmet, CORS, Rate limiting
- **Documentation**: Swagger/OpenAPI
- **Logging**: Winston with file rotation

### Frontend
- **Framework**: React 18
- **Styling**: TailwindCSS
- **State Management**: React Context + useReducer
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **Forms**: React Hook Form
- **Charts**: Chart.js, Recharts
- **Notifications**: React Hot Toast

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx (for frontend)
- **Database**: MySQL 8.0
- **Environment**: Multi-stage Docker builds

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd linkedin-automation-saas
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 3. Docker Deployment (Recommended)
```bash
# Build and start all services
docker-compose build
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 4. Access the Application
- **Frontend Dashboard**: http://localhost:3000
 - **Backend API**: http://localhost:5001
 - **API Documentation**: http://localhost:5001/docs
 - **Health Check**: http://localhost:5001/health

## 🔧 Local Development

### Backend Development
```bash
cd backend
npm install
npm run dev
```

### Frontend Development
```bash
cd frontend
npm install
npm start
```

### Database Setup
```bash
# Run migrations
cd backend
npm run migrate

# Seed sample data (optional)
npm run seed
```

## 📋 Environment Variables

### Required Variables
```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=linkedin_automation
DB_USER=root
DB_PASSWORD=password
DB_DIALECT=mysql

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=your-32-character-encryption-key

# Server
PORT=5000
NODE_ENV=development
API_URL=http://localhost:5001
FRONTEND_URL=http://localhost:3000
```

### Optional Variables
```env
# Scraping Configuration
SCRAPE_DELAY_MIN=2000
SCRAPE_DELAY_MAX=5000
MAX_RETRIES=3
MAX_CONCURRENT_JOBS=3

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Proxy (Optional)
PROXY_HOST=
PROXY_PORT=
PROXY_USERNAME=
PROXY_PASSWORD=
```

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update profile
- `PUT /api/auth/password` - Change password
- `POST /api/auth/logout` - Logout

### Job Management
- `POST /api/jobs` - Create scraping job
- `GET /api/jobs` - List user jobs
- `GET /api/jobs/:id` - Get job details
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/cancel` - Cancel job
- `POST /api/jobs/:id/retry` - Retry failed job
- `GET /api/jobs/stats` - Job statistics

### Results Management
- `GET /api/results/:jobId` - Get job results
- `GET /api/results/:jobId/export` - Export results
- `GET /api/results/:jobId/:resultId` - Get single result
- `PUT /api/results/:jobId/:resultId` - Update result
- `DELETE /api/results/:jobId/:resultId` - Delete result

### Complete API Documentation
Visit http://localhost:5001/docs for interactive Swagger documentation.

## 🎯 Usage Examples

### Creating a Profile Scraping Job
```javascript
// API Request
POST /api/jobs
{
  "type": "profile",
  "query": "software engineer",
  "maxResults": 50,
  "configuration": {
    "location": "San Francisco",
    "industry": "Technology"
  }
}

// Response
{
  "success": true,
  "data": {
    "jobId": "uuid-here",
    "status": "queued",
    "type": "profile",
    "query": "software engineer",
    "maxResults": 50
  }
}
```

### Exporting Results
```javascript
// Export as CSV
GET /api/results/{jobId}/export?format=csv

// Export as Excel
GET /api/results/{jobId}/export?format=excel

// Export high-quality results only
GET /api/results/{jobId}/export?format=json&quality=high
```

## 🔒 Security Features

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Password strength validation
- Account lockout protection
- Secure password reset flow

### Data Protection
- AES-256 encryption for sensitive data
- Input sanitization and validation
- SQL injection prevention
- XSS protection

### Rate Limiting
- Global rate limiting per IP
- User-specific rate limiting
- Job creation rate limiting
- API endpoint protection

## 📊 Monitoring & Logging

### Logging
- Structured logging with Winston
- Daily log rotation
- Separate logs for errors, HTTP requests, and scraping
- Performance monitoring

### Health Checks
- Application health endpoint
- Database connectivity checks
- Service status monitoring
- Docker health checks

## 🚀 Deployment

### Production Deployment
```bash
# Set production environment
export NODE_ENV=production

# Build and deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Scaling Considerations
- Horizontal scaling with load balancers
- Database read replicas
- Redis for session storage
- CDN for static assets

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
npm run test:coverage
```

### Frontend Tests
```bash
cd frontend
npm test
npm run test:coverage
```

## 🛠️ Development Tools

### Code Quality
- ESLint for code linting
- Prettier for code formatting
- Husky for git hooks
- Jest for testing

### Database Tools
```bash
# Database migrations
npm run migrate
npm run migrate:undo

# Database seeding
npm run seed
npm run seed:undo
```

## 📈 Performance Optimization

### Backend Optimizations
- Connection pooling
- Query optimization
- Caching strategies
- Compression middleware

### Frontend Optimizations
- Code splitting
- Lazy loading
- Image optimization
- Bundle analysis

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database status
docker-compose logs db

# Reset database
docker-compose down -v
docker-compose up -d
```

#### Scraping Issues
```bash
# Check browser dependencies
docker-compose exec backend npm run test:browser

# View scraping logs
docker-compose logs backend | grep scraping
```

#### Frontend Build Issues
```bash
# Clear cache and rebuild
cd frontend
npm run build
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
docker-compose up -d
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation
- Use conventional commits

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- Check the [Issues](../../issues) page
- Review the API documentation
- Check application logs
- Contact support team

### Reporting Issues
When reporting issues, please include:
- Environment details
- Steps to reproduce
- Error messages
- Log files

## 🔮 Roadmap

### Upcoming Features
- [ ] Advanced filtering and search
- [ ] Webhook notifications
- [ ] API rate limiting dashboard
- [ ] Advanced analytics
- [ ] Multi-tenant support
- [ ] Mobile application

### Performance Improvements
- [ ] Redis caching
- [ ] Database optimization
- [ ] CDN integration
- [ ] Load balancing

---

**Scralytics Hub** - *Automate. Enrich. Analyze.*  
© 2024 Scralytics Hub Team. All rights reserved.

**Built with ❤️ for LinkedIn automation and data extraction**