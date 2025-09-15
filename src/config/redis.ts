import { createClient, RedisClientType } from 'redis';
import { config } from './environment';
import { logger } from '../utils/logger';

class RedisClient {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor() {
    // Disable Redis for now to avoid authentication issues
    // The application will work without Redis (no caching/sessions)
    this.client = createClient({
      socket: {
        host: 'localhost',
        port: 6379,
      },
    });
    this.connected = false; // Always stay disconnected
    
    // Don't set up event listeners since we won't connect
    logger.info('Redis disabled - application will run without caching');
  }

  async connect(): Promise<void> {
    // Redis is disabled - do nothing
    logger.info('Redis connection skipped (Redis disabled)');
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Session management methods
  async setSession(sessionId: string, data: any, ttl: number = config.session.ttl): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
    } catch (error) {
      logger.error('Redis setSession error:', error);
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    if (!this.connected) return null;
    try {
      const data = await this.client.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Redis getSession error:', error);
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.del(`session:${sessionId}`);
    } catch (error) {
      logger.error('Redis deleteSession error:', error);
    }
  }

  // Chat history methods
  async addMessage(sessionId: string, message: any): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.lPush(`chat:${sessionId}`, JSON.stringify(message));
      // Keep only last 100 messages
      await this.client.lTrim(`chat:${sessionId}`, 0, 99);
      // Set expiry on the list
      await this.client.expire(`chat:${sessionId}`, config.session.ttl);
    } catch (error) {
      logger.error('Redis addMessage error:', error);
    }
  }

  async getMessages(sessionId: string, count: number = 20): Promise<any[]> {
    if (!this.connected) return [];
    try {
      const messages = await this.client.lRange(`chat:${sessionId}`, 0, count - 1);
      return messages.map(msg => JSON.parse(msg)).reverse();
    } catch (error) {
      logger.error('Redis getMessages error:', error);
      return [];
    }
  }

  async clearMessages(sessionId: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.del(`chat:${sessionId}`);
    } catch (error) {
      logger.error('Redis clearMessages error:', error);
    }
  }

  // Cache methods
  async setCache(key: string, value: any, ttl: number = 3600): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.setEx(`cache:${key}`, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis setCache error:', error);
    }
  }

  async getCache(key: string): Promise<any | null> {
    if (!this.connected) return null;
    try {
      const data = await this.client.get(`cache:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Redis getCache error:', error);
      return null;
    }
  }
}

export const redisClient = new RedisClient();
