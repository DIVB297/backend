import { Router } from 'express';
import { sessionController } from '../controllers/sessionController';
import { param, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Validation middleware
const validateSessionId = [
  param('sessionId')
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

// Session routes
router.post(
  '/create',
  async (req: Request, res: Response) => {
    await sessionController.createSession(req, res);
  }
);

router.get(
  '/:sessionId',
  validateSessionId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    await sessionController.getSessionInfo(req, res);
  }
);

router.post(
  '/:sessionId/clear',
  validateSessionId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    await sessionController.clearSession(req, res);
  }
);

router.delete(
  '/:sessionId',
  validateSessionId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    await sessionController.deleteSession(req, res);
  }
);

router.get(
  '/:sessionId/validate',
  validateSessionId,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    await sessionController.validateSession(req, res);
  }
);

export { router as sessionRoutes };
