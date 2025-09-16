import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { embeddingService } from '../services/embeddingService';
import { vectorStoreService } from '../services/vectorStoreService';
import { NewsArticle, EmbeddingVector } from '../types';

interface RSSItem {
  title?: string;
  link?: string;
  content?: string;
  pubDate?: string;
  creator?: string;
  source?: string;
}

class NewsIngestionService {
  private rssParser: Parser<any, RSSItem>;
  private maxArticles: number;
  private processedArticles: Map<string, boolean> = new Map();

  constructor() {
    this.rssParser = new Parser({
      customFields: {
        item: ['creator', 'source']
      }
    });
    this.maxArticles = config.news.maxArticles;
  }

  async ingestNewsArticles(): Promise<void> {
    try {
      logger.info('Starting news articles ingestion...');
      
      const allArticles: NewsArticle[] = [];
      
      for (const rssUrl of config.news.rssUrls) {
        try {
          const articles = await this.fetchArticlesFromRSS(rssUrl);
          allArticles.push(...articles);
          
          if (allArticles.length >= this.maxArticles) {
            break;
          }
        } catch (error) {
          logger.error(`Error fetching from RSS: ${rssUrl}`, error);
          continue;
        }
      }

      // Limit to max articles
      const articlesToProcess = allArticles.slice(0, this.maxArticles);
      
      logger.info(`Processing ${articlesToProcess.length} articles...`);
      
      // Process articles in batches
      const batchSize = 5;
      for (let i = 0; i < articlesToProcess.length; i += batchSize) {
        const batch = articlesToProcess.slice(i, i + batchSize);
        await this.processBatch(batch);
        
        // Add delay between batches to avoid rate limiting
        await this.delay(1000);
      }
      
      const count = await vectorStoreService.getDocumentCount();
      logger.info(`News ingestion completed. Total documents in vector store: ${count}`);
      
    } catch (error) {
      logger.error('Error during news ingestion:', error);
      throw error;
    }
  }

  private async fetchArticlesFromRSS(rssUrl: string): Promise<NewsArticle[]> {
    try {
      logger.info(`Fetching RSS feed from: ${rssUrl}`);
      const feed = await this.rssParser.parseURL(rssUrl);
      logger.info(`RSS feed loaded, found ${feed.items?.length || 0} items`);
      
      const articles: NewsArticle[] = [];
      
      for (const item of feed.items) {
        if (!item.link || !item.title) {
          logger.debug(`Skipping item without link or title: ${item.title || 'unknown'}`);
          continue;
        }
        
        // Skip if already processed
        if (this.processedArticles.has(item.link)) {
          logger.debug(`Skipping already processed article: ${item.title}`);
          continue;
        }
        
        try {
          let content = await this.extractArticleContent(item.link);
          
          // If content extraction fails or is too short, use the RSS description as fallback
          if (!content || content.length < 100) {
            content = item.content || item.description || '';
            if (content.length < 50) {
              logger.debug(`Skipping article with insufficient content: ${item.title} (${content?.length || 0} chars)`);
              continue;
            }
            logger.debug(`Using RSS description as content for: ${item.title}`);
          }
          
          const article: NewsArticle = {
            id: uuidv4(),
            title: item.title,
            content: content,
            url: item.link,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            source: this.extractSourceName(rssUrl),
          };
          
          articles.push(article);
          this.processedArticles.set(item.link, true);
          logger.debug(`Successfully processed article: ${item.title}`);
          
        } catch (error) {
          logger.warn(`Error processing article: ${item.link}`, error);
          continue;
        }
      }
      
      logger.info(`Fetched ${articles.length} articles from ${rssUrl}`);
      return articles;
      
    } catch (error) {
      logger.error(`Error parsing RSS feed: ${rssUrl}`, error);
      return [];
    }
  }

