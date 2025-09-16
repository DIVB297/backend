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

const app = express();
const server = createServer(app);

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

// Simple root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RAG Chatbot Backend API',
    status: 'running',
    version: '1.0.0',
    endpoints: ['/api/health', '/api/chat', '/api/sessions']
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

// Debug endpoint to manually initialize with sample data
app.post('/api/debug/init-sample-data', async (req, res) => {
  try {
    const { embeddingService } = await import('./services/embeddingService');
    const sampleDocs = [
      {
        title: "AI and Machine Learning Overview",
        content: "Artificial Intelligence and Machine Learning are transforming industries by enabling computers to learn from data and make intelligent decisions. These technologies are being used in healthcare, finance, transportation, and many other sectors."
      },
      {
        title: "The Future of Technology",
        content: "Emerging technologies like quantum computing, blockchain, and advanced AI are shaping the future. These innovations promise to solve complex problems and create new opportunities across various industries."
      },
      {
        title: "Sustainable Technology Solutions",
        content: "Green technology and sustainable solutions are becoming increasingly important as we face climate change. Renewable energy, electric vehicles, and energy-efficient systems are leading the way toward a more sustainable future."
      }
    ];

    for (const doc of sampleDocs) {
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
    }

    const count = await vectorStoreService.getDocumentCount();
    res.json({ 
      message: 'Sample data initialized successfully', 
      documentsCount: count 
    });
  } catch (error) {
    logger.error('Error initializing sample data:', error);
    res.status(500).json({ 
      error: 'Failed to initialize sample data',
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
    
    // Initialize Vector Store (REQUIRED for RAG functionality)
    try {
      await vectorStoreService.initialize();
      console.log('✅ Vector store initialized successfully');
      logger.info('Vector store initialized successfully');
    } catch (error) {
      console.error('❌ Vector store initialization FAILED - this is required for RAG functionality!');
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      logger.error('Vector store initialization FAILED:', error instanceof Error ? error.message : 'Unknown error');
      
      // Don't exit the process, but log that RAG won't work
      console.log('⚠️  Continuing without vector store - RAG queries will return empty results');
      logger.warn('Continuing without vector store - RAG queries will return empty results');
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
