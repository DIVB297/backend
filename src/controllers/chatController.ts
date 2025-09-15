import { Request, Response } from 'express';
import { Socket } from 'socket.io';
import { ragService } from '../services/ragService';
import { sessionManager } from '../utils/sessionManager';
import { redisClient } from '../config/redis';
import { ChatMessage } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class ChatController {
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { message, sessionId } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      // Create or validate session
      let validSessionId = sessionId;
      if (!sessionId || !await sessionManager.validateSession(sessionId)) {
        validSessionId = await sessionManager.createSession();
      }

      // Process the message through RAG
      const ragResponse = await ragService.processQuery({
        message,
        sessionId: validSessionId,
      });

      // Save user message to chat history
      const userMessage: ChatMessage = {
        id: uuidv4(),
        sessionId: validSessionId,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      await redisClient.addMessage(validSessionId, userMessage);

      // Save assistant message to chat history
      const assistantMessage: ChatMessage = {
        id: ragResponse.messageId,
        sessionId: validSessionId,
        role: 'assistant',
        content: ragResponse.response,
        timestamp: new Date(),
      };
      await redisClient.addMessage(validSessionId, assistantMessage);

      // Update session activity
      await sessionManager.updateSessionActivity(validSessionId);

      res.json({
        sessionId: validSessionId,
        response: ragResponse.response,
        sources: ragResponse.sources,
        messageId: ragResponse.messageId,
      });
    } catch (error) {
      logger.error('Error in sendMessage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async sendMessageStream(req: Request, res: Response): Promise<void> {
    try {
      const { message, sessionId } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      // Create or validate session
      let validSessionId = sessionId;
      if (!sessionId || !await sessionManager.validateSession(sessionId)) {
        validSessionId = await sessionManager.createSession();
      }

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Send session ID first
      res.write(`data: ${JSON.stringify({ 
        type: 'session', 
        sessionId: validSessionId 
      })}\n\n`);

      // Save user message to chat history
      const userMessage: ChatMessage = {
        id: uuidv4(),
        sessionId: validSessionId,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      await redisClient.addMessage(validSessionId, userMessage);

      // Process the message through RAG (non-streaming for SSE)
      const ragResponse = await ragService.processQuery({
        message,
        sessionId: validSessionId,
      });

      // Send sources
      res.write(`data: ${JSON.stringify({ 
        type: 'sources', 
        sources: ragResponse.sources 
      })}\n\n`);

      // Send the complete response as chunks (simulated streaming)
      const chunks = ragResponse.response.match(/.{1,50}/g) || [ragResponse.response];
      
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ 
          type: 'chunk', 
          content: chunk 
        })}\n\n`);
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Send completion signal
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        messageId: ragResponse.messageId 
      })}\n\n`);

      // Save complete assistant message to chat history
      const assistantMessage: ChatMessage = {
        id: ragResponse.messageId,
        sessionId: validSessionId,
        role: 'assistant',
        content: ragResponse.response,
        timestamp: new Date(),
      };
      await redisClient.addMessage(validSessionId, assistantMessage);

      // Update session activity
      await sessionManager.updateSessionActivity(validSessionId);

      res.end();
    } catch (error) {
      logger.error('Error in sendMessageStream:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: 'Internal server error' 
      })}\n\n`);
      res.end();
    }
  }

  async getChatHistory(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { limit = '20' } = req.query;

      if (!await sessionManager.validateSession(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const messages = await redisClient.getMessages(sessionId, parseInt(limit as string));
      
      res.json({
        sessionId,
        messages,
        count: messages.length,
      });
    } catch (error) {
      logger.error('Error in getChatHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async sendMessageSocket(socket: Socket, data: { message: string; sessionId?: string }): Promise<void> {
    try {
      const { message, sessionId } = data;

      if (!message) {
        socket.emit('stream-error', { error: 'Message is required' });
        return;
      }

      // Create or validate session
      let validSessionId: string = sessionId || '';
      if (!sessionId || !await sessionManager.validateSession(sessionId)) {
        validSessionId = await sessionManager.createSession();
      }

      // Join session room if not already joined
      socket.join(validSessionId);

      // Emit session ID
      socket.emit('stream-session', { sessionId: validSessionId });

      // Save user message to chat history
      const userMessageId = uuidv4();
      const userMessage: ChatMessage = {
        id: userMessageId,
        sessionId: validSessionId,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      await redisClient.addMessage(validSessionId, userMessage);

      // Emit user message
      socket.emit('stream-user-message', {
        messageId: userMessageId,
        content: message,
        timestamp: userMessage.timestamp,
      });

      // Process the message through RAG (streaming)
      const assistantMessageId = uuidv4();
      
      // Emit sources first (search happens synchronously)
      socket.emit('stream-start', { messageId: assistantMessageId });

      const ragResponse = await ragService.processStreamQuery({
        message,
        sessionId: validSessionId,
        socket,
        messageId: assistantMessageId,
      });

      // Emit sources after getting them from RAG
      socket.emit('stream-sources', { sources: ragResponse.sources });

      // Save complete assistant message to chat history
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: validSessionId,
        role: 'assistant',
        content: ragResponse.response,
        timestamp: new Date(),
      };
      await redisClient.addMessage(validSessionId, assistantMessage);

      // Emit completion
      socket.emit('stream-complete', { 
        messageId: assistantMessageId,
        timestamp: assistantMessage.timestamp,
      });

      // Update session activity
      await sessionManager.updateSessionActivity(validSessionId);

      logger.info(`Streamed message completed for session: ${validSessionId}`);

    } catch (error) {
      logger.error('Error in sendMessageSocket:', error);
      socket.emit('stream-error', { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const chatController = new ChatController();
