# Remote Code Execution Service

A minimal but functional remote code execution service similar to Judge0, supporting multiple programming languages with Docker containerization and Redis-based job queuing. Built with TypeScript for enhanced type safety and developer experience.

## Features

- **Multi-language support**: JavaScript, Python, Java, C++, Go
- **Test case execution**: Run code against multiple test cases with automatic result comparison
- **Asynchronous execution**: Redis-based job queue with Bull
- **Security**: Basic sandboxing and resource limits
- **Rate limiting**: IP-based request limiting
- **Health monitoring**: Built-in health checks
- **Docker support**: Containerized for easy deployment
- **TypeScript**: Full TypeScript support with strict type checking
- **Modern tooling**: ESLint, development watch mode, and automated building
- **Backward compatibility**: Supports both single input and test case modes

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone and navigate to project directory
git clone <your-repo>
cd remote-code-execution

# Start services
docker-compose up -d

# Check health
curl http://localhost:8910/health
```

### Local Development

```bash
# Install dependencies
npm install

# Start Redis (required)
docker run -d -p 6379:6379 redis:7-alpine

# Build TypeScript
npm run build

# Start development server (with auto-restart)
npm run dev

# Or start production server
npm start
```

## Development Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start development server with hot reload
- `npm run dev:watch` - Watch mode for TypeScript compilation
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix

## API Endpoints

### Execute Code

#### Single Input Mode (Backward Compatible)
```http
POST /api/execute
Content-Type: application/json

{
  "code": "console.log('Hello, World!');",
  "language": "javascript",
  "input": "optional input"
}
```

#### Test Cases Mode
```http
POST /api/execute
Content-Type: application/json

{
  "code": "n = int(input())\nprint(n * 2)",
  "language": "python",
  "testCases": [
    { "input": "5", "expected": "10" },
    { "input": "3", "expected": "6" },
    { "input": "0", "expected": "0" }
  ]
}
```

Response:
```json
{
  "id": "uuid-job-id",
  "status": "queued",
  "message": "Code execution queued successfully"
}
```

### Check Status
```http
GET /api/status/{job-id}
```

Response:
```json
{
  "id": "uuid-job-id",
  "status": "completed",
  "progress": 100
}
```

### Get Result

#### Single Input Result
```http
GET /api/result/{job-id}
```

Response:
```json
{
  "id": "uuid-job-id",
  "status": "completed",
  "output": "Hello, World!",
  "error": "",
  "executionTime": 150,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

#### Test Cases Result
```http
GET /api/result/{job-id}
```

Response:
```json
{
  "id": "uuid-job-id",
  "status": "completed",
  "executionTime": 450,
  "timestamp": "2025-01-15T10:30:00.000Z",
  "testCases": [
    {
      "input": "5",
      "expected": "10",
      "actualOutput": "10",
      "passed": true,
      "executionTime": 150
    },
    {
      "input": "3",
      "expected": "6",
      "actualOutput": "6",
      "passed": true,
      "executionTime": 140
    },
    {
      "input": "0",
      "expected": "0",
      "actualOutput": "0",
      "passed": true,
      "executionTime": 135
    }
  ]
}
```

### Other Endpoints

#### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

#### Get Supported Languages
```http
GET /api/languages
```

Response:
```json
{
  "languages": [
    {
      "name": "python",
      "displayName": "Python",
      "description": "Execute Python code using Python 3",
      "example": "print('Hello, World!')"
    }
  ],
  "count": 5
}
```

## Supported Languages

- **JavaScript** (Node.js)
- **Python** (Python 3)
- **Java** (OpenJDK 11)
- **C++** (g++)
- **Go**

## Example Usage

```javascript
// Submit code for execution
const response = await fetch('http://localhost:8910/api/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: 'print("Hello from Python!")',
    language: 'python'
  })
});

const { id } = await response.json();

// Poll for results
const pollResult = async () => {
  const result = await fetch(`http://localhost:8910/api/result/${id}`);
  if (result.ok) {
    const data = await result.json();
    console.log(data.output); // "Hello from Python!"
  }
};

setTimeout(pollResult, 2000);
```

## Test Cases Usage Examples

### Example 1: Simple Math Operations
```javascript
// JavaScript example for doubling numbers
const request = {
  code: `
const num = parseInt(process.argv[2] || '0');
console.log(num * 2);
  `,
  language: "javascript",
  testCases: [
    { input: "5", expected: "10" },
    { input: "0", expected: "0" },
    { input: "-3", expected: "-6" }
  ]
};
```

### Example 2: String Processing
```python
# Python example for reversing strings
request = {
  "code": """
s = input().strip()
print(s[::-1])
""",
  "language": "python",
  "testCases": [
    { "input": "hello", "expected": "olleh" },
    { "input": "world", "expected": "dlrow" },
    { "input": "a", "expected": "a" },
    { "input": "", "expected": "" }
  ]
}
```

### Example 3: Complex Algorithm Testing
```cpp
// C++ example for factorial calculation
{
  "code": "#include <iostream>\nusing namespace std;\nint main() {\n  int n;\n  cin >> n;\n  long long fact = 1;\n  for(int i = 1; i <= n; i++) {\n    fact *= i;\n  }\n  cout << fact << endl;\n  return 0;\n}",
  "language": "cpp",
  "testCases": [
    { "input": "0", "expected": "1" },
    { "input": "1", "expected": "1" },
    { "input": "5", "expected": "120" },
    { "input": "10", "expected": "3628800" }
  ]
}
```

## Test Case Features

- **Automatic Output Comparison**: Each test case compares actual output with expected output
- **Individual Timing**: Each test case has its own execution time measurement
- **Error Handling**: Errors in individual test cases don't stop execution of remaining cases
- **Pass/Fail Status**: Each test case returns a boolean `passed` status
- **Detailed Results**: Full input, expected, and actual output for each test case
- **Backward Compatibility**: Single input mode still works alongside test cases

## Response Format for Test Cases

Each test case result includes:
- `input`: The input provided to the code
- `expected`: The expected output
- `actualOutput`: The actual output from code execution
- `passed`: Boolean indicating if actualOutput matches expected
- `error`: Error message if execution failed (optional)
- `executionTime`: Time taken for this specific test case in milliseconds

## Security Considerations

**Current Implementation:**
- Basic process isolation
- Execution timeout (30 seconds)
- Output size limits (1MB)
- Rate limiting (100 requests per 15 minutes)
- No network access from executed code

**Production Recommendations:**
- Use Docker with additional security constraints
- Implement proper container orchestration
- Add input validation and sanitization
- Use dedicated execution environments
- Implement user authentication and authorization
- Add comprehensive logging and monitoring

## Configuration

Environment variables:
- `PORT`: Server port (default: 8910)
- `REDIS_HOST`: Redis host (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `NODE_ENV`: Environment (development/production)

## Architecture

```
Client Request → Express Server → Redis Queue → Job Worker → Docker Container → Result Storage
```

## Next Steps

1. **Enhanced Security**: Add gVisor, seccomp profiles, and network restrictions
2. **Kubernetes Deployment**: Scale with container orchestration
3. **Monitoring**: Add Prometheus metrics and centralized logging
4. **User Management**: Authentication and resource quotas
5. **Language Extensions**: Add more programming languages
6. **WebSocket Support**: Real-time execution updates
7. **File Upload**: Support for multi-file projects

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build Docker image
npm run docker:build

# Run Docker container
npm run docker:run
```

## License

MIT