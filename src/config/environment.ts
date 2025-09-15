import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Keys
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  jinaApiKey: process.env.JINA_API_KEY || '',
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || process.env.REDISHOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || process.env.REDISPORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || process.env.REDISPASSWORD || undefined,
    url: process.env.REDIS_URL || undefined, // Railway provides REDIS_URL
  },
  
  // Database (Optional)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'rag_chatbot',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
  
  // ChromaDB
  chroma: {
    host: process.env.CHROMA_HOST || process.env.CHROMADB_HOST || 'localhost',
    port: parseInt(process.env.CHROMA_PORT || process.env.CHROMADB_PORT || '8000', 10),
    url: process.env.CHROMA_URL || process.env.CHROMADB_URL || undefined, // Railway internal URL
  },
  
  // Session
  session: {
    ttl: parseInt(process.env.SESSION_TTL || '3600', 10),
    maxSessionsPerIp: parseInt(process.env.MAX_SESSIONS_PER_IP || '10', 10),
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  // News
  news: {
    rssUrls: process.env.NEWS_RSS_URLS?.split(',') || [
      'https://rss.cnn.com/rss/edition.rss',
      'https://feeds.bbci.co.uk/news/rss.xml',
    ],
    maxArticles: parseInt(process.env.MAX_ARTICLES_TO_INGEST || '50', 10),
  },
  
  // Vector Search
  vectorSearch: {
    topK: parseInt(process.env.TOP_K_RESULTS || '5', 10),
    embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '768', 10),
  },
};

// Validate required environment variables
const requiredEnvVars = ['GEMINI_API_KEY'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
