import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { executeCode } from './executor';
import languageManager from './languageManager';
import { 
  ExecuteCodeRequest, 
  JobData, 
  JobResult, 
  HealthResponse, 
  LanguagesResponse 
} from './types';

const app = express();
const port = process.env.PORT || 8910;

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
  console.log('Redis client connected');
});

redisClient.on('ready', () => {
  console.log('Redis client ready');
});

// Job queue
const codeQueue = new Queue('code execution', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
    family: 4, // Force IPv4
    connectTimeout: 10000
  }
});

// Bull queue event handlers for debugging
codeQueue.on('error', (error: Error) => {
  console.error('Bull Queue Error:', error);
});

codeQueue.on('waiting', (jobId: string) => {
  console.log(`Job ${jobId} is waiting`);
});

codeQueue.on('active', (job: Queue.Job, _jobPromise: Promise<any>) => {
  console.log(`Job ${job.id} started`);
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 3, // limit each IP to 3 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/execute', limiter);

// Routes
app.post('/api/execute', async (req: Request<{}, any, ExecuteCodeRequest>, res: Response): Promise<void> => {
  try {
    const { code, language, input = '', testCases } = req.body;
    
    if (!code || !language) {
      res.status(400).json({ error: 'Code and language are required' });
      return;
    }

    if (!languageManager.isSupported(language)) {
      res.status(400).json({ 
        error: 'Unsupported language',
        supportedLanguages: languageManager.getSupportedLanguages()
      });
      return;
    }

    // Validate test cases if provided
    if (testCases && !Array.isArray(testCases)) {
      res.status(400).json({ error: 'testCases must be an array' });
      return;
    }

    if (testCases && testCases.length > 0) {
      for (const testCase of testCases) {
        if (!testCase || typeof testCase.input !== 'string' || typeof testCase.expected !== 'string') {
          res.status(400).json({ 
            error: 'Each test case must have input and expected properties as strings' 
          });
          return;
        }
      }
    }

    const jobId = uuidv4();
    
    // Add job to queue
    await codeQueue.add('execute', {
      id: jobId,
      code,
      language,
      input,
      testCases,
      timestamp: new Date().toISOString()
    } as JobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50
    });

    res.json({
      id: jobId,
      status: 'queued',
      message: 'Code execution queued successfully'
    });

  } catch (error) {
    console.error('Error queuing job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/status/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Try to get result from Redis first
    const result = await redisClient.get(`result:${id}`);
    if (result) {
      res.json(JSON.parse(result));
      return;
    }

    // Check job status in queue
    const job = await codeQueue.getJob(id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const state = await job.getState();
    
    res.json({
      id,
      status: state,
      progress: job.progress()
    });

  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/result/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await redisClient.get(`result:${id}`);
    if (!result) {
      res.status(404).json({ error: 'Result not found' });
      return;
    }

    res.json(JSON.parse(result));

  } catch (error) {
    console.error('Error getting result:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req: Request, res: Response<HealthResponse>): void => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString()
  });
});

app.get('/api/languages', (req: Request, res: Response<LanguagesResponse>): void => {
  try {
    res.json({
      languages: languageManager.getLanguageInfo(),
      count: languageManager.getSupportedLanguages().length
    });
  } catch (error) {
    console.error('Error getting languages:', error);
    res.status(500).json({ error: 'Internal server error' } as any);
  }
});

// Process jobs
codeQueue.process('execute', async (job: Queue.Job<JobData>) => {
  const { id, code, language, input, testCases } = job.data;
  
  try {
    job.progress(10);
    
    const result = await executeCode(code, language, input, testCases);
    
    job.progress(90);
    
    // Store result in Redis with 1 hour expiry
    const jobResult: JobResult = {
      id,
      status: 'completed',
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      testCases: result.testCases,
      timestamp: new Date().toISOString()
    };
    
    await redisClient.setEx(`result:${id}`, 3600, JSON.stringify(jobResult));
    
    job.progress(100);
    
    return { success: true };
    
  } catch (error) {
    console.error('Execution error:', error);
    
    // Store error result
    const errorResult: JobResult = {
      id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
    
    await redisClient.setEx(`result:${id}`, 3600, JSON.stringify(errorResult));
    
    throw error;
  }
});

// Queue event handlers
codeQueue.on('completed', (job: Queue.Job) => {
  console.log(`Job ${job.id} completed`);
});

codeQueue.on('failed', (job: Queue.Job, err: Error) => {
  console.error(`Job ${job.id} failed:`, err);
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Load language configurations
    console.log('Loading language configurations...');
    await languageManager.loadLanguages();
    
    console.log(`Connecting to Redis at: redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
    await redisClient.connect();
    console.log('Connected to Redis');
    
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`Available languages: http://localhost:${port}/api/languages`);
      console.log(`Supported languages: ${languageManager.getSupportedLanguages().join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer().catch(console.error);
