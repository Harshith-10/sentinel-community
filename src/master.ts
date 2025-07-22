import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
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

// Initialize queues for each language with load balancing
const initializeQueues = () => {
  // Python queues (2 containers)
  codeQueues['python-1'] = new Queue('python-executor-1', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });
  
  codeQueues['python-2'] = new Queue('python-executor-2', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });

  // Java queues (2 containers)
  codeQueues['java-1'] = new Queue('java-executor-1', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });
  
  codeQueues['java-2'] = new Queue('java-executor-2', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });

  // Single container languages
  codeQueues['javascript-1'] = new Queue('javascript-executor', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });

  codeQueues['cpp-1'] = new Queue('cpp-executor', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });

  codeQueues['go-1'] = new Queue('go-executor', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379') || 6379,
      family: 4,
      connectTimeout: 10000
    }
  });
};

// Load balancer for selecting the best container
const selectContainer = async (language: string): Promise<string> => {
  const containers = getContainersForLanguage(language);
  
  if (containers.length === 1) {
    return containers[0];
  }

  // Load balancing logic: choose container with lowest queue size
  let bestContainer = containers[0];
  let lowestQueueSize = await codeQueues[bestContainer].getWaiting();

  for (const container of containers.slice(1)) {
    const queueSize = await codeQueues[container].getWaiting();
    if (queueSize.length < lowestQueueSize.length) {
      lowestQueueSize = queueSize;
      bestContainer = container;
    }
  }

  return bestContainer;
};

const getContainersForLanguage = (language: string): string[] => {
  switch (language) {
    case 'python':
      return ['python-1', 'python-2'];
    case 'java':
      return ['java-1', 'java-2'];
    case 'javascript':
      return ['javascript-1'];
    case 'cpp':
      return ['cpp-1'];
    case 'go':
      return ['go-1'];
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting - Optimized for higher capacity
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (supports ~200 users/IP)
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
    languages,
    count: languages.length
  });
});

app.get('/load', async (req: Request, res: Response<SystemLoadResponse>) => {
  try {
    const containerLoads: ContainerLoadInfo[] = [];

    for (const [containerId, queue] of Object.entries(codeQueues)) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      containerLoads.push({
        containerId,
        language: containerId.split('-')[0],
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        totalJobs: waiting.length + active.length + completed.length + failed.length
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

    // Select best container for the language
    const selectedContainer = await selectContainer(language);
    const selectedQueue = codeQueues[selectedContainer];

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

    console.log(`Job ${jobId} queued on container ${selectedContainer}`);

    return res.json({
      id: jobId,
      status: 'queued',
      timestamp: new Date().toISOString(),
      message: `Job queued on ${selectedContainer}`
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
    for (const [containerId, queue] of Object.entries(codeQueues)) {
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
const startServer = async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
    
    // Load language configurations
    await languageManager.loadLanguages();
    console.log('Loaded language configurations');
    
    initializeQueues();
    console.log('Initialized job queues for all language containers');
    
    app.listen(port, () => {
      console.log(`Master server running on port ${port}`);
      console.log('Container architecture:');
      console.log('- Python: 2 containers (load balanced)');
      console.log('- Java: 2 containers (load balanced)');
      console.log('- JavaScript: 1 container');
      console.log('- C++: 1 container');
      console.log('- Go: 1 container');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
