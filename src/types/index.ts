export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  url: string;
  publishedAt: Date;
  source: string;
}

export interface EmbeddingVector {
  id: string;
  articleId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  articleId: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export interface ChatRequest {
  sessionId?: string;
  message: string;
}

export interface ChatResponse {
  sessionId: string;
  response: string;
  sources?: SearchResult[];
  messageId: string;
}
