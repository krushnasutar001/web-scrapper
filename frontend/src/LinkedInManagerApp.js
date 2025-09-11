/**
 * LinkedIn Account Manager App
 * Main React application for LinkedIn account management
 */

import React from 'react';
import LinkedInAccountManager from './components/LinkedInAccountManager';
import './index.css'; // Make sure Tailwind CSS is imported

function LinkedInManagerApp() {
  return (
    <div className="LinkedInManagerApp">
      <LinkedInAccountManager />
    </div>
  );
}

export default LinkedInManagerApp;