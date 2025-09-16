import { ChromaClient } from 'chromadb';
import { config } from '../config/environment';
import { SearchResult, EmbeddingVector } from '../types';
import { embeddingService } from './embeddingService';
import { logger } from '../utils/logger';

export class VectorStoreService {
  private client: ChromaClient;
  private collection: any;
  private collectionName = 'news_articles';

  constructor() {
    // Create ChromaDB client with Railway environment variable support
    const chromaUrl = config.chroma.url || `http://${config.chroma.host}:${config.chroma.port}`;
    this.client = new ChromaClient({
      path: chromaUrl,
    });
  }

  async initialize(): Promise<void> {
    try {
      // Get or create collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { description: 'News articles for RAG chatbot' },
      });
      logger.info('Vector store initialized');
      
      // Check if collection is empty and auto-populate with sample data
      const count = await this.getDocumentCount();
      if (count === 0) {
        logger.info('Collection is empty, initializing with sample documents...');
        await this.initializeSampleData();
      }
    } catch (error) {
      logger.error('Error initializing vector store:', error);
      // Fallback: try to create collection if it doesn't exist
      try {
        this.collection = await this.client.createCollection({
          name: this.collectionName,
          metadata: { description: 'News articles for RAG chatbot' },
        });
        logger.info('Vector store collection created');
      } catch (createError) {
        logger.error('Error creating collection:', createError);
        throw error;
      }
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
      // Ensure collection is initialized
      if (!this.collection) {
        logger.warn('Collection not initialized, attempting to initialize...');
        await this.initialize();
      }

      if (!this.collection) {
        logger.error('Failed to initialize collection, returning empty results');
        return [];
      }

      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);
      
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
      // Return empty results instead of throwing
      return [];
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

  private async initializeSampleData(): Promise<void> {
    const sampleDocuments = [
      {
        title: "Introduction to AI",
        content: "Artificial Intelligence (AI) is a branch of computer science that aims to create intelligent machines that can think and act like humans. AI systems can perform tasks such as learning, reasoning, problem-solving, perception, and language understanding.",
        url: "https://example.com/ai-intro",
        source: "Tech Blog"
      },
      {
        title: "Machine Learning Basics",
        content: "Machine Learning is a subset of AI that focuses on the development of algorithms and statistical models that enable computers to improve their performance on a specific task through experience without being explicitly programmed.",
        url: "https://example.com/ml-basics",
        source: "ML Journal"
      },
      {
        title: "Deep Learning Overview",
        content: "Deep Learning is a subfield of machine learning inspired by the structure and function of the brain called artificial neural networks. It can automatically learn representations from data such as images, video, text, or audio.",
        url: "https://example.com/deep-learning",
        source: "AI Research"
      }
    ];

    try {
      for (const doc of sampleDocuments) {
        logger.info(`Adding sample document: ${doc.title}`);
        
        // Generate embedding
        const embedding = await embeddingService.generateEmbedding(
          `${doc.title}\n\n${doc.content}`
        );
        
        const docId = `sample_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Add to vector store
        await this.addDocument({
          id: docId,
          articleId: docId,
          content: doc.content,
          metadata: {
            title: doc.title,
            url: doc.url,
            publishedAt: new Date().toISOString(),
            source: doc.source
          },
          embedding: embedding
        });
        
        logger.info(`Successfully added sample document: ${doc.title}`);
      }
      
      logger.info('Sample data initialization complete');
    } catch (error) {
      logger.error('Error initializing sample data:', error);
    }
  }

  async clearCollection(): Promise<void> {
    try {
      // Try to delete the collection
      try {
        await this.client.deleteCollection({ name: this.collectionName });
        logger.info('Vector store collection deleted');
      } catch (deleteError) {
        logger.warn('Collection might not exist, continuing with initialization');
      }
      
      // Recreate the collection
      await this.initialize();
      logger.info('Vector store collection cleared and recreated');
    } catch (error) {
      logger.error('Error clearing collection:', error);
      throw error;
    }
  }
}

export const vectorStoreService = new VectorStoreService();
