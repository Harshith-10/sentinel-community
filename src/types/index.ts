export interface LanguageConfig {
  name: string;
  displayName: string;
  extension: string;
  command: string;
  args: string[];
  timeout: number;
  compile?: {
    command: string;
    args: string[];
    timeout: number;
  };
  filename?: string;
}

export interface ExecutionResult {
  output: string;
  error: string;
  executionTime: number;
  status: 'success' | 'error';
  testCases?: TestCaseResult[]; // For multiple test cases
}

export interface JobData {
  id: string;
  code: string;
  language: string;
  input: string;
  testCases?: TestCase[];
  timestamp: string;
}

export interface JobResult {
  id: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  output?: string;
  error?: string;
  executionTime?: number;
  testCases?: TestCaseResult[];
  timestamp: string;
  message?: string;
  progress?: number;
}

export interface TestCase {
  input: string;
  expected: string;
}

export interface TestCaseResult {
  input: string;
  expected: string;
  actualOutput: string;
  passed: boolean;
  error?: string;
  executionTime: number;
}

export interface ExecuteCodeRequest {
  code: string;
  language: string;
  input?: string; // Keep for backward compatibility
  testCases?: TestCase[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface LanguageInfo {
  name: string;
  displayName: string;
  description?: string;
  example?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  redis?: string;
  queues?: { [key: string]: string };
  error?: string;
}

export interface LanguagesResponse {
  languages: LanguageInfo[];
  count: number;
}

export interface ContainerLoadInfo {
  containerId: string;
  language: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  totalJobs: number;
}

export interface SystemLoadResponse {
  timestamp: string;
  containers: ContainerLoadInfo[];
  totalWaiting: number;
  totalActive: number;
  error?: string;
}
