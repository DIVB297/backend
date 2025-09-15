# Railway Deployment Guide

## Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

## Step 2: Login to Railway
```bash
railway login
```

## Step 3: Deploy Services

### Deploy Main Express.js App
```bash
# In backend directory
railway init
railway up
```

### Deploy Redis Service
```bash
# Add Redis to your project
railway add redis
```

### Deploy ChromaDB Service
```bash
# Create new service for ChromaDB
railway service new chromadb
railway up --dockerfile Dockerfile.chromadb
```

## Step 4: Environment Variables

Set these in Railway dashboard for your main service:

### Required
- `GEMINI_API_KEY` = your_gemini_api_key
- `JINA_API_KEY` = your_jina_api_key

### Optional (Railway provides defaults)
- `NODE_ENV` = production
- `PORT` = 3001

### Service URLs
- Railway will auto-provide `REDIS_URL`
- Set `CHROMADB_URL` to your ChromaDB service URL

## Step 5: Run News Ingestion

After deployment, run once to populate vector database:
```bash
# Using Railway CLI
railway run npm run ingest

# Or add as a one-time job in Railway dashboard
```

## Step 6: Domain & Access

- Railway provides a public URL
- Access your API at: `https://your-app.railway.app/api`
- Health check: `https://your-app.railway.app/api/health`

## Troubleshooting

### Check Logs
```bash
railway logs
```

### Connect to Services
```bash
railway connect redis    # Connect to Redis
railway shell            # Connect to app
```

### Environment Variables
```bash
railway variables        # List all env vars
```
