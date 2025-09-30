// Transaction Service for Database Operations
const { getClient, withTransaction } = require('../database');
const logger = require('../utils/logger');

class TransactionService {
  constructor() {
    this.activeTransactions = new Map();
  }

  /**
   * Execute credit deduction with proper transaction handling
   * @param {number} userId - User ID
   * @param {number} creditsToDeduct - Number of credits to deduct
   * @param {string} jobId - Job ID for tracking
   * @param {string} description - Transaction description
   * @returns {Promise<{success: boolean, remainingCredits: number, transactionId: string}>}
   */
  async deductCredits(userId, creditsToDeduct, jobId, description = 'Job execution') {
    return withTransaction(async (client) => {
      try {
        // Lock user row to prevent concurrent credit modifications
        const userResult = await client.query(
          'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );

        if (userResult.rows.length === 0) {
          throw new Error('User not found');
        }

        const currentCredits = userResult.rows[0].credits;

        if (currentCredits < creditsToDeduct) {
          throw new Error(`Insufficient credits. Required: ${creditsToDeduct}, Available: ${currentCredits}`);
        }

        // Deduct credits
        const newCredits = currentCredits - creditsToDeduct;
        await client.query(
          'UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2',
          [newCredits, userId]
        );

        // Record transaction
        const transactionResult = await client.query(`
          INSERT INTO credit_transactions (
            user_id, amount, type, description, job_id, 
            balance_before, balance_after, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
          RETURNING id, created_at
        `, [
          userId, -creditsToDeduct, 'deduction', description, 
          jobId, currentCredits, newCredits
        ]);

        const transactionId = transactionResult.rows[0].id;

        logger.info('Credits deducted successfully', {
          userId,
          jobId,
          creditsDeducted: creditsToDeduct,
          remainingCredits: newCredits,
          transactionId
        });

        return {
          success: true,
          remainingCredits: newCredits,
          transactionId: transactionId.toString(),
          balanceBefore: currentCredits,
          balanceAfter: newCredits
        };

      } catch (error) {
        logger.error('Credit deduction failed', {
          userId,
          jobId,
          creditsToDeduct,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Add credits with transaction handling
   * @param {number} userId - User ID
   * @param {number} creditsToAdd - Number of credits to add
   * @param {string} description - Transaction description
   * @param {string} paymentId - Payment reference ID
   * @returns {Promise<{success: boolean, newBalance: number, transactionId: string}>}
   */
  async addCredits(userId, creditsToAdd, description = 'Credit purchase', paymentId = null) {
    return withTransaction(async (client) => {
      try {
        // Lock user row
        const userResult = await client.query(
          'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );

        if (userResult.rows.length === 0) {
          throw new Error('User not found');
        }

        const currentCredits = userResult.rows[0].credits;
        const newCredits = currentCredits + creditsToAdd;

        // Add credits
        await client.query(
          'UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2',
          [newCredits, userId]
        );

        // Record transaction
        const transactionResult = await client.query(`
          INSERT INTO credit_transactions (
            user_id, amount, type, description, payment_id,
            balance_before, balance_after, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
          RETURNING id, created_at
        `, [
          userId, creditsToAdd, 'addition', description, 
          paymentId, currentCredits, newCredits
        ]);

        const transactionId = transactionResult.rows[0].id;

        logger.info('Credits added successfully', {
          userId,
          creditsAdded: creditsToAdd,
          newBalance: newCredits,
          transactionId,
          paymentId
        });

        return {
          success: true,
          newBalance: newCredits,
          transactionId: transactionId.toString(),
          balanceBefore: currentCredits,
          balanceAfter: newCredits
        };

      } catch (error) {
        logger.error('Credit addition failed', {
          userId,
          creditsToAdd,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Refund credits with transaction handling
   * @param {number} userId - User ID
   * @param {number} creditsToRefund - Number of credits to refund
   * @param {string} jobId - Original job ID
   * @param {string} reason - Refund reason
   * @returns {Promise<{success: boolean, newBalance: number, transactionId: string}>}
   */
  async refundCredits(userId, creditsToRefund, jobId, reason = 'Job failed') {
    return withTransaction(async (client) => {
      try {
        // Verify original deduction exists
        const originalTransaction = await client.query(`
          SELECT id, amount FROM credit_transactions 
          WHERE user_id = $1 AND job_id = $2 AND type = 'deduction' 
          ORDER BY created_at DESC LIMIT 1
        `, [userId, jobId]);

        if (originalTransaction.rows.length === 0) {
          throw new Error('Original deduction transaction not found');
        }

        const originalAmount = Math.abs(originalTransaction.rows[0].amount);
        
        if (creditsToRefund > originalAmount) {
          throw new Error(`Refund amount (${creditsToRefund}) exceeds original deduction (${originalAmount})`);
        }

        // Lock user row
        const userResult = await client.query(
          'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );

        if (userResult.rows.length === 0) {
          throw new Error('User not found');
        }

        const currentCredits = userResult.rows[0].credits;
        const newCredits = currentCredits + creditsToRefund;

        // Add refund credits
        await client.query(
          'UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2',
          [newCredits, userId]
        );

        // Record refund transaction
        const transactionResult = await client.query(`
          INSERT INTO credit_transactions (
            user_id, amount, type, description, job_id,
            balance_before, balance_after, created_at,
            reference_transaction_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8) 
          RETURNING id, created_at
        `, [
          userId, creditsToRefund, 'refund', reason, 
          jobId, currentCredits, newCredits, originalTransaction.rows[0].id
        ]);

        const transactionId = transactionResult.rows[0].id;

        logger.info('Credits refunded successfully', {
          userId,
          jobId,
          creditsRefunded: creditsToRefund,
          newBalance: newCredits,
          transactionId,
          reason
        });

        return {
          success: true,
          newBalance: newCredits,
          transactionId: transactionId.toString(),
          balanceBefore: currentCredits,
          balanceAfter: newCredits
        };

      } catch (error) {
        logger.error('Credit refund failed', {
          userId,
          jobId,
          creditsToRefund,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Create job with credit reservation
   * @param {Object} jobData - Job creation data
   * @param {number} estimatedCredits - Estimated credits needed
   * @returns {Promise<{jobId: string, transactionId: string}>}
   */
  async createJobWithCreditReservation(jobData, estimatedCredits) {
    return withTransaction(async (client) => {
      try {
        // First, reserve credits
        const creditResult = await this.deductCredits(
          jobData.userId,
          estimatedCredits,
          null, // Job ID not available yet
          `Credit reservation for ${jobData.type} job`
        );

        // Create job
        const jobResult = await client.query(`
          INSERT INTO jobs (
            user_id, type, configuration, status, priority,
            estimated_credits, reserved_credits, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
          RETURNING id, created_at
        `, [
          jobData.userId,
          jobData.type,
          JSON.stringify(jobData.configuration),
          'pending',
          jobData.priority || 5,
          estimatedCredits,
          estimatedCredits
        ]);

        const jobId = jobResult.rows[0].id;

        // Update transaction with job ID
        await client.query(
          'UPDATE credit_transactions SET job_id = $1 WHERE id = $2',
          [jobId, creditResult.transactionId]
        );

        logger.info('Job created with credit reservation', {
          jobId,
          userId: jobData.userId,
          estimatedCredits,
          transactionId: creditResult.transactionId
        });

        return {
          jobId: jobId.toString(),
          transactionId: creditResult.transactionId,
          remainingCredits: creditResult.remainingCredits
        };

      } catch (error) {
        logger.error('Job creation with credit reservation failed', {
          userId: jobData.userId,
          estimatedCredits,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Finalize job credits (adjust for actual usage)
   * @param {string} jobId - Job ID
   * @param {number} actualCreditsUsed - Actual credits consumed
   * @returns {Promise<{success: boolean, adjustment: number}>}
   */
  async finalizeJobCredits(jobId, actualCreditsUsed) {
    return withTransaction(async (client) => {
      try {
        // Get job and reservation details
        const jobResult = await client.query(`
          SELECT user_id, reserved_credits, status 
          FROM jobs WHERE id = $1 FOR UPDATE
        `, [jobId]);

        if (jobResult.rows.length === 0) {
          throw new Error('Job not found');
        }

        const { user_id: userId, reserved_credits: reservedCredits } = jobResult.rows[0];
        const adjustment = reservedCredits - actualCreditsUsed;

        // Update job with actual credits
        await client.query(`
          UPDATE jobs 
          SET actual_credits = $1, credit_adjustment = $2, updated_at = NOW()
          WHERE id = $3
        `, [actualCreditsUsed, adjustment, jobId]);

        let result = { success: true, adjustment: 0 };

        // If we reserved more than we used, refund the difference
        if (adjustment > 0) {
          const refundResult = await this.addCredits(
            userId,
            adjustment,
            `Credit adjustment for job ${jobId} - unused credits refund`,
            null
          );
          result.adjustment = adjustment;
          result.newBalance = refundResult.newBalance;
        }
        // If we used more than reserved, deduct additional credits
        else if (adjustment < 0) {
          const additionalDeduction = Math.abs(adjustment);
          const deductResult = await this.deductCredits(
            userId,
            additionalDeduction,
            jobId,
            `Additional credits for job ${jobId}`
          );
          result.adjustment = adjustment;
          result.newBalance = deductResult.remainingCredits;
        }

        logger.info('Job credits finalized', {
          jobId,
          userId,
          reservedCredits,
          actualCreditsUsed,
          adjustment
        });

        return result;

      } catch (error) {
        logger.error('Job credit finalization failed', {
          jobId,
          actualCreditsUsed,
          error: error.message
        });
        throw error;
      }
    });
  }

  /**
   * Get user's credit transaction history
   * @param {number} userId - User ID
   * @param {number} limit - Number of transactions to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>}
   */
  async getCreditHistory(userId, limit = 50, offset = 0) {
    try {
      const client = await getClient();
      const result = await client.query(`
        SELECT 
          id, amount, type, description, job_id, payment_id,
          balance_before, balance_after, created_at,
          reference_transaction_id
        FROM credit_transactions 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get credit history', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new TransactionService();