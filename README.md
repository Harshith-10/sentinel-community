# Remote Code Execution Service - Sentinel

A scalable multi-container remote code execution service with language-specific containers, load balancing, and intelligent job distribution. Built with TypeScript and designed for high-performance code execution at scale.

## 🏗️ Architecture

### Multi-Container Design
- **Master Container**: API server, job orchestration, and load balancing
- **Language-Specific Containers**: Isolated execution environments
  - 2x Python containers (high demand)
  - 2x Java containers (high demand)  
  - 1x JavaScript container
  - 1x C++ container
  - 1x Go container

### Benefits
- **Better Isolation**: Each language runs in its optimized environment
- **Scalability**: Independent scaling of language containers based on demand
- **Load Balancing**: Intelligent job distribution across containers
- **Resource Optimization**: Language-specific resource allocation
- **Fault Tolerance**: Container failures don't affect other languages

## Features

- **Multi-language support**: JavaScript, Python, Java, C++, Go
- **Test case execution**: Run code against multiple test cases with automatic result comparison
- **Intelligent load balancing**: Distributes jobs to least loaded containers
- **Container monitoring**: Real-time load and performance metrics
- **Asynchronous execution**: Redis-based job queue with Bull
- **Security**: Sandboxed execution in isolated containers
- **Rate limiting**: IP-based request limiting
- **Health monitoring**: Comprehensive health checks for all services
- **Horizontal scaling**: Easy to add more language containers
- **TypeScript**: Full TypeScript support with strict type checking

## Quick Start

### Production Deployment

```bash
# Clone and navigate to project directory
git clone <your-repo>
cd sentinel

# Start all services (master + 7 executor containers)
docker-compose up -d

# Check system health and load
curl http://localhost:8910/health
curl http://localhost:8910/load
```

### Development Setup

```bash
# Use development compose (fewer containers)
docker-compose -f docker-compose.dev.yml up -d

# Or run locally with hot-reload
npm install
npm run dev:master    # Start master server
npm run dev:executor  # Start executor worker
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
```http
POST /execute
```

Submit code for execution with automatic load balancing across containers.

#### Single Input Mode (Backward Compatible)
```json
{
  "code": "console.log('Hello, World!');",
  "language": "javascript",
  "input": "optional input"
}
```

#### Test Cases Mode
```json
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
  "timestamp": "2025-01-15T10:30:00.000Z",
  "message": "Job queued on python-1"
}
```

### Check Job Status
```http
GET /job/{job-id}
```

Response:
```json
{
  "id": "uuid-job-id",
  "status": "completed",
  "timestamp": "2025-01-15T10:30:15.000Z",
  "output": "10\n6\n0",
  "error": "",
  "executionTime": 150,
  "testCases": [
    {
      "input": "5",
      "expected": "10",
      "actualOutput": "10",
      "passed": true,
      "executionTime": 45
    }
  ]
}
```

### System Health & Monitoring
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "redis": "connected",
  "queues": {
    "python-1": "healthy",
    "python-2": "healthy",
    "java-1": "healthy",
    "java-2": "healthy",
    "javascript-1": "healthy",
    "cpp-1": "healthy",
    "go-1": "healthy"
  }
}
```

### Container Load Monitoring
```http
GET /load
```

Response:
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "totalWaiting": 5,
  "totalActive": 3,
  "containers": [
    {
      "containerId": "python-1",
      "language": "python",
      "waiting": 2,
      "active": 1,
      "completed": 150,
      "failed": 2,
      "totalJobs": 155
    },
    {
      "containerId": "java-1",
      "language": "java",
      "waiting": 3,
      "active": 2,
      "completed": 98,
      "failed": 1,
      "totalJobs": 104
    }
  ]
}
```

### Supported Languages
```http
GET /languages
```

### Check Status (Legacy)
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

## 🚀 Scaling & Operations

### Horizontal Scaling

Scale language containers based on demand:

```bash
# Scale Python containers to 4 instances
docker-compose up -d --scale python-executor-1=2 --scale python-executor-2=2

# Scale Java containers to 3 instances  
docker-compose up -d --scale java-executor-1=2 --scale java-executor-2=1

# Add more language support
docker-compose up -d --scale cpp-executor=2
```

### Container Management

```bash
# View container status
docker-compose ps

# Check container logs
docker-compose logs python-executor-1
docker-compose logs master

# Restart specific language containers
docker-compose restart python-executor-1 python-executor-2

# Update containers without downtime
docker-compose up -d --no-deps master python-executor-1
```

### Performance Monitoring

```bash
# Monitor system load
curl http://localhost:8910/load | jq

# Check health status
curl http://localhost:8910/health | jq

# View specific container metrics
docker stats sentinel_python-executor-1_1
```

### Configuration

Language containers automatically detect their environment and register with Redis. No manual configuration needed.

The master container uses intelligent load balancing:
- Routes jobs to containers with the lowest queue size
- Monitors container health and availability  
- Provides real-time metrics via `/load` endpoint

## License

MIT