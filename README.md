# RAG Chatbot Backend

A Node.js/Express backend for a Retrieval-Augmented Generation (RAG) powered chatbot that answers queries using a news corpus.

## 🚀 Features

- **RAG Pipeline**: Ingests news articles, generates embeddings, and provides contextual responses
- **Real-time Chat**: WebSocket and REST API support for chat interactions
- **Session Management**: Redis-based session handling with TTL
- **Vector Search**: ChromaDB for efficient similarity search
- **Streaming Responses**: Server-sent events for real-time response streaming
- **Caching**: Redis-based caching for performance optimization
- **Rate Limiting**: Built-in rate limiting for API protection
- **Comprehensive Logging**: Winston-based structured logging

## 🛠 Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Vector Database**: ChromaDB
- **Cache/Sessions**: Redis
- **Embeddings**: Jina AI Embeddings
- **LLM**: Google Gemini API
- **News Sources**: RSS feeds from CNN, BBC, Reuters
- **WebSockets**: Socket.io
- **Validation**: express-validator

## 📋 Prerequisites

- Node.js 18+ and npm
- Redis server
- ChromaDB server
- Google Gemini API key
- Jina AI API key (optional, has fallback)

## ⚙️ Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Fill in your environment variables in `.env`:
```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Optional (has defaults)
NODE_ENV=development
PORT=3001
REDIS_HOST=localhost
REDIS_PORT=6379
CHROMA_HOST=localhost
CHROMA_PORT=8000
JINA_API_KEY=your_jina_api_key_here
```

## 🚀 Installation & Running

1. Install dependencies:
```bash
npm install
```

2. Start Redis (using Docker):
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

3. Start ChromaDB (using Docker):
```bash
docker run -d --name chromadb -p 8000:8000 chromadb/chroma:latest
```

4. Ingest news articles (one-time setup):
```bash
npm run ingest
```

5. Start the development server:
```bash
npm run dev
```

The server will start at `http://localhost:3001`

## 📡 API Endpoints

### Chat Endpoints
- `POST /api/chat/message` - Send a chat message
- `POST /api/chat/message/stream` - Send a chat message with streaming response
- `GET /api/chat/history/:sessionId` - Get chat history for a session

### Session Endpoints
- `POST /api/sessions/create` - Create a new session
- `GET /api/sessions/:sessionId` - Get session information
- `POST /api/sessions/:sessionId/clear` - Clear session chat history
- `DELETE /api/sessions/:sessionId` - Delete a session
- `GET /api/sessions/:sessionId/validate` - Validate a session

### Health Check
- `GET /api/health` - System health status

## 💬 WebSocket Events

The server supports real-time communication via Socket.io:

- `connection` - Client connects
- `join-session` - Join a specific session room
- `leave-session` - Leave a session room
- `disconnect` - Client disconnects

## 🗄️ Data Pipeline

1. **News Ingestion**: RSS feeds → Article extraction → Content cleaning
2. **Embedding Generation**: Jina AI embeddings for article content
3. **Vector Storage**: ChromaDB for similarity search
4. **Query Processing**: User query → Vector search → Context retrieval
5. **Response Generation**: Gemini API with retrieved context

## 🧪 Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run ingest` - Ingest news articles into vector store
- `npm run ingest -- --clear` - Clear and re-ingest all articles

## 🗃️ Redis Data Structure

### Sessions
```
session:{sessionId} → JSON session data
```

### Chat History
```
chat:{sessionId} → List of messages (LIFO, max 100)
```

### Cache
```
cache:{key} → JSON cached data
```

## 🔧 Configuration Options

### Session Management
- `SESSION_TTL`: Session expiry time (default: 3600s)
- `MAX_SESSIONS_PER_IP`: Max sessions per IP (default: 10)

### Rate Limiting
- `RATE_LIMIT_WINDOW_MS`: Rate limit window (default: 15min)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window (default: 100)

### Vector Search
- `TOP_K_RESULTS`: Number of similar documents to retrieve (default: 5)
- `EMBEDDING_DIMENSION`: Embedding vector dimension (default: 768)

### News Ingestion
- `MAX_ARTICLES_TO_INGEST`: Maximum articles to process (default: 50)
- `NEWS_RSS_URLS`: Comma-separated RSS feed URLs

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Client App    │────│    Express   │────│   Redis     │
└─────────────────┘    │   Server     │    │  (Cache)    │
                       └──────────────┘    └─────────────┘
                              │
                    ┌─────────┼─────────┐
                    │                   │
            ┌───────────────┐    ┌─────────────┐
            │   ChromaDB    │    │  Gemini API │
            │ (Vector Store)│    │    (LLM)    │
            └───────────────┘    └─────────────┘
                    │
            ┌───────────────┐
            │   Jina API    │
            │ (Embeddings)  │
            └───────────────┘
```

## 🐳 Docker Support

A `docker-compose.yml` file is provided for easy setup:

```bash
docker-compose up -d redis chromadb
```

## 🔍 Monitoring & Health

- Health endpoint provides service status
- Structured logging with Winston
- Error tracking and handling
- Performance metrics available

## 🚀 Production Deployment

1. Set `NODE_ENV=production`
2. Configure proper CORS origins
3. Use environment-specific Redis/ChromaDB instances
4. Set up proper SSL/TLS
5. Configure log rotation
6. Set up monitoring and alerts

## 🤝 Contributing

1. Follow TypeScript best practices
2. Add proper error handling
3. Include comprehensive logging
4. Write tests for new features
5. Update documentation

## 📄 License

MIT License - see LICENSE file for details.
