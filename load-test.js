/**
 * Load Test Script for Sentinel Code Execution Service
 * Tests capacity for 200 concurrent users with realistic usage patterns
 */

const https = require('http');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:8910';
const TOTAL_USERS = 200;
const TEST_DURATION_MS = 60000; // 1 minute test
const REQUESTS_PER_USER_PER_MINUTE = 2; // Average user submits 2 jobs per minute

// Sample code snippets for different languages
const TEST_CODES = {
  python: [
    'print("Hello World")',
    'x = 5\ny = 10\nprint(x + y)',
    'for i in range(3):\n    print(f"Number: {i}")',
    'import math\nprint(math.sqrt(16))'
  ],
  java: [
    'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}',
    'public class Main {\n    public static void main(String[] args) {\n        int x = 5, y = 10;\n        System.out.println(x + y);\n    }\n}',
    'public class Main {\n    public static void main(String[] args) {\n        for(int i = 0; i < 3; i++) {\n            System.out.println("Number: " + i);\n        }\n    }\n}'
  ],
  javascript: [
    'console.log("Hello World");',
    'const x = 5, y = 10;\nconsole.log(x + y);',
    'for(let i = 0; i < 3; i++) {\n    console.log(`Number: ${i}`);\n}'
  ]
};

const LANGUAGES = Object.keys(TEST_CODES);

