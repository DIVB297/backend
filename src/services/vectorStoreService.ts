import { getNewsCollection } from '../config/chroma';
import { config } from '../config/environment';
import { SearchResult, EmbeddingVector } from '../types';
import { embeddingService } from './embeddingService';
import { logger } from '../utils/logger';

export class VectorStoreService {
  private collection: any = null;
  private collectionName = 'news_articles';

  constructor() {
    // No need to initialize client here, it's handled in chroma.ts
  }

  async initialize(): Promise<void> {
    try {
      if (config.chroma.useCloud) {
        logger.info('Connecting to Chroma Cloud...');
        this.collection = await getNewsCollection();
        logger.info('Chroma Cloud initialized successfully');
      } else {
        // Fallback to local ChromaDB (keeping original logic for backward compatibility)
        const { ChromaClient } = await import('chromadb');
        const chromaUrl = config.chroma.url || `http://${config.chroma.host}:${config.chroma.port}`;
        const client = new ChromaClient({ path: chromaUrl });
        
        logger.info(`Attempting to connect to local ChromaDB at: ${chromaUrl}`);
        this.collection = await client.getOrCreateCollection({
          name: this.collectionName,
          metadata: { description: 'News articles for RAG chatbot' },
        });
        logger.info('Local ChromaDB initialized successfully');
      }
    } catch (error) {
      logger.error('Error initializing vector store:', error);
      logger.warn('Vector store connection failed - RAG functionality will be limited');
      
      // Don't throw error, just log it and continue without vector store
      // This allows the application to start even if vector store is not available
      this.collection = null;
    }
  }

  async addDocument(vector: EmbeddingVector): Promise<void> {
    try {
      await this.collection.add({
        ids: [vector.id],
        embeddings: [vector.embedding],
        metadatas: [vector.metadata],
        documents: [vector.content],
      });
      logger.debug(`Added document to vector store: ${vector.id}`);
    } catch (error) {
      logger.error('Error adding document to vector store:', error);
      throw error;
    }
  }

  async addBatchDocuments(vectors: EmbeddingVector[]): Promise<void> {
    try {
      await this.collection.add({
        ids: vectors.map(v => v.id),
        embeddings: vectors.map(v => v.embedding),
        metadatas: vectors.map(v => v.metadata),
        documents: vectors.map(v => v.content),
      });
      logger.info(`Added ${vectors.length} documents to vector store`);
    } catch (error) {
      logger.error('Error adding batch documents to vector store:', error);
      throw error;
    }
  }

  async searchSimilar(queryText: string, topK: number = config.vectorSearch.topK): Promise<SearchResult[]> {
    try {
      // Check if ChromaDB is available at all
      if (!this.collection) {
        logger.warn('ChromaDB not available, attempting to reconnect...');
        await this.initialize();
      }

      if (!this.collection) {
        logger.warn('ChromaDB unavailable, returning fallback response');
        return this.getFallbackResponse(queryText);
      }

      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);
      
      // Check if collection has any documents
      const count = await this.getDocumentCount();
      if (count === 0) {
        logger.warn('Collection is empty, returning fallback response');
        return this.getFallbackResponse(queryText);
      }
      
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
      });

      const searchResults: SearchResult[] = [];
      
      if (results.ids && results.ids[0] && results.ids[0].length > 0) {
        const ids = results.ids[0];
        const documents = results.documents?.[0] || [];
        const distances = results.distances?.[0] || [];
        const metadatas = results.metadatas?.[0] || [];

        for (let i = 0; i < ids.length; i++) {
          searchResults.push({
            articleId: metadatas[i]?.articleId || String(ids[i]),
            content: documents[i] || '',
            score: distances[i] !== undefined ? Math.max(0, 1 - distances[i]) : 0, // Convert distance to similarity score
            metadata: metadatas[i] || {},
          });
        }
      }

      logger.debug(`Found ${searchResults.length} similar documents for query: ${queryText}`);
      return searchResults;
    } catch (error) {
      logger.error('Error searching similar documents:', error);
      // Return fallback response instead of empty array
      return this.getFallbackResponse(queryText);
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await this.collection.delete({ ids: [id] });
      logger.debug(`Deleted document from vector store: ${id}`);
    } catch (error) {
      logger.error('Error deleting document from vector store:', error);
      throw error;
    }
  }

  async getDocumentCount(): Promise<number> {
    try {
      if (!this.collection) {
        logger.warn('Collection not initialized for document count');
        return 0;
      }
      const result = await this.collection.count();
      return result || 0;
    } catch (error) {
      logger.error('Error getting document count:', error);
      return 0;
    }
  }

  private getFallbackResponse(queryText: string): SearchResult[] {
    // Return a generic helpful response when ChromaDB is not available
    return [
      {
        articleId: 'fallback-001',
        content: `I apologize, but I'm currently unable to access my knowledge base to provide specific information about "${queryText}". This might be due to a temporary service issue. Please try again in a moment, or feel free to ask your question in a different way.`,
        score: 0.5,
        metadata: {
          title: 'Service Temporarily Unavailable',
          source: 'System Message',
          publishedAt: new Date().toISOString(),
        }
      }
    ];
  }

  async clearCollection(): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      // For Chroma Cloud, we can't easily delete collections, so we'll clear all documents
      if (config.chroma.useCloud) {
        logger.info('Clearing all documents from Chroma Cloud collection');
        // Get all document IDs and delete them
        const result = await this.collection.get();
        if (result.ids && result.ids.length > 0) {
          await this.collection.delete({ ids: result.ids });
          logger.info(`Deleted ${result.ids.length} documents from collection`);
        }
      } else {
        // For local ChromaDB, delete and recreate collection
        try {
          const { ChromaClient } = await import('chromadb');
          const chromaUrl = config.chroma.url || `http://${config.chroma.host}:${config.chroma.port}`;
          const client = new ChromaClient({ path: chromaUrl });
          
          await client.deleteCollection({ name: this.collectionName });
          logger.info('Local ChromaDB collection deleted');
        } catch (deleteError) {
          logger.warn('Collection might not exist, continuing with initialization');
        }
        
        // Recreate the collection
        await this.initialize();
        logger.info('Vector store collection cleared and recreated');
      }
    } catch (error) {
      logger.error('Error clearing collection:', error);
      throw error;
    }
  }
}

export const vectorStoreService = new VectorStoreService();
