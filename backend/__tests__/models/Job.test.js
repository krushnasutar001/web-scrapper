const Job = require('../../models/Job');

describe('Job Model', () => {
  describe('toJSON method safety', () => {
    test('handles undefined job_type gracefully', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: undefined, // This should not cause issues
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_type).toBe('unknown');
      expect(json.type).toBe('unknown'); // Frontend compatibility
      expect(json.job_name).toBe('Test Job');
      expect(json.query).toBe('Test Job'); // Frontend compatibility
    });

    test('handles null job_type gracefully', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: null, // This should not cause issues
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_type).toBe('unknown');
      expect(json.type).toBe('unknown');
    });

    test('handles empty string job_type gracefully', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: '', // This should not cause issues
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_type).toBe('unknown');
      expect(json.type).toBe('unknown');
    });

    test('handles whitespace-only job_type gracefully', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: '   ', // Whitespace only
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_type).toBe('unknown');
      expect(json.type).toBe('unknown');
    });

    test('preserves valid job_type', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: 'profile_scraping',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_type).toBe('profile_scraping');
      expect(json.type).toBe('profile_scraping');
    });

    test('trims job_type whitespace', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: '  profile_scraping  ',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_type).toBe('profile_scraping');
      expect(json.type).toBe('profile_scraping');
    });

    test('handles undefined job_name gracefully', () => {
      const job = new Job({
        id: '123456789',
        user_id: 'user123',
        job_name: undefined, // This should not cause issues
        job_type: 'profile_scraping',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_name).toBe('Job 12345678');
      expect(json.query).toBe('Job 12345678');
    });

    test('handles null job_name gracefully', () => {
      const job = new Job({
        id: '987654321',
        user_id: 'user123',
        job_name: null, // This should not cause issues
        job_type: 'profile_scraping',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_name).toBe('Job 98765432');
      expect(json.query).toBe('Job 98765432');
    });

    test('handles missing id gracefully', () => {
      const job = new Job({
        id: undefined,
        user_id: 'user123',
        job_name: null,
        job_type: 'profile_scraping',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.job_name).toBe('Job Unknown');
      expect(json.query).toBe('Job Unknown');
    });

    test('provides safe defaults for all numeric fields', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: 'profile_scraping',
        status: 'pending',
        // All numeric fields are undefined
        max_results: undefined,
        total_urls: undefined,
        processed_urls: undefined,
        successful_urls: undefined,
        failed_urls: undefined,
        result_count: undefined,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.max_results).toBe(0);
      expect(json.total_urls).toBe(0);
      expect(json.processed_urls).toBe(0);
      expect(json.successful_urls).toBe(0);
      expect(json.failed_urls).toBe(0);
      expect(json.result_count).toBe(0);
    });

    test('provides safe defaults for status and configuration', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: 'profile_scraping',
        status: undefined,
        configuration: undefined,
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json.status).toBe('unknown');
      expect(json.configuration).toEqual({});
    });

    test('includes both frontend and backend field names', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: 'profile_scraping',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      // Backend field names
      expect(json.job_name).toBe('Test Job');
      expect(json.job_type).toBe('profile_scraping');
      
      // Frontend field names (for compatibility)
      expect(json.query).toBe('Test Job');
      expect(json.type).toBe('profile_scraping');
      
      // Both should have the same values
      expect(json.job_name).toBe(json.query);
      expect(json.job_type).toBe(json.type);
    });

    test('includes computed fields', () => {
      const job = new Job({
        id: '123',
        user_id: 'user123',
        job_name: 'Test Job',
        job_type: 'profile_scraping',
        status: 'pending',
        max_results: 100,
        total_urls: 5,
        processed_urls: 0,
        successful_urls: 0,
        failed_urls: 0,
        result_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      const json = job.toJSON();

      expect(json).toHaveProperty('progress');
      expect(json).toHaveProperty('isFinished');
      expect(json).toHaveProperty('canBePaused');
      expect(json).toHaveProperty('canBeResumed');
    });
  });
});