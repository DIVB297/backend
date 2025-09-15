#!/bin/sh
echo "Starting RAG Chatbot Backend..."
echo "Node version: $(node --version)"
echo "Current directory: $(pwd)"
echo "Listing files:"
ls -la
echo "Listing dist directory:"
ls -la dist/
echo "Starting application..."
node dist/app.js
