const WebSocket = require('ws');
const { logActivity, logError } = require('./loggingService');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // clientId -> { ws, userId, accountId, jobId }
    this.jobClients = new Map(); // jobId -> Set of clientIds
    
    this.setupWebSocketServer();
  }
  
  /**
   * Set up WebSocket server with event handlers
   */
  setupWebSocketServer() {
    console.log('🔌 Setting up WebSocket server...');
    
    this.wss.on('connection', (ws, req) => {
      console.log('🔗 New WebSocket connection');
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(ws, data);
        } catch (error) {
          console.error('❌ WebSocket message error:', error);
          this.sendError(ws, 'INVALID_MESSAGE', 'Invalid JSON message');
        }
      });
      
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
      
      // Send welcome message
      this.send(ws, {
        type: 'WELCOME',
        message: 'Connected to Scralytics Hub WebSocket'
      });
    });
    
    console.log('✅ WebSocket server setup completed');
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(ws, data) {
    const { type, payload } = data;
    
    console.log(`📨 WebSocket message: ${type}`, payload);
    
    switch (type) {
      case 'AUTH':
        await this.handleAuth(ws, payload);
        break;
        
      case 'JOB_START':
        await this.handleJobStart(ws, payload);
        break;
        
      case 'JOB_PROGRESS':
        await this.handleJobProgress(ws, payload);
        break;
        
      case 'JOB_RESULT':
        await this.handleJobResult(ws, payload);
        break;
        
      case 'JOB_ERROR':
        await this.handleJobError(ws, payload);
        break;
        
      case 'COOKIE_REFRESH':
        await this.handleCookieRefresh(ws, payload);
        break;
        
      case 'LOGIN_DETECTED':
        await this.handleLoginDetected(ws, payload);
        break;
        
      case 'HEARTBEAT':
        this.handleHeartbeat(ws, payload);
        break;
        
      default:
        this.sendError(ws, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${type}`);
    }
  }
  
  /**
   * Handle client authentication
   */
  async handleAuth(ws, payload) {
    try {
      const { jwt, userId, accountId } = payload;
      
      if (!jwt || !userId || !accountId) {
        this.sendError(ws, 'AUTH_FAILED', 'Missing authentication parameters');
        return;
      }
      
      // Verify JWT (simplified - in production use proper JWT verification)
      const decoded = JSON.parse(Buffer.from(jwt, 'base64').toString());
      
      if (decoded.userId !== userId || decoded.accountId !== accountId) {
        this.sendError(ws, 'AUTH_FAILED', 'Invalid JWT token');
        return;
      }
      
      // Generate client ID
      const clientId = `${userId}_${accountId}_${Date.now()}`;
      
      // Store client info
      this.clients.set(clientId, {
        ws: ws,
        userId: userId,
        accountId: accountId,
        jobId: null,
        authenticated: true,
        connectedAt: new Date()
      });
      
      // Store client ID in WebSocket for cleanup
      ws.clientId = clientId;
      
      // Send authentication success
      this.send(ws, {
        type: 'AUTH_SUCCESS',
        payload: {
          clientId: clientId,
          message: 'Authentication successful'
        }
      });
      
      // Log authentication
      await logActivity({
        userId: userId,
        jobId: null,
        action: 'WEBSOCKET_AUTH',
        details: { clientId, accountId }
      });
      
      console.log(`✅ Client authenticated: ${clientId}`);
      
    } catch (error) {
      console.error('❌ Authentication error:', error);
      this.sendError(ws, 'AUTH_ERROR', error.message);
    }
  }
  
  /**
   * Handle job start notification
   */
  async handleJobStart(ws, payload) {
    try {
      const client = this.getClientByWs(ws);
      if (!client || !client.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Client not authenticated');
        return;
      }
      
      const { jobId } = payload;
      
      if (!jobId) {
        this.sendError(ws, 'INVALID_PAYLOAD', 'Missing jobId');
        return;
      }
      
      // Update client with job ID
      client.jobId = jobId;
      
      // Add client to job clients map
      if (!this.jobClients.has(jobId)) {
        this.jobClients.set(jobId, new Set());
      }
      this.jobClients.get(jobId).add(ws.clientId);
      
      // Log job start
      await logActivity({
        userId: client.userId,
        jobId: jobId,
        action: 'JOB_START_WS',
        details: { clientId: ws.clientId, accountId: client.accountId }
      });
      
      console.log(`🚀 Job ${jobId} started for client ${ws.clientId}`);
      
      // Send acknowledgment
      this.send(ws, {
        type: 'JOB_START_ACK',
        payload: { jobId, status: 'started' }
      });
      
    } catch (error) {
      console.error('❌ Job start error:', error);
      this.sendError(ws, 'JOB_START_ERROR', error.message);
    }
  }
  
  /**
   * Handle job progress updates
   */
  async handleJobProgress(ws, payload) {
    try {
      const client = this.getClientByWs(ws);
      if (!client || !client.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Client not authenticated');
        return;
      }
      
      const { jobId, progress } = payload;
      
      if (!jobId || !progress) {
        this.sendError(ws, 'INVALID_PAYLOAD', 'Missing jobId or progress');
        return;
      }
      
      // Update job progress in database
      await this.updateJobProgress(jobId, progress);
      
      // Broadcast progress to all clients working on this job
      this.broadcastToJob(jobId, {
        type: 'JOB_PROGRESS_UPDATE',
        payload: { jobId, progress }
      });
      
      console.log(`📊 Job ${jobId} progress: ${progress.processed}/${progress.total}`);
      
    } catch (error) {
      console.error('❌ Job progress error:', error);
      this.sendError(ws, 'JOB_PROGRESS_ERROR', error.message);
    }
  }
  
  /**
   * Handle job result submission
   */
  async handleJobResult(ws, payload) {
    try {
      const client = this.getClientByWs(ws);
      if (!client || !client.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Client not authenticated');
        return;
      }
      
      const { jobId, url, data, status } = payload;
      
      if (!jobId || !url || !data || !status) {
        this.sendError(ws, 'INVALID_PAYLOAD', 'Missing required result fields');
        return;
      }
      
      // Save result to database
      await this.saveJobResult(jobId, url, data, status);
      
      // Log result
      await logActivity({
        userId: client.userId,
        jobId: jobId,
        action: 'JOB_RESULT_RECEIVED',
        details: { url, status, clientId: ws.clientId }
      });
      
      console.log(`📄 Job ${jobId} result received for URL: ${url}`);
      
      // Send acknowledgment
      this.send(ws, {
        type: 'JOB_RESULT_ACK',
        payload: { jobId, url, status: 'saved' }
      });
      
    } catch (error) {
      console.error('❌ Job result error:', error);
      this.sendError(ws, 'JOB_RESULT_ERROR', error.message);
    }
  }
  
  /**
   * Handle job errors
   */
  async handleJobError(ws, payload) {
    try {
      const client = this.getClientByWs(ws);
      if (!client || !client.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Client not authenticated');
        return;
      }
      
      const { jobId, errorType, errorMessage, errorDetails } = payload;
      
      if (!jobId || !errorType || !errorMessage) {
        this.sendError(ws, 'INVALID_PAYLOAD', 'Missing required error fields');
        return;
      }
      
      // Log error
      const errorId = await logError({
        jobId: jobId,
        linkedinAccountId: client.accountId,
        errorType: errorType,
        errorMessage: errorMessage,
        errorDetails: errorDetails || {}
      });
      
      console.log(`❌ Job ${jobId} error: ${errorType} - ${errorMessage}`);
      
      // Send error handling instructions
      this.send(ws, {
        type: 'ERROR_HANDLING',
        payload: {
          errorId: errorId,
          jobId: jobId,
          instructions: await this.getErrorHandlingInstructions(errorType)
        }
      });
      
    } catch (error) {
      console.error('❌ Job error handling error:', error);
      this.sendError(ws, 'JOB_ERROR_HANDLING_ERROR', error.message);
    }
  }
  
  /**
   * Handle cookie refresh requests
   */
  async handleCookieRefresh(ws, payload) {
    try {
      const client = this.getClientByWs(ws);
      if (!client || !client.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Client not authenticated');
        return;
      }
      
      const { accountId, cookies } = payload;
      
      if (!accountId || !cookies) {
        this.sendError(ws, 'INVALID_PAYLOAD', 'Missing accountId or cookies');
        return;
      }
      
      // Update cookies in database
      await this.updateAccountCookies(accountId, cookies);
      
      // Log cookie refresh
      await logActivity({
        userId: client.userId,
        jobId: client.jobId,
        action: 'COOKIE_REFRESH',
        details: { accountId, clientId: ws.clientId }
      });
      
      console.log(`🍪 Cookies refreshed for account ${accountId}`);
      
      // Send acknowledgment
      this.send(ws, {
        type: 'COOKIE_REFRESH_ACK',
        payload: { accountId, status: 'updated' }
      });
      
    } catch (error) {
      console.error('❌ Cookie refresh error:', error);
      this.sendError(ws, 'COOKIE_REFRESH_ERROR', error.message);
    }
  }
  
  /**
   * Handle login page detection
   */
  async handleLoginDetected(ws, payload) {
    try {
      const client = this.getClientByWs(ws);
      if (!client || !client.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Client not authenticated');
        return;
      }
      
      const { jobId, url } = payload;
      
      // Log login detection
      await logError({
        jobId: jobId,
        linkedinAccountId: client.accountId,
        errorType: 'LOGIN_REDIRECT',
        errorMessage: 'Login page detected during scraping',
        errorDetails: { url, clientId: ws.clientId }
      });
      
      console.log(`🔐 Login detected for job ${jobId} at URL: ${url}`);
      
      // Send cookie refresh instruction
      this.send(ws, {
        type: 'REFRESH_COOKIES_REQUIRED',
        payload: {
          jobId: jobId,
          url: url,
          message: 'Please refresh cookies and retry'
        }
      });
      
    } catch (error) {
      console.error('❌ Login detection error:', error);
      this.sendError(ws, 'LOGIN_DETECTION_ERROR', error.message);
    }
  }
  
  /**
   * Handle heartbeat messages
   */
  handleHeartbeat(ws, payload) {
    const client = this.getClientByWs(ws);
    if (client) {
      client.lastHeartbeat = new Date();
    }
    
    // Send heartbeat response
    this.send(ws, {
      type: 'HEARTBEAT_ACK',
      payload: { timestamp: Date.now() }
    });
  }
  
  /**
   * Handle client disconnection
   */
  handleDisconnection(ws) {
    if (ws.clientId) {
      const client = this.clients.get(ws.clientId);
      
      if (client) {
        console.log(`🔌 Client disconnected: ${ws.clientId}`);
        
        // Remove from job clients
        if (client.jobId && this.jobClients.has(client.jobId)) {
          this.jobClients.get(client.jobId).delete(ws.clientId);
          
          if (this.jobClients.get(client.jobId).size === 0) {
            this.jobClients.delete(client.jobId);
          }
        }
        
        // Remove client
        this.clients.delete(ws.clientId);
      }
    }
  }
  
  /**
   * Send message to WebSocket client
   */
  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  
  /**
   * Send error message to WebSocket client
   */
  sendError(ws, errorType, errorMessage) {
    this.send(ws, {
      type: 'ERROR',
      payload: {
        errorType: errorType,
        errorMessage: errorMessage,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Broadcast message to all clients working on a specific job
   */
  broadcastToJob(jobId, message) {
    const clientIds = this.jobClients.get(jobId);
    
    if (clientIds) {
      for (const clientId of clientIds) {
        const client = this.clients.get(clientId);
        if (client && client.ws) {
          this.send(client.ws, message);
        }
      }
    }
  }
  
  /**
   * Get client by WebSocket connection
   */
  getClientByWs(ws) {
    if (ws.clientId) {
      return this.clients.get(ws.clientId);
    }
    return null;
  }
  
  /**
   * Update job progress in database
   */
  async updateJobProgress(jobId, progress) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      await connection.execute(`
        UPDATE jobs SET 
          processed_urls = ?, 
          successful_urls = ?, 
          failed_urls = ?,
          updated_at = NOW()
        WHERE id = ?
      `, [progress.processed, progress.successful, progress.failed, jobId]);
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Save job result to database
   */
  async saveJobResult(jobId, url, data, status) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      await connection.execute(`
        INSERT INTO results (job_id, url, data, status, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [jobId, url, JSON.stringify(data), status]);
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Update account cookies in database
   */
  async updateAccountCookies(accountId, cookies) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'linkedin_automation',
      port: process.env.DB_PORT || 3306
    });
    
    try {
      await connection.execute(`
        UPDATE linkedin_accounts SET 
          last_cookie_refresh = NOW(),
          updated_at = NOW()
        WHERE id = ?
      `, [accountId]);
      
      // Store cookies in a separate table or encrypted field
      // For now, just update the timestamp
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Get error handling instructions based on error type
   */
  async getErrorHandlingInstructions(errorType) {
    const instructions = {
      'LOGIN_REDIRECT': {
        action: 'REFRESH_COOKIES',
        message: 'Please refresh your LinkedIn cookies and retry',
        retryAfter: 30000 // 30 seconds
      },
      'INVALID_COOKIES': {
        action: 'REFRESH_COOKIES',
        message: 'Your LinkedIn cookies are invalid. Please refresh them',
        retryAfter: 60000 // 1 minute
      },
      'RATE_LIMITED': {
        action: 'WAIT_AND_RETRY',
        message: 'Rate limit detected. Please wait before retrying',
        retryAfter: 300000 // 5 minutes
      },
      'NETWORK_ERROR': {
        action: 'RETRY',
        message: 'Network error occurred. Retrying automatically',
        retryAfter: 10000 // 10 seconds
      }
    };
    
    return instructions[errorType] || {
      action: 'MANUAL_INTERVENTION',
      message: 'Unknown error. Manual intervention required',
      retryAfter: null
    };
  }
  
  /**
   * Get WebSocket service status
   */
  getStatus() {
    return {
      connectedClients: this.clients.size,
      activeJobs: this.jobClients.size,
      clients: Array.from(this.clients.values()).map(client => ({
        clientId: client.ws.clientId,
        userId: client.userId,
        accountId: client.accountId,
        jobId: client.jobId,
        authenticated: client.authenticated,
        connectedAt: client.connectedAt,
        lastHeartbeat: client.lastHeartbeat
      }))
    };
  }
}

module.exports = WebSocketService;