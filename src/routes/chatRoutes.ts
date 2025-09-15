import { Router } from 'express';
import { chatController } from '../controllers/chatController';
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Validation middleware
const validateMessage = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('sessionId')
    .optional()
    .isUUID()
    .withMessage('Session ID must be a valid UUID'),
];

const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation error',
      details: errors.array(),
    });
  }
  next();
};

// Chat routes
router.post(
  '/message',
  validateMessage,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    await chatController.sendMessage(req, res);
  }
);

router.post(
  '/message/stream',
  validateMessage,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    await chatController.sendMessageStream(req, res);
  }
);

router.get(
  '/history/:sessionId',
  async (req: Request, res: Response) => {
    await chatController.getChatHistory(req, res);
  }
);

export { router as chatRoutes };
