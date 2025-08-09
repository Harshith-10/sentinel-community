import { createClient } from 'redis';
import Queue from 'bull';
import { executeCode } from './executor';
import languageManager from './languageManager';
import { JobData, ExecutionResult } from './types';

const executorId = process.env.EXECUTOR_ID || 'unknown';
const language = process.env.LANGUAGE || 'unknown';

if (language === 'unknown') {
  console.error('LANGUAGE environment variable is not set. Exiting.');
  process.exit(1);
}

console.log(`Starting executor worker for language: ${language}`);

// Redis client
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
  socket: {
    family: 4, // Force IPv4
    connectTimeout: 10000
  }
});

redisClient.on('error', (err: Error) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log(`Executor for ${language}: Redis client connected`);
});

redisClient.on('ready', () => {
  console.log(`Executor for ${language}: Redis client ready`);
});

const queueName = `${language}-executor`;
const codeQueue = new Queue(queueName, {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
    family: 4,
    connectTimeout: 10000
  }
});

// Process jobs with configurable concurrency
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1', 10);
codeQueue.process('execute', CONCURRENCY, async (job) => {
  const { id, code, language: jobLanguage, input, testCases }: JobData = job.data;

  console.log(`Executor for ${language}: Processing job ${id}`);

  try {
    // Update job progress
    await job.progress(10);

    // Execute the code
    const result: ExecutionResult = await executeCode(code, jobLanguage, input, testCases);

    // Update job progress
    await job.progress(100);

    console.log(`Executor for ${language}: Job ${id} completed successfully`);

    return result;

  } catch (error) {
    console.error(`Executor for ${language}: Job ${id} failed:`, error);

    const failedResult: ExecutionResult = {
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime: 0,
      status: 'error'
    };

    throw new Error(JSON.stringify(failedResult));
  }
});

// Queue event listeners
codeQueue.on('completed', (job, result) => {
  console.log(`Executor for ${language}: Job ${job.id} completed`);
});

codeQueue.on('failed', (job, err) => {
  console.error(`Executor for ${language}: Job ${job.id} failed:`, err.message);
});

codeQueue.on('active', (job) => {
  console.log(`Executor for ${language}: Job ${job.id} started processing`);
});

codeQueue.on('waiting', (jobId) => {
  console.log(`Executor ${executorId}: Job ${jobId} is waiting`);
});

codeQueue.on('stalled', (job) => {
  console.warn(`Executor ${executorId}: Job ${job.id} stalled`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log(`Executor ${executorId}: Shutting down gracefully...`);
  
  try {
    await codeQueue.close();
    await redisClient.quit();
    console.log(`Executor ${executorId}: Shutdown complete`);
    process.exit(0);
  } catch (error) {
    console.error(`Executor ${executorId}: Error during shutdown:`, error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the worker
const startWorker = async () => {
  try {
    await redisClient.connect();
    console.log(`Executor ${executorId}: Connected to Redis`);
    
    // Load language configurations
    await languageManager.loadLanguages();
    console.log(`Executor ${executorId}: Loaded language configurations`);
    
    console.log(`Executor ${executorId}: Worker started, listening for jobs on queue: ${queueName}`);
    console.log(`Executor ${executorId}: Configured for language: ${language}`);
    
  } catch (error) {
    console.error(`Executor ${executorId}: Failed to start worker:`, error);
    process.exit(1);
  }
};

startWorker();
