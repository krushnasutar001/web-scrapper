/**
 * Job Polling Service for LinkedIn Automation Extension
 * Periodically checks for assigned jobs from the backend
 */

export const API_BASE_URL = 'http://localhost:5001';

async function getApiBaseUrl() {
  try {
    const { apiBaseUrl } = await chrome.storage.local.get(['apiBaseUrl']);
    if (apiBaseUrl && typeof apiBaseUrl === 'string' && apiBaseUrl.startsWith('http')) {
      return apiBaseUrl;
    }
  } catch (_) {}
  return API_BASE_URL;
}

class JobPoller {
  constructor() {
    this.isPolling = false;
    this.pollInterval = 30000; // 30 seconds
    this.alarmName = 'jobPoller';
  }

  // Start polling for jobs
  async startPolling() {
    if (this.isPolling) {
      console.log('📊 Job polling already active');
      return;
    }

    console.log('🚀 Starting job polling service');
    this.isPolling = true;

    // Create alarm for periodic polling
    chrome.alarms.create(this.alarmName, {
      delayInMinutes: 0.5, // Start immediately (30 seconds)
      periodInMinutes: 0.5 // Poll every 30 seconds
    });

    // Initial poll
    this.pollForJobs().catch(error => {
      console.error('❌ Error during initial job polling:', error);
    });
  }

  // Stop polling for jobs
  stopPolling() {
    console.log('⏹️ Stopping job polling service');
    this.isPolling = false;
    chrome.alarms.clear(this.alarmName);
  }

  // Poll for assigned jobs
  async pollForJobs() {
    try {
      const authToken = await this.getAuthToken();
      if (!authToken) {
        console.log('⚠️ No auth token available, skipping job poll');
        return;
      }

      console.log('🔍 Polling for pending jobs...');

      const base = await getApiBaseUrl();
      const response = await fetch(`${base}/api/jobs/pending`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.jobs && data.jobs.length > 0) {
        console.log(`📋 Found ${data.jobs.length} pending jobs`);

        // Normalize and process each job
        for (const job of data.jobs) {
          const normalized = {
            ...job,
            type: job.type || job.job_type,
            query: job.query || job.job_name,
          };
          await this.processJob(normalized);
        }
      } else {
        console.log('📭 No pending jobs');
      }

    } catch (error) {
      console.error('❌ Error polling for jobs:', error);
    }
  }

  // Process a single job
  async processJob(job) {
    try {
      console.log(`🔄 Processing job ${job.id}: ${job.type}`);

      // Send job to content script for execution
      const result = await this.executeJob(job);

      if (result.success) {
        await this.completeJob(job.id, result.data);
      } else {
        await this.failJob(job.id, result.error);
      }

    } catch (error) {
      console.error(`❌ Error processing job ${job.id}:`, error);
      await this.failJob(job.id, error.message);
    }
  }

  // Execute job using content script
  async executeJob(job) {
    try {
      // Find or create LinkedIn tab
      const tabId = await this.getLinkedInTab();
      
      // Inject content script if needed
      await this.ensureContentScript(tabId);

      // Send job to content script
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'executeJob',
        job: job
      });

      return response;

    } catch (error) {
      console.error('❌ Error executing job:', error);
      return { success: false, error: error.message };
    }
  }

  // Complete a job
  async completeJob(jobId, results) {
    try {
      const authToken = await this.getAuthToken();
      
      const base = await getApiBaseUrl();
      const response = await fetch(`${base}/api/extension/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ results })
      });

      if (response.ok) {
        console.log(`✅ Job ${jobId} completed successfully`);
      } else {
        console.error(`❌ Failed to complete job ${jobId}`);
      }

    } catch (error) {
      console.error(`❌ Error completing job ${jobId}:`, error);
    }
  }

  // Fail a job
  async failJob(jobId, errorMessage) {
    try {
      const authToken = await this.getAuthToken();
      
      const base = await getApiBaseUrl();
      const response = await fetch(`${base}/api/extension/jobs/${jobId}/fail`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: errorMessage })
      });

      if (response.ok) {
        console.log(`❌ Job ${jobId} marked as failed`);
      } else {
        console.error(`❌ Failed to mark job ${jobId} as failed`);
      }

    } catch (error) {
      console.error(`❌ Error failing job ${jobId}:`, error);
    }
  }

  // Get LinkedIn tab or create one
  async getLinkedInTab() {
    // Look for existing LinkedIn tab
    const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
    
    if (tabs.length > 0) {
      return tabs[0].id;
    }

    // Create new LinkedIn tab (hidden)
    const tab = await chrome.tabs.create({
      url: 'https://www.linkedin.com',
      active: false
    });

    // Wait for tab to load
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    return tab.id;
  }

  // Ensure content script is injected
  async ensureContentScript(tabId) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not available, inject it
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content_linkedin.js']
      });
    }
  }

  // Get auth token from storage
  async getAuthToken() {
    const result = await chrome.storage.local.get(['toolToken', 'authToken']);
    return result.toolToken || result.authToken || null;
  }
}

// Create global instance
const jobPoller = new JobPoller();

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === jobPoller.alarmName && jobPoller.isPolling) {
    jobPoller.pollForJobs().catch(error => {
      console.error('❌ Error during alarm-triggered job polling:', error);
    });
  }
});

// Export for use in background.js
export { JobPoller, jobPoller };