import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Jobs from '../Jobs';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

// Mock the dependencies
jest.mock('../../contexts/AuthContext');
jest.mock('../../services/api');
jest.mock('../components/Jobs/NewJobModal', () => {
  return function MockNewJobModal({ isOpen, onClose }) {
    return isOpen ? <div data-testid="new-job-modal">New Job Modal</div> : null;
  };
});

// Mock Heroicons
jest.mock('@heroicons/react/24/outline', () => ({
  PlusIcon: () => <div data-testid="plus-icon">+</div>,
  EyeIcon: () => <div data-testid="eye-icon">👁</div>,
  ArrowDownTrayIcon: () => <div data-testid="download-icon">⬇</div>,
  FunnelIcon: () => <div data-testid="filter-icon">🔽</div>,
  DocumentArrowUpIcon: () => <div data-testid="upload-icon">⬆</div>,
}));

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Jobs Component', () => {
  const mockUser = { id: '1', name: 'Test User' };
  
  beforeEach(() => {
    useAuth.mockReturnValue({ user: mockUser });
    api.get.mockClear();
  });

  describe('getJobTypeBadge function safety', () => {
    test('handles undefined jobType gracefully', async () => {
      const jobsWithUndefinedType = [
        {
          id: '1',
          job_name: 'Test Job',
          type: undefined, // This should not crash
          status: 'completed',
          created_at: '2023-01-01T00:00:00Z'
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithUndefinedType,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
    });

    test('handles null jobType gracefully', async () => {
      const jobsWithNullType = [
        {
          id: '2',
          job_name: 'Test Job 2',
          type: null, // This should not crash
          status: 'running',
          created_at: '2023-01-01T00:00:00Z'
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithNullType,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
    });

    test('handles empty string jobType gracefully', async () => {
      const jobsWithEmptyType = [
        {
          id: '3',
          job_name: 'Test Job 3',
          type: '', // This should not crash
          status: 'pending',
          created_at: '2023-01-01T00:00:00Z'
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithEmptyType,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
    });

    test('handles valid jobType correctly', async () => {
      const jobsWithValidType = [
        {
          id: '4',
          job_name: 'Test Job 4',
          type: 'profile_scraping',
          status: 'completed',
          created_at: '2023-01-01T00:00:00Z'
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithValidType,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Profile_scraping')).toBeInTheDocument();
      });
    });

    test('handles special sales_navigator type', async () => {
      const jobsWithSalesNavType = [
        {
          id: '5',
          job_name: 'Sales Nav Job',
          type: 'sales_navigator',
          status: 'completed',
          created_at: '2023-01-01T00:00:00Z'
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithSalesNavType,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Sales Navigator')).toBeInTheDocument();
      });
    });
  });

  describe('Job array safety', () => {
    test('handles empty jobs array', async () => {
      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: [],
          total: 0
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('No jobs found. Create your first job to get started!')).toBeInTheDocument();
      });
    });

    test('handles null jobs array', async () => {
      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: null,
          total: 0
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('No jobs found. Create your first job to get started!')).toBeInTheDocument();
      });
    });

    test('handles invalid job objects in array', async () => {
      const jobsWithInvalidObjects = [
        {
          id: '1',
          job_name: 'Valid Job',
          type: 'profile_scraping',
          status: 'completed',
          created_at: '2023-01-01T00:00:00Z'
        },
        null, // Invalid job object
        undefined, // Invalid job object
        'invalid', // Invalid job object
        {
          id: '2',
          job_name: 'Another Valid Job',
          type: 'company_scraping',
          status: 'running',
          created_at: '2023-01-02T00:00:00Z'
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithInvalidObjects,
          total: 5
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        // Should only render valid jobs
        expect(screen.getByText('Valid Job')).toBeInTheDocument();
        expect(screen.getByText('Another Valid Job')).toBeInTheDocument();
        // Invalid jobs should be filtered out
        expect(screen.getAllByRole('row')).toHaveLength(3); // Header + 2 valid jobs
      });
    });
  });

  describe('API error handling', () => {
    test('handles API failure gracefully', async () => {
      api.get.mockRejectedValue(new Error('API Error'));

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('No jobs found. Create your first job to get started!')).toBeInTheDocument();
      });
    });
  });

  describe('Job object field variations', () => {
    test('handles missing job name gracefully', async () => {
      const jobsWithMissingName = [
        {
          id: '123456789',
          type: 'profile_scraping',
          status: 'completed',
          created_at: '2023-01-01T00:00:00Z'
          // job_name is missing
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithMissingName,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Job 12345678')).toBeInTheDocument();
      });
    });

    test('handles missing job id gracefully', async () => {
      const jobsWithMissingId = [
        {
          job_name: 'Test Job',
          type: 'profile_scraping',
          status: 'completed',
          created_at: '2023-01-01T00:00:00Z'
          // id is missing
        }
      ];

      api.get.mockResolvedValue({
        data: {
          success: true,
          jobs: jobsWithMissingId,
          total: 1
        }
      });

      renderWithRouter(<Jobs />);

      await waitFor(() => {
        expect(screen.getByText('Test Job')).toBeInTheDocument();
      });
    });
  });
});