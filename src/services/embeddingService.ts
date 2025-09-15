import axios from 'axios';
import { config } from '../config/environment';
import { logger } from '../utils/logger';

export class EmbeddingService {
  private jinaApiKey: string;
  private baseUrl = 'https://api.jina.ai/v1/embeddings';

  constructor() {
    this.jinaApiKey = config.jinaApiKey;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Try Jina API first, fallback to local if not available
    if (this.jinaApiKey && this.jinaApiKey.length > 0) {
      try {
        const response = await axios.post(
          this.baseUrl,
          {
            input: text,
            model: 'jina-embeddings-v2-base-en'
          },
          {
            headers: {
              'Authorization': `Bearer ${this.jinaApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data?.data?.[0]?.embedding) {
          return response.data.data[0].embedding;
        } else {
          throw new Error('Invalid response format from Jina API');
        }
      } catch (error) {
        logger.warn('Jina API failed, falling back to local embedding:', error);
        return this.generateLocalEmbedding(text);
      }
    } else {
      logger.info('No Jina API key provided, using local embedding');
      return this.generateLocalEmbedding(text);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    // Try Jina API first, fallback to local if not available
    if (this.jinaApiKey && this.jinaApiKey.length > 0) {
      try {
        const response = await axios.post(
          this.baseUrl,
          {
            input: texts,
            model: 'jina-embeddings-v2-base-en'
          },
          {
            headers: {
              'Authorization': `Bearer ${this.jinaApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data?.data) {
          return response.data.data.map((item: any) => item.embedding);
        } else {
          throw new Error('Invalid response format from Jina API');
        }
      } catch (error) {
        logger.warn('Jina API batch failed, falling back to individual local embeddings:', error);
        return Promise.all(texts.map(text => this.generateLocalEmbedding(text)));
      }
    } else {
      logger.info('No Jina API key provided, using local embeddings');
      return Promise.all(texts.map(text => this.generateLocalEmbedding(text)));
    }
  }

  // Fallback to local embeddings if Jina is not available
  async generateLocalEmbedding(text: string): Promise<number[]> {
    // Simple hash-based pseudo embedding for development
    // In production, you'd use a proper local model like sentence-transformers
    const hash = this.simpleHash(text);
    const embedding = new Array(768).fill(0).map((_, i) => 
      Math.sin(hash + i) * 0.1
    );
    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

export const embeddingService = new EmbeddingService();
