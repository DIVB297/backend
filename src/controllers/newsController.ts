import { Request, Response } from 'express';
import { cronService } from '../services/cronService';
import { vectorStoreService } from '../services/vectorStoreService';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

export class NewsController {
  // Get news update status
  async getNewsStatus(req: Request, res: Response): Promise<void> {
    try {
      const lastUpdate = await cronService.getLastNewsUpdate();
      const cronStats = await cronService.getCronStats();
      const documentCount = await vectorStoreService.getDocumentCount();
      const nextRunTime = cronService.getNextRunTime();

      // Use cronStats.lastSuccessAt as fallback if Redis lastUpdate is not available
      const effectiveLastUpdate = lastUpdate || cronStats.lastSuccessAt;

      const status = {
        lastUpdate: effectiveLastUpdate?.toISOString() || null,
        lastUpdateFormatted: effectiveLastUpdate ? this.formatDate(effectiveLastUpdate) : 'Never',
        nextUpdate: nextRunTime?.toISOString() || null,
        nextUpdateFormatted: nextRunTime ? this.formatTimeOnly(nextRunTime) : 'Not scheduled',
        documentCount,
        cronEnabled: config.news.enableCron,
        cronInterval: config.news.cronInterval,
        cronIntervalFormatted: this.formatInterval(config.news.cronInterval),
        stats: {
          ...cronStats,
          lastRunAt: cronStats.lastRunAt?.toISOString() || null,
          lastSuccessAt: cronStats.lastSuccessAt?.toISOString() || null,
          lastErrorAt: cronStats.lastErrorAt?.toISOString() || null,
        }
      };

      res.json(status);
    } catch (error) {
      logger.error('Error getting news status:', error);
      res.status(500).json({ error: 'Failed to get news status' });
    }
  }

  // Manually trigger news update
  async triggerNewsUpdate(req: Request, res: Response): Promise<void> {
    try {
      // Run the update in the background
      cronService.manualNewsUpdate().catch(error => {
        logger.error('Manual news update failed:', error);
      });

      res.json({ 
        message: 'News update triggered successfully',
        status: 'running'
      });
    } catch (error) {
      logger.error('Error triggering manual news update:', error);
      res.status(500).json({ error: 'Failed to trigger news update' });
    }
  }

  // Get cron job statistics
  async getCronStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await cronService.getCronStats();
      
      const formattedStats = {
        ...stats,
        lastRunAt: stats.lastRunAt?.toISOString() || null,
        lastRunAtFormatted: stats.lastRunAt ? this.formatDate(stats.lastRunAt) : 'Never',
        lastSuccessAt: stats.lastSuccessAt?.toISOString() || null,
        lastSuccessAtFormatted: stats.lastSuccessAt ? this.formatDate(stats.lastSuccessAt) : 'Never',
        lastErrorAt: stats.lastErrorAt?.toISOString() || null,
        lastErrorAtFormatted: stats.lastErrorAt ? this.formatDate(stats.lastErrorAt) : 'Never',
        successRate: stats.totalRuns > 0 ? ((stats.successfulRuns / stats.totalRuns) * 100).toFixed(1) + '%' : '0%'
      };

      res.json(formattedStats);
    } catch (error) {
      logger.error('Error getting cron stats:', error);
      res.status(500).json({ error: 'Failed to get cron statistics' });
    }
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  }

  private formatTimeOnly(date: Date): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString() === date.toDateString();
    
    const timeFormat = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);

    if (isToday) {
      return `${timeFormat}`;
    } else if (isTomorrow) {
      return `${timeFormat} tomorrow`;
    } else {
      const dateFormat = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric'
      }).format(date);
      return `${timeFormat} ${dateFormat}`;
    }
  }

  private formatInterval(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (minutes === 60) {
      return '1 hour';
    } else if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
  }
}

export const newsController = new NewsController();
