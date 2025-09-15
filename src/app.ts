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
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST'],
  },
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.nodeEnv === 'production' ? false : true,
  credentials: true,
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

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const redisConnected = redisClient.isConnected();
    const vectorStoreCount = await vectorStoreService.getDocumentCount();
    
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
    // Try to initialize Redis (non-blocking)
    try {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.warn('Redis connection failed, continuing without Redis:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Try to initialize Vector Store (non-blocking)
    try {
      await vectorStoreService.initialize();
      logger.info('Vector store initialized successfully');
    } catch (error) {
      logger.warn('Vector store initialization failed, continuing without vector store:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Start server
    server.listen(config.port, () => {
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
