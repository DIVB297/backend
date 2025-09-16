import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { config } from './config/environment';
import { logger } from './utils/logger';
import { redisClient } from './config/redis';
import { vectorStoreService } from './services/vectorStoreService';

import { chatRoutes } from './routes/chatRoutes';
import { sessionRoutes } from './routes/sessionRoutes';
import { newsRoutes } from './routes/newsRoutes';
import { cronService } from './services/cronService';

const app = express();
const server = createServer(app);

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Define allowed origins for CORS
const allowedOrigins: string[] = [
  'http://localhost:3000',
  'http://localhost:3001', 
  'https://helpful-vitality-production-9c74.up.railway.app',
  process.env.RAILWAY_SERVICE_HELPFUL_VITALITY_URL ? `https://${process.env.RAILWAY_SERVICE_HELPFUL_VITALITY_URL}` : undefined
].filter((origin): origin is string => Boolean(origin));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/news', newsRoutes);

// Simple root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RAG Chatbot Backend API',
    status: 'running',
    version: '1.0.0',
    endpoints: ['/api/health', '/api/chat', '/api/sessions', '/api/news']
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const redisConnected = redisClient.isConnected();
    let vectorStoreCount = 0;
    
    try {
      vectorStoreCount = await vectorStoreService.getDocumentCount();
    } catch (error) {
      logger.warn('Could not get vector store count:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisConnected,
        vectorStore: vectorStoreCount > 0,
        documentsCount: vectorStoreCount,
      },
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
    });
  }
});

