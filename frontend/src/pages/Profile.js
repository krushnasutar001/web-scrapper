import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
  const { user } = useAuth();
  
  return (
    <div className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Profile
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your account settings and preferences.
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Account Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="form-label">Email</label>
              <p className="text-sm text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="form-label">Name</label>
              <p className="text-sm text-gray-900">
                {user?.firstName && user?.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : 'Not set'
                }
              </p>
            </div>
            <div>
              <label className="form-label">Member since</label>
              <p className="text-sm text-gray-900">
                {user?.createdAt 
                  ? new Date(user.createdAt).toLocaleDateString()
                  : 'Unknown'
                }
              </p>
            </div>
          </div>
        </div>
        
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Account Settings
          </h3>
          <div className="text-center py-8">
            <p className="text-gray-500">
              Profile management functionality will be implemented here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;