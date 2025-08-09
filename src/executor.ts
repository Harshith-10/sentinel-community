import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import languageManager from './languageManager';
import { ExecutionResult, CommandResult, LanguageConfig, TestCase, TestCaseResult } from './types';

// Use platform-appropriate temp directory
const TEMP_DIR = process.platform === 'win32' ? 'C:\\temp\\code-execution' : '/tmp/code-execution';
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
const CACHE_DIR = process.platform === 'win32' ? 'C:\\temp\\sentinel-cache' : '/tmp/sentinel-cache';

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function hashContent(content: string, salt: string): string {
  return crypto.createHash('sha256').update(salt + '\n' + content).digest('hex');
}

async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function copyDir(srcDir: string, destDir: string): Promise<void> {
  await ensureDir(destDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

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
    
    // Compile if needed with caching for compiled languages
    if (langConfig.compile) {
      // Try to ensure cache dir; failures should not break execution
      try { await ensureDir(CACHE_DIR); } catch { /* ignore */ }
      const cacheKey = hashContent(code, `${langConfig.name}:${langConfig.compile.command}:${langConfig.compile.args.join(' ')}`);
      const langCacheDir = path.join(CACHE_DIR, langConfig.name, cacheKey);

      let cacheHit = false;

      // Try cache hit per language
      if (langConfig.name === 'cpp') {
        const cachedBin = path.join(langCacheDir, 'program');
        if (await pathExists(cachedBin)) {
          await copyFile(cachedBin, path.join(sessionDir, 'program'));
          cacheHit = true;
        }
      } else if (langConfig.name === 'java') {
        // Expect compiled .class files cached directly under langCacheDir
        if (await pathExists(langCacheDir)) {
          // Heuristic: Main.class should exist
          const mainClass = path.join(langCacheDir, 'Main.class');
          if (await pathExists(mainClass)) {
            await copyDir(langCacheDir, sessionDir);
            cacheHit = true;
          }
        }
      } else if (langConfig.name === 'typescript') {
        const cachedDist = path.join(langCacheDir, 'dist');
        if (await pathExists(path.join(cachedDist, 'main.js'))) {
          await copyDir(cachedDist, path.join(sessionDir, 'dist'));
          cacheHit = true;
        }
      }

      if (!cacheHit) {
        const compileArgs = langConfig.compile.args.map(arg => 
          arg.replace('{file}', filepath)
             .replace('{dir}', sessionDir)
             .replace('{filename}', filename)
        );
        
        const compileResult = await runCommand(
          langConfig.compile.command,
          compileArgs,
          sessionDir,
          '',
          langConfig.compile.timeout || 10000
        );

        // Check if compilation failed
        if (compileResult.exitCode !== 0) {
          return {
            output: '',
            error: `Compilation failed: ${compileResult.stderr || compileResult.stdout}`,
            executionTime: Date.now() - startTime,
            status: 'error'
          };
        }

        // Save artifacts to cache
        try { await ensureDir(langCacheDir); } catch { /* ignore */ }
        if (langConfig.name === 'cpp') {
          const bin = path.join(sessionDir, 'program');
          try {
            if (await pathExists(bin)) {
              await copyFile(bin, path.join(langCacheDir, 'program'));
            }
          } catch { /* ignore cache write errors */ }
        } else if (langConfig.name === 'java') {
          // Copy all .class files
          try {
            const entries = await fs.readdir(sessionDir);
            await ensureDir(langCacheDir);
            for (const name of entries) {
              if (name.endsWith('.class')) {
                await copyFile(path.join(sessionDir, name), path.join(langCacheDir, name));
              }
            }
          } catch { /* ignore cache write errors */ }
        } else if (langConfig.name === 'typescript') {
          const distDir = path.join(sessionDir, 'dist');
          try {
            if (await pathExists(distDir)) {
              await copyDir(distDir, path.join(langCacheDir, 'dist'));
            }
          } catch { /* ignore cache write errors */ }
        }
      }
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
      timeout,
      windowsHide: true
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

    // Send input if provided and close stdin
    if (process.stdin) {
      if (input) {
        process.stdin.write(input);
      }
      process.stdin.end();
    }
  });
}