// Debug endpoint to test ChromaDB connection and initialize with sample data
app.post('/api/debug/test-chromadb', async (req, res) => {
  try {
    logger.info('Testing ChromaDB connection...');
    
    // Test direct connection to ChromaDB
    const { embeddingService } = await import('./services/embeddingService');
    
    // Force initialize the vector store
    await vectorStoreService.initialize();
    
    // Check if it worked
    const count = await vectorStoreService.getDocumentCount();
    
    if (count >= 0) {
      // ChromaDB is working, add sample data if empty
      if (count === 0) {
        const sampleDocs = [
          {
            title: "AI and Technology Overview",
            content: "Artificial Intelligence and modern technology are revolutionizing how we work and live. From machine learning to automation, these technologies are creating new possibilities across industries."
          },
          {
            title: "Sustainable Energy Solutions",
            content: "Renewable energy sources like solar, wind, and hydroelectric power are becoming increasingly important for reducing carbon emissions and creating a sustainable future."
          }
        ];

        for (const doc of sampleDocs) {
          try {
            const embedding = await embeddingService.generateEmbedding(`${doc.title}\n\n${doc.content}`);
            const docId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await vectorStoreService.addDocument({
              id: docId,
              articleId: docId,
              content: doc.content,
              metadata: {
                title: doc.title,
                url: `https://example.com/${docId}`,
                publishedAt: new Date().toISOString(),
                source: "Test Data"
              },
              embedding: embedding
            });
            logger.info(`Added test document: ${doc.title}`);
          } catch (docError) {
            logger.error(`Failed to add document: ${doc.title}`, docError);
          }
        }
      }
      
      const finalCount = await vectorStoreService.getDocumentCount();
      res.json({ 
        success: true,
        message: 'ChromaDB connection successful', 
        documentsCount: finalCount,
        status: 'Connected and operational'
      });
    } else {
      throw new Error('ChromaDB connection failed');
    }
  } catch (error) {
    logger.error('ChromaDB test failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'ChromaDB connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Initialize ChromaDB with sample data
app.post('/api/debug/initialize-data', async (req, res) => {
  try {
    logger.info('Initializing ChromaDB with sample data...');
    
    const { embeddingService } = await import('./services/embeddingService');
    
    // Force initialize the vector store
    await vectorStoreService.initialize();
    
    const sampleDocs = [
      {
        title: "RAG-Powered Chatbot Assignment",
        content: "Build a RAG-Powered Chatbot for News Websites. This is an assignment for the role of Full Stack Developer at Voosh. You are required to create a simple full-stack chatbot that answers queries over a news corpus using a Retrieval-Augmented Generation (RAG) pipeline. The tech stack includes Node.js Express for backend, React with SCSS for frontend, Redis for caching, and vector databases for embeddings."
      },
      {
        title: "Tech Stack and Requirements",
        content: "The chatbot uses Google Gemini API for LLM responses, Jina Embeddings for document embedding, vector databases like Chroma or Qdrant for storage, Express.js for REST API, Socket.io for real-time chat, Redis for session management, and React with SCSS for the frontend interface."
      },
      {
        title: "Full Stack Development Features",
        content: "The application features include a RAG pipeline that ingests news articles, embeds them using AI models, stores in vector databases, retrieves relevant passages for queries, and generates responses using Gemini API. It supports session management, chat history, real-time streaming responses, and session clearing functionality."
      },
      {
        title: "AI and Machine Learning Integration",
        content: "The system leverages artificial intelligence and machine learning through embedding models, vector similarity search, and large language models. It demonstrates modern AI application development with retrieval-augmented generation, semantic search capabilities, and conversational AI interfaces."
      },
      {
        title: "Modern Web Development Practices",
        content: "The project showcases modern web development with TypeScript, React hooks, SCSS styling, REST API design, WebSocket communication, Redis caching, Docker containerization, and cloud deployment. It follows best practices for full-stack application development."
      }
    ];

    let addedCount = 0;
    for (const doc of sampleDocs) {
      try {
        const embedding = await embeddingService.generateEmbedding(`${doc.title}\n\n${doc.content}`);
        const docId = `sample_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await vectorStoreService.addDocument({
          id: docId,
          articleId: docId,
          content: doc.content,
          metadata: {
            title: doc.title,
            url: `https://example.com/${docId}`,
            publishedAt: new Date().toISOString(),
            source: "Sample Data"
          },
          embedding: embedding
        });
        addedCount++;
        logger.info(`Added sample document: ${doc.title}`);
      } catch (docError) {
        logger.error(`Failed to add document: ${doc.title}`, docError);
      }
    }
    
    const finalCount = await vectorStoreService.getDocumentCount();
    res.json({ 
      success: true,
      message: `Successfully added ${addedCount} sample documents`, 
      documentsAdded: addedCount,
      totalDocuments: finalCount,
      status: 'Data initialization complete'
    });
  } catch (error) {
    logger.error('Data initialization failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Data initialization failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Socket.IO for real-time chat
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('join-session', (sessionId: string) => {
    socket.join(sessionId);
    logger.debug(`Client ${socket.id} joined session: ${sessionId}`);
  });

  socket.on('leave-session', (sessionId: string) => {
    socket.leave(sessionId);
    logger.debug(`Client ${socket.id} left session: ${sessionId}`);
  });

  // Handle streaming chat messages
  socket.on('send-message-stream', async (data: { message: string; sessionId?: string }) => {
    try {
      const { chatController } = await import('./controllers/chatController');
      await chatController.sendMessageSocket(socket, data);
    } catch (error) {
      logger.error('Error in socket message handler:', error);
      socket.emit('stream-error', { error: 'Internal server error' });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.originalUrl,
  });
});

// Initialize services and start server
async function startServer() {
  try {
    console.log('Starting RAG Chatbot Backend...');
    
    // Try to initialize Redis (non-blocking)
    try {
      await redisClient.connect();
      console.log('✅ Redis connected successfully');
      logger.info('Redis connected successfully');
    } catch (error) {
      console.log('⚠️  Redis connection failed, continuing without Redis:', error instanceof Error ? error.message : 'Unknown error');
      logger.warn('Redis connection failed, continuing without Redis:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Initialize Vector Store (optional - app can work without it)
    try {
      await vectorStoreService.initialize();
      console.log('✅ Vector store initialized successfully');
      logger.info('Vector store initialized successfully');
    } catch (error) {
      console.log('⚠️  Vector store initialization failed - app will use fallback responses');
      console.log('   ChromaDB Error:', error instanceof Error ? error.message : 'Unknown error');
      logger.warn('Vector store initialization failed - using fallback responses');
    }

    // Initialize and start cron service
    try {
      await cronService.initialize();
      cronService.startNewsIngestionCron();
      console.log('✅ Cron service initialized and started');
      logger.info('Cron service initialized and started');
    } catch (error) {
      console.log('⚠️  Cron service initialization failed:', error instanceof Error ? error.message : 'Unknown error');
      logger.warn('Cron service initialization failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Start server
    server.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📦 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API endpoints available at http://localhost:${config.port}/api`);
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API endpoints available at http://localhost:${config.port}/api`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Stop cron service
  cronService.stopNewsIngestionCron();
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  try {
    await redisClient.disconnect();
  } catch (error) {
    logger.warn('Error disconnecting Redis:', error instanceof Error ? error.message : 'Unknown error');
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Stop cron service
  cronService.stopNewsIngestionCron();
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  try {
    await redisClient.disconnect();
  } catch (error) {
    logger.warn('Error disconnecting Redis:', error instanceof Error ? error.message : 'Unknown error');
  }
  process.exit(0);
});

// Start the server
startServer();

export { app, io };
