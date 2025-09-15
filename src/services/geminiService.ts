import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/environment';
import { SearchResult } from '../types';
import { logger } from '../utils/logger';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private models: any[];
  private modelNames: string[];
  private currentModelIndex: number = 0;
  private requestQueue: Promise<any> = Promise.resolve();

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.modelNames = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    this.models = this.modelNames.map(modelName => 
      this.genAI.getGenerativeModel({ model: modelName })
    );
  }

  async generateResponse(query: string, context: SearchResult[]): Promise<string> {
    const contextText = this.formatContext(context);
    const prompt = this.buildPrompt(query, contextText);

    return this.retryWithBackoff(async (model: any, modelName: string) => {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      logger.debug(`Generated response from ${modelName}`);
      return text;
    });
  }

  async generateStreamResponse(query: string, context: SearchResult[], socket: any, messageId: string): Promise<string> {
    const contextText = this.formatContext(context);
    const prompt = this.buildPrompt(query, contextText);

    return this.retryWithBackoff(async (model: any, modelName: string) => {
      logger.debug(`Starting stream response from ${modelName}`);
      const result = await model.generateContentStream(prompt);
      
      let fullResponse = '';
      
      try {
        // Stream chunks directly to the socket as they arrive
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullResponse += chunkText;
            logger.debug(`Streaming chunk from ${modelName}:`, chunkText.substring(0, 50) + '...');
            
            // Emit each chunk immediately to the client
            socket.emit('stream-chunk', { 
              messageId,
              content: chunkText 
            });
          }
        }
        
        logger.debug(`Stream completed from ${modelName}`);
        return fullResponse;
        
      } catch (error) {
        logger.error(`Stream error from ${modelName}:`, error);
        throw error;
      }
    });
  }

  private formatContext(searchResults: SearchResult[]): string {
    if (searchResults.length === 0) {
      return 'No relevant context found.';
    }

    return searchResults
      .map((result, index) => {
        const source = result.metadata?.title || result.metadata?.url || `Source ${index + 1}`;
        return `[${index + 1}] ${source}\n${result.content}\n`;
      })
      .join('\n');
  }

  private buildPrompt(query: string, context: string): string {
    return `You are a helpful AI assistant for a news website. Answer the user's question based on the provided news articles context. If the context doesn't contain relevant information, politely say so and provide what general knowledge you can while being clear about the limitations.

Context from recent news articles:
${context}

User Question: ${query}

Please provide a comprehensive answer based on the context above. If you reference information from the articles, be specific about which source you're referencing. Keep your response informative but concise.`;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test the current preferred model
      const currentModel = this.models[this.currentModelIndex];
      const currentModelName = this.modelNames[this.currentModelIndex];
      
      const result = await currentModel.generateContent('Test connection');
      await result.response;
      logger.info(`Connection test successful with ${currentModelName}`);
      return true;
    } catch (error) {
      logger.warn(`Primary model connection test failed, testing fallbacks:`, error);
      
      // Test all models to find a working one
      for (let i = 0; i < this.models.length; i++) {
        try {
          const model = this.models[i];
          const modelName = this.modelNames[i];
          
          const result = await model.generateContent('Test connection');
          await result.response;
          
          logger.info(`Connection test successful with fallback ${modelName}`);
          this.currentModelIndex = i; // Switch to working model
          return true;
        } catch (modelError) {
          logger.warn(`${this.modelNames[i]} connection test failed:`, modelError);
        }
      }
      
      logger.error('All Gemini models connection tests failed');
      return false;
    }
  }

  getCurrentModel(): string {
    return this.modelNames[this.currentModelIndex];
  }

  getAvailableModels(): string[] {
    return [...this.modelNames];
  }

  private async retryWithBackoff<T>(
    operation: (model: any, modelName: string) => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    // Queue requests to prevent overwhelming the API
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue.then(async () => {
        let lastError: any;
        
        // Try each model in sequence
        for (let modelIndex = 0; modelIndex < this.models.length; modelIndex++) {
          const actualModelIndex = (this.currentModelIndex + modelIndex) % this.models.length;
          const model = this.models[actualModelIndex];
          const modelName = this.modelNames[actualModelIndex];
          
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              logger.debug(`Trying ${modelName} (attempt ${attempt + 1}/${maxRetries + 1})`);
              const result = await operation(model, modelName);
              
              // Success! Update current model preference
              this.currentModelIndex = actualModelIndex;
              resolve(result);
              return;
            } catch (error: any) {
              lastError = error;
              const isRetryableError = error.message?.includes('503') || 
                                     error.message?.includes('overloaded') ||
                                     error.message?.includes('rate limit') ||
                                     error.message?.includes('quota') ||
                                     error.message?.includes('429');

              if (attempt === maxRetries) {
                logger.warn(`${modelName} failed after ${maxRetries + 1} attempts, trying next model`);
                break; // Try next model
              }

              if (!isRetryableError) {
                logger.warn(`${modelName} failed with non-retryable error, trying next model:`, error.message);
                break; // Try next model
              }

              const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
              logger.warn(`${modelName} rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
              
              await new Promise(resolveDelay => setTimeout(resolveDelay, delay));
            }
          }
        }
        
        // All models failed
        logger.error('All Gemini models failed:', lastError);
        reject(lastError || new Error('All models failed'));
      }).catch(reject);
    });
  }
}

export const geminiService = new GeminiService();
