import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../config/redis';
import { ChatSession } from '../types';
import { logger } from './logger';

export class SessionManager {
  async createSession(): Promise<string> {
    const sessionId = uuidv4();
    const session: ChatSession = {
      id: sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    };

    await redisClient.setSession(sessionId, session);
    logger.info(`Created new session: ${sessionId}`);
    return sessionId;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const session = await redisClient.getSession(sessionId);
    if (session) {
      // Update last activity
      session.lastActivity = new Date();
      await redisClient.setSession(sessionId, session);
    }
    return session;
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const session = await redisClient.getSession(sessionId);
    if (session) {
      session.lastActivity = new Date();
      session.messageCount = (session.messageCount || 0) + 1;
      await redisClient.setSession(sessionId, session);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await redisClient.deleteSession(sessionId);
    await redisClient.clearMessages(sessionId);
    logger.info(`Deleted session: ${sessionId}`);
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const session = await redisClient.getSession(sessionId);
    return session !== null;
  }
}

export const sessionManager = new SessionManager();
