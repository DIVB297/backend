import { createClient, RedisClientType } from 'redis';
import { config } from './environment';
import { logger } from '../utils/logger';

class RedisClient {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor() {
    // Check if Railway provides REDIS_URL
    if (config.redis.url) {
      this.client = createClient({
        url: config.redis.url,
      });
    } else {
      this.client = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
        },
        // Remove password requirement for simplicity
      });
    }

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      this.connected = false;
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis');
      this.connected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      logger.info('Redis connection ended');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      try {
        await this.client.connect();
      } catch (error) {
        logger.error('Failed to connect to Redis, continuing without Redis cache:', error);
        this.connected = false;
      }
    }
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
