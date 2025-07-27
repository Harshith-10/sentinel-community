import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import languageManager from './languageManager';
import {
  ExecuteCodeRequest,
  JobData,
  JobResult,
  HealthResponse,
  LanguagesResponse,
  ContainerLoadInfo,
  SystemLoadResponse
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

// Job queues for different languages
const codeQueues: { [key: string]: Queue.Queue } = {};

// Initialize queues for each language dynamically
const initializeQueues = async () => {
  await languageManager.loadLanguages();
  const languages = languageManager.getSupportedLanguages();

  for (const language of languages) {
    const queueName = `${language}-executor`;
    codeQueues[language] = new Queue(queueName, {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
        family: 4,
        connectTimeout: 10000
      }
    });
    console.log(`Initialized queue: ${queueName}`);
  }
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1); // Trust first proxy, important for running behind a load balancer

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// Routes
app.get('/health', async (req: Request, res: Response<HealthResponse>) => {
  try {
    await redisClient.ping();

    // Check all queue connections
    const queueStatuses = await Promise.all(
      Object.entries(codeQueues).map(async ([name, queue]) => {
        try {
          await queue.isReady();
          return { [name]: 'healthy' };
        } catch (error) {
          return { [name]: 'unhealthy' };
        }
      })
    );

    const allQueuesHealthy = queueStatuses.every(status =>
      Object.values(status)[0] === 'healthy'
    );

    res.json({
      status: allQueuesHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      redis: 'connected',
      queues: queueStatuses.reduce((acc, status) => ({ ...acc, ...status }), {})
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      redis: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/languages', (req: Request, res: Response<LanguagesResponse>) => {
  const languages = languageManager.getAllLanguages();
  res.json({
    languages: languages.map(l => ({ name: l.name, displayName: l.displayName })),
    count: languages.length
  });
});

app.get('/load', async (req: Request, res: Response<SystemLoadResponse>) => {
  try {
    const containerLoads: ContainerLoadInfo[] = [];

    for (const [language, queue] of Object.entries(codeQueues)) {
      const waitingCount = await queue.getWaitingCount();
      const activeCount = await queue.getActiveCount();
      const completedCount = await queue.getCompletedCount();
      const failedCount = await queue.getFailedCount();

      containerLoads.push({
        containerId: `${language}-executor`, // This is now a logical grouping, not a specific container
        language,
        waiting: waitingCount,
        active: activeCount,
        completed: completedCount,
        failed: failedCount,
        totalJobs: waitingCount + activeCount + completedCount + failedCount
      });
    }

    res.json({
      timestamp: new Date().toISOString(),
      containers: containerLoads,
      totalWaiting: containerLoads.reduce((sum, c) => sum + c.waiting, 0),
      totalActive: containerLoads.reduce((sum, c) => sum + c.active, 0)
    });
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      containers: [],
      totalWaiting: 0,
      totalActive: 0
    });
  }
});

app.post('/execute', async (req: Request, res: Response<JobResult>) => {
  try {
    const { code, language, input = '', testCases }: ExecuteCodeRequest = req.body;

    if (!code || !language) {
      return res.status(400).json({
        id: '',
        status: 'failed',
        timestamp: new Date().toISOString(),
        message: 'Code and language are required'
      });
    }

    // Validate language
    const langConfig = languageManager.getLanguage(language);
    if (!langConfig) {
      return res.status(400).json({
        id: '',
        status: 'failed',
        timestamp: new Date().toISOString(),
        message: `Unsupported language: ${language}`
      });
    }

    const selectedQueue = codeQueues[language];

    const jobId = uuidv4();
    const jobData: JobData = {
      id: jobId,
      code,
      language,
      input,
      testCases,
      timestamp: new Date().toISOString()
    };

    const job = await selectedQueue.add('execute', jobData, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 50,
      removeOnFail: 20
    });

    console.log(`Job ${jobId} queued on ${language}-executor queue`);

    return res.json({
      id: jobId,
      status: 'queued',
      timestamp: new Date().toISOString(),
      message: `Job queued for ${language}`
    });

  } catch (error) {
    console.error('Error creating job:', error);
    return res.status(500).json({
      id: '',
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/job/:id', async (req: Request, res: Response<JobResult>) => {
  try {
    const { id } = req.params;

    // Search across all queues for the job
    for (const [_language, queue] of Object.entries(codeQueues)) {
      const job = await queue.getJob(id);

      if (job) {
        const state = await job.getState();

        let status: JobResult['status'];
        switch (state) {
          case 'waiting':
            status = 'queued';
            break;
          case 'active':
            status = 'active';
            break;
          case 'completed':
            status = 'completed';
            break;
          case 'failed':
            status = 'failed';
            break;
          default:
            status = 'queued';
        }

        const result: JobResult = {
          id,
          status,
          timestamp: new Date().toISOString(),
          progress: job.progress()
        };

        if (state === 'completed' && job.returnvalue) {
          result.output = job.returnvalue.output;
          result.error = job.returnvalue.error;
          result.executionTime = job.returnvalue.executionTime;
          result.testCases = job.returnvalue.testCases;
        } else if (state === 'failed' && job.failedReason) {
          result.error = job.failedReason;
        }

        return res.json(result);
      }
    }

    return res.status(404).json({
      id,
      status: 'failed',
      timestamp: new Date().toISOString(),
      message: 'Job not found'
    });

  } catch (error) {
    console.error('Error fetching job:', error);
    return res.status(500).json({
      id: req.params.id,
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
let server: http.Server;
const startServer = async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');

    // Initialize queues dynamically
    await initializeQueues();
    console.log('Initialized job queues for all supported languages.');

    server = app.listen(port, () => {
      console.log(`Master server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing server gracefully.');
  server.close(() => {
    console.log('HTTP server closed.');
    redisClient.quit().then(() => {
      console.log('Redis client disconnected.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();