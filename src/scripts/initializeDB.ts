import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { vectorStoreService } from '../services/vectorStoreService';
import { embeddingService } from '../services/embeddingService';

const sampleDocuments = [
  {
    title: "Introduction to AI",
    content: "Artificial Intelligence (AI) is a branch of computer science that aims to create intelligent machines that can think and act like humans. AI systems can perform tasks such as learning, reasoning, problem-solving, perception, and language understanding.",
    url: "https://example.com/ai-intro",
    publishedAt: new Date().toISOString(),
    source: "Tech Blog"
  },
  {
    title: "Machine Learning Basics",
    content: "Machine Learning is a subset of AI that focuses on the development of algorithms and statistical models that enable computers to improve their performance on a specific task through experience without being explicitly programmed.",
    url: "https://example.com/ml-basics",
    publishedAt: new Date().toISOString(),
    source: "ML Journal"
  },
  {
    title: "Deep Learning Overview",
    content: "Deep Learning is a subfield of machine learning inspired by the structure and function of the brain called artificial neural networks. It can automatically learn representations from data such as images, video, text, or audio.",
    url: "https://example.com/deep-learning",
    publishedAt: new Date().toISOString(),
    source: "AI Research"
  },
  {
    title: "Natural Language Processing",
    content: "Natural Language Processing (NLP) is a field of AI that focuses on the interaction between computers and humans using natural language. It involves analyzing, understanding, and generating human language in a valuable way.",
    url: "https://example.com/nlp",
    publishedAt: new Date().toISOString(),
    source: "NLP Today"
  },
  {
    title: "Computer Vision Fundamentals",
    content: "Computer Vision is a field of AI that trains computers to interpret and understand the visual world. Using digital images from cameras and deep learning models, machines can accurately identify and classify objects.",
    url: "https://example.com/computer-vision",
    publishedAt: new Date().toISOString(),
    source: "Vision Tech"
  }
];

async function initializeDatabase() {
  try {
    logger.info('Initializing ChromaDB with sample documents...');
    
    // Initialize vector store
    await vectorStoreService.initialize();
    
    // Check if documents already exist
    const count = await vectorStoreService.getDocumentCount();
    if (count > 0) {
      logger.info(`Database already has ${count} documents. Skipping initialization.`);
      return;
    }
    
    // Add sample documents
    for (const doc of sampleDocuments) {
      try {
        logger.info(`Adding document: ${doc.title}`);
        
        // Generate embedding
        const embedding = await embeddingService.generateEmbedding(
          `${doc.title}\n\n${doc.content}`
        );
        
        const docId = `doc_${Date.now()}_${Math.random()}`;
        
        // Add to vector store
        await vectorStoreService.addDocument({
          id: docId,
          articleId: docId,
          content: doc.content,
          metadata: {
            title: doc.title,
            url: doc.url,
            publishedAt: doc.publishedAt,
            source: doc.source
          },
          embedding: embedding
        });
        
        logger.info(`Successfully added: ${doc.title}`);
      } catch (error) {
        logger.error(`Error adding document ${doc.title}:`, error);
      }
    }
    
    const finalCount = await vectorStoreService.getDocumentCount();
    logger.info(`Database initialization complete. Total documents: ${finalCount}`);
    
  } catch (error) {
    logger.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase()
  .then(() => {
    logger.info('Database initialization successful');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  });
