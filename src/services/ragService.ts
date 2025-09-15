import { vectorStoreService } from './vectorStoreService';
import { geminiService } from './geminiService';
import { SearchResult, ChatRequest, ChatResponse } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class RagService {
  async processQuery(request: ChatRequest): Promise<ChatResponse> {
    try {
      const { message, sessionId } = request;
      
      // Step 1: Search for relevant documents
      const searchResults = await vectorStoreService.searchSimilar(message);
      
      // Step 2: Generate response using Gemini with context
      const response = await geminiService.generateResponse(message, searchResults);
      
      // Step 3: Format response
      const chatResponse: ChatResponse = {
        sessionId: sessionId || '',
        response,
        sources: searchResults,
        messageId: uuidv4(),
      };

      logger.info(`Processed query for session: ${sessionId}`);
      return chatResponse;
    } catch (error) {
      logger.error('Error processing RAG query:', error);
      throw error;
    }
  }

  async processStreamQuery(request: ChatRequest & { socket: any; messageId: string }): Promise<{
    response: string;
    sources: SearchResult[];
    messageId: string;
  }> {
    try {
      const { message, sessionId, socket, messageId } = request;
      
      // Step 1: Search for relevant documents
      const searchResults = await vectorStoreService.searchSimilar(message);
      
      // Step 2: Generate streaming response using Gemini with context
      const response = await geminiService.generateStreamResponse(message, searchResults, socket, messageId);

      logger.info(`Completed streaming query for session: ${sessionId}`);
      return {
        response,
        sources: searchResults,
        messageId,
      };
    } catch (error) {
      logger.error('Error processing streaming RAG query:', error);
      throw error;
    }
  }  async getRelevantContext(query: string, topK: number = 3): Promise<SearchResult[]> {
    try {
      return await vectorStoreService.searchSimilar(query, topK);
    } catch (error) {
      logger.error('Error getting relevant context:', error);
      return [];
    }
  }

  async validateRagPipeline(): Promise<{
    vectorStore: boolean;
    gemini: boolean;
    documentsCount: number;
  }> {
    try {
      const vectorStoreHealth = await vectorStoreService.getDocumentCount() > 0;
      const geminiHealth = await geminiService.testConnection();
      const documentsCount = await vectorStoreService.getDocumentCount();

      return {
        vectorStore: vectorStoreHealth,
        gemini: geminiHealth,
        documentsCount,
      };
    } catch (error) {
      logger.error('Error validating RAG pipeline:', error);
      return {
        vectorStore: false,
        gemini: false,
        documentsCount: 0,
      };
    }
  }
}

export const ragService = new RagService();
