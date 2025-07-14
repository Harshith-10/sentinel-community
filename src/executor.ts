import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import languageManager from './languageManager';
import { ExecutionResult, CommandResult, LanguageConfig, TestCase, TestCaseResult } from './types';

const TEMP_DIR = '/tmp/code-execution';
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

export async function executeCode(code: string, language: string, input = '', testCases?: TestCase[]): Promise<ExecutionResult> {
  const startTime = Date.now();
  
  // Get language configuration
  const langConfig = languageManager.getLanguage(language);
  if (!langConfig) {
    throw new Error(`Unsupported language: ${language}`);
  }

  // Create unique session directory
  const sessionId = uuidv4();
  const sessionDir = path.join(TEMP_DIR, sessionId);
  
  try {
    await fs.mkdir(sessionDir, { recursive: true });
    
    // Create source file
    const filename = langConfig.filename || `main${langConfig.extension}`;
    const filepath = path.join(sessionDir, filename);
    await fs.writeFile(filepath, code);
    
    // Compile if needed
    if (langConfig.compile) {
      const compileArgs = langConfig.compile.args.map(arg => 
        arg.replace('{file}', filepath)
           .replace('{dir}', sessionDir)
           .replace('{filename}', filename)
      );
      
      await runCommand(
        langConfig.compile.command,
        compileArgs,
        sessionDir,
        '',
        langConfig.compile.timeout || 10000
      );
    }
    
    // If test cases are provided, execute for each test case
    if (testCases && testCases.length > 0) {
      const testCaseResults: TestCaseResult[] = [];
      
      for (const testCase of testCases) {
        const testStartTime = Date.now();
        
        try {
          const executeArgs = langConfig.args.map(arg => 
            arg.replace('{file}', filepath)
               .replace('{dir}', sessionDir)
               .replace('{filename}', filename)
          );
          
          const result = await runCommand(
            langConfig.command,
            executeArgs,
            sessionDir,
            testCase.input,
            langConfig.timeout
          );
          
          const testExecutionTime = Date.now() - testStartTime;
          const actualOutput = result.stdout.trim();
          const expected = testCase.expected.trim();
          
          testCaseResults.push({
            input: testCase.input,
            expected: testCase.expected,
            actualOutput,
            passed: actualOutput === expected,
            error: result.stderr || undefined,
            executionTime: testExecutionTime
          });
          
        } catch (error) {
          const testExecutionTime = Date.now() - testStartTime;
          
          testCaseResults.push({
            input: testCase.input,
            expected: testCase.expected,
            actualOutput: '',
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            executionTime: testExecutionTime
          });
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        output: '',
        error: '',
        executionTime,
        status: 'success',
        testCases: testCaseResults
      };
    }
    
    // Execute code with single input (backward compatibility)
    const executeArgs = langConfig.args.map(arg => 
      arg.replace('{file}', filepath)
         .replace('{dir}', sessionDir)
         .replace('{filename}', filename)
    );
    
    const result = await runCommand(
      langConfig.command,
      executeArgs,
      sessionDir,
      input,
      langConfig.timeout
    );
    
    const executionTime = Date.now() - startTime;
    
    return {
      output: result.stdout,
      error: result.stderr,
      executionTime,
      status: 'success'
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime,
      status: 'error'
    };
    
  } finally {
    // Cleanup
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
  }
}

function runCommand(
  command: string, 
  args: string[], 
  cwd: string, 
  input: string, 
  timeout: number
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const process: ChildProcess = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      process.kill('SIGKILL');
      reject(new Error('Execution timeout'));
    }, timeout);

    // Handle stdout
    process.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_SIZE) {
        killed = true;
        process.kill('SIGKILL');
        reject(new Error('Output size exceeded limit'));
      }
    });

    // Handle stderr
    process.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_SIZE) {
        killed = true;
        process.kill('SIGKILL');
        reject(new Error('Error output size exceeded limit'));
      }
    });

    // Handle process exit
    process.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      if (!killed) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0
        });
      }
    });

    // Handle process error
    process.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      if (!killed) {
        reject(error);
      }
    });

    // Send input if provided
    if (input && process.stdin) {
      process.stdin.write(input);
      process.stdin.end();
    }
  });
}
