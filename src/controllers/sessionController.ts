import { Request, Response } from 'express';
import { sessionManager } from '../utils/sessionManager';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

export class SessionController {
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = await sessionManager.createSession();
      
      res.json({
        sessionId,
        message: 'Session created successfully',
      });
    } catch (error) {
      logger.error('Error in createSession:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSessionInfo(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({
        session,
      });
    } catch (error) {
      logger.error('Error in getSessionInfo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async clearSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!await sessionManager.validateSession(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      await redisClient.clearMessages(sessionId);
      
      res.json({
        message: 'Session cleared successfully',
        sessionId,
      });
    } catch (error) {
      logger.error('Error in clearSession:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!await sessionManager.validateSession(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      await sessionManager.deleteSession(sessionId);
      
      res.json({
        message: 'Session deleted successfully',
        sessionId,
      });
    } catch (error) {
      logger.error('Error in deleteSession:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async validateSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      const isValid = await sessionManager.validateSession(sessionId);
      
      res.json({
        sessionId,
        valid: isValid,
      });
    } catch (error) {
      logger.error('Error in validateSession:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const sessionController = new SessionController();