class LoadTester {
  constructor() {
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      responseTimes: [],
      errors: [],
      concurrentJobs: 0,
      maxConcurrentJobs: 0
    };
    this.activeRequests = new Set();
  }

  async makeRequest(userId, requestId) {
    const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
    const codeOptions = TEST_CODES[language];
    const code = codeOptions[Math.floor(Math.random() * codeOptions.length)];

    const requestData = JSON.stringify({
      code: code,
      language: language
    });

    const options = {
      hostname: 'localhost',
      port: 8910,
      path: '/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const startTime = performance.now();
    this.results.totalRequests++;
    this.concurrentJobs++;
    this.results.maxConcurrentJobs = Math.max(this.results.maxConcurrentJobs, this.concurrentJobs);

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const endTime = performance.now();
          const responseTime = endTime - startTime;
          this.results.responseTimes.push(responseTime);
          this.concurrentJobs--;

          if (res.statusCode === 200) {
            this.results.successfulRequests++;
            try {
              const result = JSON.parse(data);
              console.log(`✅ User ${userId} Job ${requestId}: ${result.id} (${language}) - ${responseTime.toFixed(2)}ms`);
            } catch (e) {
              console.log(`✅ User ${userId} Job ${requestId}: Success - ${responseTime.toFixed(2)}ms`);
            }
          } else {
            this.results.failedRequests++;
            this.results.errors.push(`HTTP ${res.statusCode}: ${data}`);
            console.log(`❌ User ${userId} Job ${requestId}: Failed (${res.statusCode}) - ${responseTime.toFixed(2)}ms`);
          }
          resolve();
        });
      });

      req.on('error', (error) => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        this.concurrentJobs--;
        this.results.failedRequests++;
        this.results.errors.push(error.message);
        console.log(`❌ User ${userId} Job ${requestId}: Error - ${error.message} - ${responseTime.toFixed(2)}ms`);
        resolve();
      });

      req.write(requestData);
      req.end();
    });
  }

  async simulateUser(userId) {
    const requestInterval = 60000 / REQUESTS_PER_USER_PER_MINUTE; // ms between requests
    let requestId = 1;

    const userPromises = [];

    // Stagger initial requests to avoid thundering herd
    const initialDelay = Math.random() * 5000; // 0-5 second random delay
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    const endTime = Date.now() + TEST_DURATION_MS;
    
    while (Date.now() < endTime) {
      const requestPromise = this.makeRequest(userId, requestId++);
      userPromises.push(requestPromise);

      // Wait for next request interval (with some randomness)
      const nextDelay = requestInterval + (Math.random() - 0.5) * 2000; // ±1 second variance
      await new Promise(resolve => setTimeout(resolve, Math.max(100, nextDelay)));
    }

    return Promise.all(userPromises);
  }

  async runLoadTest() {
    console.log(`🚀 Starting load test with ${TOTAL_USERS} users for ${TEST_DURATION_MS/1000} seconds`);
    console.log(`📊 Each user will submit ~${REQUESTS_PER_USER_PER_MINUTE} requests per minute`);
    console.log(`📈 Expected total requests: ~${TOTAL_USERS * REQUESTS_PER_USER_PER_MINUTE * (TEST_DURATION_MS/60000)}`);
    console.log('');

    const startTime = Date.now();

    // Create all user simulations
    const userPromises = [];
    for (let i = 1; i <= TOTAL_USERS; i++) {
      userPromises.push(this.simulateUser(i));
    }

    // Run periodic status updates
    const statusInterval = setInterval(() => {
      console.log(`📊 Status: ${this.results.successfulRequests}✅ ${this.results.failedRequests}❌ | Active: ${this.concurrentJobs} | Max Concurrent: ${this.results.maxConcurrentJobs}`);
    }, 5000);

    // Wait for all users to complete
    await Promise.all(userPromises);
    clearInterval(statusInterval);

    const totalTime = Date.now() - startTime;
    this.calculateResults(totalTime);
    this.printResults();
  }

  calculateResults(totalTime) {
    if (this.results.responseTimes.length > 0) {
      this.results.avgResponseTime = this.results.responseTimes.reduce((a, b) => a + b, 0) / this.results.responseTimes.length;
    }
    this.results.totalTime = totalTime;
    this.results.requestsPerSecond = this.results.totalRequests / (totalTime / 1000);
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`⏱️  Total Test Time: ${(this.results.totalTime / 1000).toFixed(2)} seconds`);
    console.log(`📊 Total Requests: ${this.results.totalRequests}`);
    console.log(`✅ Successful Requests: ${this.results.successfulRequests} (${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`❌ Failed Requests: ${this.results.failedRequests} (${((this.results.failedRequests / this.results.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`📈 Requests per Second: ${this.results.requestsPerSecond.toFixed(2)}`);
    console.log(`⚡ Average Response Time: ${this.results.avgResponseTime.toFixed(2)}ms`);
    console.log(`🚀 Max Concurrent Jobs: ${this.results.maxConcurrentJobs}`);
    
    if (this.results.responseTimes.length > 0) {
      const sorted = this.results.responseTimes.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      
      console.log(`📊 Response Time Percentiles:`);
      console.log(`   P50: ${p50.toFixed(2)}ms`);
      console.log(`   P95: ${p95.toFixed(2)}ms`);
      console.log(`   P99: ${p99.toFixed(2)}ms`);
    }

    if (this.results.errors.length > 0) {
      console.log(`⚠️  Top Errors:`);
      const errorCounts = {};
      this.results.errors.forEach(error => {
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      });
      
      Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([error, count]) => {
          console.log(`   ${count}x: ${error}`);
        });
    }

    // Performance assessment
    console.log('\n' + '='.repeat(60));
    console.log('🎯 CAPACITY ASSESSMENT');
    console.log('='.repeat(60));
    
    const successRate = (this.results.successfulRequests / this.results.totalRequests) * 100;
    if (successRate >= 99) {
      console.log('🟢 EXCELLENT: System handles 200 users smoothly with >99% success rate');
    } else if (successRate >= 95) {
      console.log('🟡 GOOD: System handles 200 users well with >95% success rate');
    } else if (successRate >= 90) {
      console.log('🟠 ACCEPTABLE: System handles 200 users with some stress (>90% success rate)');
    } else {
      console.log('🔴 OVERLOADED: System struggles with 200 users (<90% success rate)');
    }

    if (this.results.avgResponseTime < 1000) {
      console.log('🟢 Response times are excellent (<1s average)');
    } else if (this.results.avgResponseTime < 3000) {
      console.log('🟡 Response times are acceptable (<3s average)');
    } else {
      console.log('🔴 Response times are too slow (>3s average)');
    }

    console.log(`💡 Estimated sustainable users: ${Math.floor((200 * successRate) / 100)}`);
  }
}

// Run the load test
const loadTester = new LoadTester();
loadTester.runLoadTest().catch(console.error);
