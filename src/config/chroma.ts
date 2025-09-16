import { CloudClient } from 'chromadb';
import { config } from './environment';
import { logger } from '../utils/logger';

let chromaClient: CloudClient | null = null;
let newsCollection: any = null;

// Initialize Chroma Cloud client
const initializeChromaClient = async (): Promise<CloudClient> => {
  if (chromaClient) {
    return chromaClient;
  }

  try {
    if (!config.chroma.apiKey || !config.chroma.tenant || !config.chroma.database) {
      throw new Error('Missing Chroma Cloud credentials');
    }

    chromaClient = new CloudClient({
      apiKey: config.chroma.apiKey,
      tenant: config.chroma.tenant,
      database: config.chroma.database,
    });

    logger.info('Chroma Cloud client initialized successfully');
    return chromaClient;
  } catch (error) {
    logger.error('Failed to initialize Chroma Cloud client:', error);
    throw error;
  }
};

// Get or create the news collection
export const getNewsCollection = async () => {
  if (newsCollection) {
    return newsCollection;
  }

  try {
    const client = await initializeChromaClient();
    
    // Get or create the news collection
    newsCollection = await client.getOrCreateCollection({
      name: 'news_articles',
      metadata: {
        description: 'News articles for RAG chatbot',
        created_at: new Date().toISOString()
      }
    });

    logger.info('News collection initialized successfully');
    return newsCollection;
  } catch (error) {
    logger.error('Failed to get/create news collection:', error);
    throw error;
  }
};

export { chromaClient };