  private async extractArticleContent(url: string): Promise<string> {
    try {
      logger.debug(`Attempting to extract content from: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RAG-Chatbot/1.0)',
        },
        maxRedirects: 5,
      });
      
      const $ = cheerio.load(response.data);
      
      // Remove unwanted elements
      $('script, style, nav, header, footer, aside, .advertisement, .ads').remove();
      
      // Try different selectors for article content
      let content = '';
      const selectors = [
        'article',
        '[role="main"]',
        '.article-body',
        '.entry-content',
        '.post-content',
        '.content',
        'main',
        '.story-body',
        '.article-content',
        '[data-component="text-block"]' // BBC specific
      ];
      
      for (const selector of selectors) {
        const element = $(selector);
        if (element.length && element.text().trim().length > content.length) {
          content = element.text().trim();
          logger.debug(`Found content using selector: ${selector} (${content.length} chars)`);
        }
      }
      
      // If no specific content selector worked, try the body
      if (!content || content.length < 100) {
        content = $('body').text().trim();
        logger.debug(`Using body content: ${content.length} chars`);
      }
      
      // Clean up the content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit content length
      
      logger.debug(`Final content length: ${content.length} chars`);
      return content;
      
    } catch (error) {
      logger.warn(`Error extracting content from: ${url}`, error);
      return '';
    }
  }

  private async processBatch(articles: NewsArticle[]): Promise<void> {
    try {
      // Generate embeddings for the batch
      const texts = articles.map(article => 
        `${article.title}\n\n${article.content}`
      );
      
      const embeddings = await embeddingService.generateBatchEmbeddings(texts);
      
      // Create embedding vectors
      const vectors: EmbeddingVector[] = articles.map((article, index) => ({
        id: uuidv4(),
        articleId: article.id,
        content: texts[index],
        embedding: embeddings[index],
        metadata: {
          articleId: article.id,
          title: article.title,
          url: article.url,
          source: article.source,
          publishedAt: article.publishedAt.toISOString(),
        },
      }));
      
      // Add to vector store
      await vectorStoreService.addBatchDocuments(vectors);
      
      logger.info(`Processed batch of ${articles.length} articles`);
      
    } catch (error) {
      logger.error('Error processing batch:', error);
      
      // Fallback to individual processing
      for (const article of articles) {
        try {
          await this.processIndividualArticle(article);
        } catch (individualError) {
          logger.error(`Error processing individual article: ${article.id}`, individualError);
        }
      }
    }
  }

  private async processIndividualArticle(article: NewsArticle): Promise<void> {
    const text = `${article.title}\n\n${article.content}`;
    const embedding = await embeddingService.generateEmbedding(text);
    
    const vector: EmbeddingVector = {
      id: uuidv4(),
      articleId: article.id,
      content: text,
      embedding: embedding,
      metadata: {
        articleId: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        publishedAt: article.publishedAt.toISOString(),
      },
    };
    
    await vectorStoreService.addDocument(vector);
  }

  private extractSourceName(rssUrl: string): string {
    const url = new URL(rssUrl);
    const hostname = url.hostname.toLowerCase();
    
    if (hostname.includes('cnn')) return 'CNN';
    if (hostname.includes('bbc')) return 'BBC';
    if (hostname.includes('reuters')) return 'Reuters';
    if (hostname.includes('nytimes')) return 'New York Times';
    if (hostname.includes('guardian')) return 'The Guardian';
    if (hostname.includes('washingtonpost')) return 'Washington Post';
    
    return hostname.replace('www.', '').split('.')[0].toUpperCase();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async clearAndReingest(): Promise<void> {
    logger.info('Clearing existing vector store...');
    await vectorStoreService.clearCollection();
    
    // Clear the processed articles map to allow re-ingesting the same articles
    this.processedArticles.clear();
    logger.info('Cleared processed articles cache...');
    
    logger.info('Starting fresh ingestion...');
    await this.ingestNewsArticles();
  }
}

// Main execution
async function main() {
  try {
    // Initialize services
    await vectorStoreService.initialize();
    
    const ingestionService = new NewsIngestionService();
    
    // Check if we should clear existing data
    const shouldClear = process.argv.includes('--clear');
    
    if (shouldClear) {
      await ingestionService.clearAndReingest();
    } else {
      await ingestionService.ingestNewsArticles();
    }
    
    logger.info('News ingestion script completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('News ingestion script failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { NewsIngestionService };
