import * as cron from 'node-cron';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import { NewsIngestionService } from '../scripts/ingestNews';
import { vectorStoreService } from './vectorStoreService';

interface CronJobStats {
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  isRunning: boolean;
}

class CronService {
  private newsIngestionService: NewsIngestionService;
  private cronJob: cron.ScheduledTask | null = null;
  private isInitialized = false;
  private stats: CronJobStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    isRunning: false,
  };

  constructor() {
    this.newsIngestionService = new NewsIngestionService();
  }

  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      // Initialize vector store service
      await vectorStoreService.initialize();
      
      // Load stats from Redis
      await this.loadStatsFromRedis();
      
      this.isInitialized = true;
      logger.info('CronService initialized successfully');
    } catch (error) {
      logger.error('Error initializing CronService:', error);
      throw error;
    }
  }

  startNewsIngestionCron(): void {
    if (!config.news.enableCron) {
      logger.info('News ingestion cron job is disabled');
      return;
    }

    if (this.cronJob) {
      logger.warn('News ingestion cron job is already running');
      return;
    }

    const cronExpression = this.minutesToCronExpression(config.news.cronInterval);
    logger.info(`Starting news ingestion cron job with expression: ${cronExpression} (every ${config.news.cronInterval} minutes)`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.runNewsIngestion();
    }, {
      timezone: "UTC"
    });

    logger.info('News ingestion cron job started successfully');
  }

  stopNewsIngestionCron(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
      logger.info('News ingestion cron job stopped');
    }
  }

  async runNewsIngestion(): Promise<void> {
    if (this.stats.isRunning) {
      logger.warn('News ingestion is already running, skipping this execution');
      return;
    }

    try {
      this.stats.isRunning = true;
      this.stats.lastRunAt = new Date();
      this.stats.totalRuns++;

      logger.info('Starting scheduled news ingestion...');

      // Clear existing news data and ingest fresh data
      await this.newsIngestionService.clearAndReingest();

      // Update success stats
      this.stats.lastSuccessAt = new Date();
      this.stats.successfulRuns++;
      this.stats.isRunning = false;

      // Save stats and last update time to Redis
      await this.saveStatsToRedis();
      await this.saveLastNewsUpdateToRedis();

      logger.info('Scheduled news ingestion completed successfully');

    } catch (error) {
      this.stats.lastErrorAt = new Date();
      this.stats.failedRuns++;
      this.stats.isRunning = false;

      await this.saveStatsToRedis();

      logger.error('Error during scheduled news ingestion:', error);
    }
  }

  async manualNewsUpdate(): Promise<void> {
    logger.info('Starting manual news update...');
    await this.runNewsIngestion();
  }

  private minutesToCronExpression(minutes: number): string {
    if (minutes < 60) {
      // Every X minutes
      return `*/${minutes} * * * *`;
    } else if (minutes === 60) {
      // Every hour
      return '0 * * * *';
    } else if (minutes % 60 === 0) {
      // Every X hours
      const hours = minutes / 60;
      return `0 */${hours} * * *`;
    } else {
      // Complex intervals - convert to minutes
      return `*/${minutes} * * * *`;
    }
  }

  async getLastNewsUpdate(): Promise<Date | null> {
    try {
      const timestamp = await redisClient.getCache('news:last_update');
      return timestamp ? new Date(timestamp) : null;
    } catch (error) {
      logger.error('Error getting last news update from Redis:', error);
      return null;
    }
  }

  async getCronStats(): Promise<CronJobStats> {
    return { ...this.stats };
  }

  private async saveLastNewsUpdateToRedis(): Promise<void> {
    try {
      const now = new Date().toISOString();
      await redisClient.setCache('news:last_update', now, 86400 * 7); // Keep for 7 days
      logger.debug('Last news update time saved to Redis');
    } catch (error) {
      logger.error('Error saving last news update to Redis:', error);
    }
  }

  private async saveStatsToRedis(): Promise<void> {
    try {
      const statsString = JSON.stringify({
        ...this.stats,
        lastRunAt: this.stats.lastRunAt?.toISOString(),
        lastSuccessAt: this.stats.lastSuccessAt?.toISOString(),
        lastErrorAt: this.stats.lastErrorAt?.toISOString(),
      });
      await redisClient.setCache('news:cron_stats', statsString, 86400 * 7); // Keep for 7 days
      logger.debug('Cron stats saved to Redis');
    } catch (error) {
      logger.error('Error saving cron stats to Redis:', error);
    }
  }

  private async loadStatsFromRedis(): Promise<void> {
    try {
      const savedStats = await redisClient.getCache('news:cron_stats');
      if (savedStats) {
        this.stats = {
          ...savedStats,
          lastRunAt: savedStats.lastRunAt ? new Date(savedStats.lastRunAt) : undefined,
          lastSuccessAt: savedStats.lastSuccessAt ? new Date(savedStats.lastSuccessAt) : undefined,
          lastErrorAt: savedStats.lastErrorAt ? new Date(savedStats.lastErrorAt) : undefined,
          isRunning: false, // Always reset to false on startup
        };
      }
      logger.debug('Cron stats loaded from Redis');
    } catch (error) {
      logger.error('Error loading cron stats from Redis:', error);
    }
  }

  getNextRunTime(): Date | null {
    if (!this.cronJob) {
      return null;
    }

    try {
      // Calculate next run time based on cron schedule
      const now = new Date();
      const intervalMinutes = config.news.cronInterval;
      
      if (intervalMinutes < 60) {
        // Every X minutes - find next occurrence
        const currentMinutes = now.getMinutes();
        const nextMinutes = Math.ceil(currentMinutes / intervalMinutes) * intervalMinutes;
        const nextRun = new Date(now);
        
        if (nextMinutes >= 60) {
          nextRun.setHours(nextRun.getHours() + 1);
          nextRun.setMinutes(nextMinutes - 60);
        } else {
          nextRun.setMinutes(nextMinutes);
        }
        nextRun.setSeconds(0);
        nextRun.setMilliseconds(0);
        
        return nextRun;
      } else if (intervalMinutes === 60) {
        // Every hour - next hour at minute 0
        const nextRun = new Date(now);
        nextRun.setHours(nextRun.getHours() + 1);
        nextRun.setMinutes(0);
        nextRun.setSeconds(0);
        nextRun.setMilliseconds(0);
        return nextRun;
      } else if (intervalMinutes % 60 === 0) {
        // Every X hours - find next occurrence
        const hours = intervalMinutes / 60;
        const currentHour = now.getHours();
        
        // Find the next hour that's divisible by the interval
        let nextHour = currentHour;
        do {
          nextHour++;
        } while (nextHour % hours !== 0);
        
        const nextRun = new Date(now);
        
        if (nextHour >= 24) {
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(nextHour - 24);
        } else {
          nextRun.setHours(nextHour);
        }
        nextRun.setMinutes(0);
        nextRun.setSeconds(0);
        nextRun.setMilliseconds(0);
        
        return nextRun;
      } else {
        // Complex intervals - simple approximation
        const nextRun = new Date(now.getTime() + (intervalMinutes * 60 * 1000));
        return nextRun;
      }
    } catch (error) {
      logger.error('Error calculating next run time:', error);
      return null;
    }
  }
}

export const cronService = new CronService();
