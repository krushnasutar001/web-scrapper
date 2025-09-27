// Scralytics Hub - Popup Script
// Handles user interactions and displays status

document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
    setupEventListeners();
});

async function initializePopup() {
    try {
        // Check if user is already logged in
        const result = await chrome.storage.local.get(['jwtToken', 'userEmail']);
        
        if (result.jwtToken && result.userEmail) {
            showStatusPanel(result.userEmail);
            await updateStatus();
        } else {
            showLoginForm();
        }
    } catch (error) {
        console.error('Failed to initialize popup:', error);
        showError('loginError', 'Failed to initialize extension');
    }
}

function setupEventListeners() {
    // Login form
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('email').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Status panel
    document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

async function handleLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showError('loginError', 'Please enter both email and password');
        return;
    }

    if (!isValidEmail(email)) {
        showError('loginError', 'Please enter a valid email address');
        return;
    }

    setLoading('loginBtn', true);
    hideMessages();

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'login',
            credentials: { email, password }
        });

        if (response.success) {
            showSuccess('loginSuccess', 'Login successful! Syncing cookies...');
            setTimeout(() => {
                showStatusPanel(email);
                updateStatus();
            }, 1500);
        } else {
            showError('loginError', response.error || 'Login failed');
        }
    } catch (error) {
        showError('loginError', 'Connection failed. Please try again.');
    } finally {
        setLoading('loginBtn', false);
    }
}

async function handleSyncNow() {
    setLoading('syncNowBtn', true);
    hideMessages();

    try {
        const response = await chrome.runtime.sendMessage({ action: 'syncNow' });
        
        if (response.success) {
            showSuccess('statusSuccess', 'Cookies synced successfully!');
            await updateStatus();
        } else {
            showError('statusError', response.error || 'Sync failed');
        }
    } catch (error) {
        showError('statusError', 'Sync failed. Please try again.');
    } finally {
        setLoading('syncNowBtn', false);
    }
}

async function handleLogout() {
    try {
        await chrome.storage.local.clear();
        showLoginForm();
        showSuccess('loginSuccess', 'Disconnected successfully');
    } catch (error) {
        showError('statusError', 'Failed to disconnect');
    }
}

async function updateStatus() {
    try {
        // Get sync status from background script
        const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
        
        // Update sync status
        const syncStatusEl = document.getElementById('syncStatus');
        const syncIndicatorEl = document.getElementById('syncIndicator');
        
        if (status.syncStatus === 'success') {
            syncStatusEl.textContent = 'Active';
            syncIndicatorEl.className = 'status-indicator status-success';
        } else if (status.syncStatus === 'error') {
            syncStatusEl.textContent = 'Error';
            syncIndicatorEl.className = 'status-indicator status-error';
            if (status.lastError) {
                showError('statusError', `Sync error: ${status.lastError}`);
            }
        } else {
            syncStatusEl.textContent = 'Pending';
            syncIndicatorEl.className = 'status-indicator status-pending';
        }

        // Update last sync time
        const lastSyncEl = document.getElementById('lastSync');
        if (status.lastSyncTime) {
            const syncTime = new Date(status.lastSyncTime);
            lastSyncEl.textContent = formatRelativeTime(syncTime);
        } else {
            lastSyncEl.textContent = 'Never';
        }

        // Update cookie count
        await updateCookieCount();

    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

async function updateCookieCount() {
    try {
        const cookies = await chrome.cookies.getAll({ domain: ".linkedin.com" });
        const cookieCountEl = document.getElementById('cookieCount');
        cookieCountEl.textContent = `${cookies.length} found`;
    } catch (error) {
        console.error('Failed to get cookie count:', error);
        document.getElementById('cookieCount').textContent = 'Error';
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('statusPanel').classList.remove('active');
    clearForm();
}

function showStatusPanel(email) {
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('statusPanel').classList.add('active');
    document.getElementById('userEmail').textContent = email;
}

function clearForm() {
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    hideMessages();
}

function setLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        button.textContent = 'Loading...';
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        // Restore original text
        if (buttonId === 'loginBtn') {
            button.textContent = 'Connect Account';
        } else if (buttonId === 'syncNowBtn') {
            button.textContent = 'Sync Now';
        }
    }
}

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function showSuccess(elementId, message) {
    const successEl = document.getElementById(elementId);
    successEl.textContent = message;
    successEl.style.display = 'block';
}

function hideMessages() {
    const messages = document.querySelectorAll('.error-message, .success-message');
    messages.forEach(msg => msg.style.display = 'none');
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// Auto-refresh status every 30 seconds when panel is visible
setInterval(async () => {
    if (document.getElementById('statusPanel').classList.contains('active')) {
        await updateStatus();
    }
}, 30000);