import { Router } from 'express';
import { newsController } from '../controllers/newsController';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiting for manual update endpoint
const updateRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // limit each IP to 3 requests per windowMs
  message: { error: 'Too many manual update requests, try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Get news status and last update time
router.get('/status', newsController.getNewsStatus.bind(newsController));

// Get detailed cron job statistics
router.get('/stats', newsController.getCronStats.bind(newsController));

// Manually trigger news update (with rate limiting)
router.post('/update', updateRateLimit, newsController.triggerNewsUpdate.bind(newsController));

export { router as newsRoutes };
