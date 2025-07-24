# Remote Code Execution Service - Sentinel

A scalable, cloud-native remote code execution service designed for high-performance and automatic scaling with Kubernetes.

## 🏗️ Architecture

### Cloud-Native Design with Kubernetes
- **Master Service**: A highly available API server that orchestrates job distribution.
- **Language-Specific Executor Pods**: Isolated and independently scalable execution environments for each language.
- **Redis**: Acts as the message broker for the job queue.
- **KEDA (Kubernetes Event-driven Autoscaling)**: Provides automatic scaling of executor pods based on the number of jobs in the queue.

### Benefits
- **Massive Scalability**: Horizontally scales to handle thousands of concurrent users.
- **Intelligent Autoscaling**: Automatically adjusts the number of language-specific pods based on real-time demand, scaling down to zero to save costs.
- **High Availability**: Replicated master and executor services ensure resilience and no single point of failure.
- **Resource Optimization**: Fine-grained resource allocation and autoscaling for each language.
- **Fault Tolerance**: The system is self-healing, with Kubernetes automatically replacing failed pods.

## Features

- **Multi-language support**: JavaScript, Python, Java, C++, Go
- **Test case execution**: Run code against multiple test cases with automatic result comparison
- **Intelligent load balancing**: Distributes jobs to the least loaded containers.
- **Asynchronous execution**: Redis-based job queue with Bull.
- **Security**: Sandboxed execution in isolated containers with a non-root user.
- **IP-based Rate limiting**: Protects the service from abuse.
- **Health monitoring**: Comprehensive health checks for all services.
- **TypeScript**: Full TypeScript support with strict type checking.

## 🚀 Kubernetes Deployment

**Prerequisites:**
* A running Kubernetes cluster.
* `kubectl` configured to connect to your cluster.
* [KEDA](https://keda.sh/docs/2.10/deploy/) installed in your cluster.
* Docker images for the services pushed to a container registry.

1.  **Build and Push Docker Images**:
    Replace `your-docker-repo` in `package.json` with your Docker Hub username or private registry.
    ```bash
    npm run docker:build
    npm run docker:push
    ```

2.  **Deploy to Kubernetes**:
    Navigate to the `k8s` directory and apply the manifests.
    ```bash
    cd k8s
    kubectl apply -f .
    ```

3.  **Access the Service**:
    Find the external IP of the `sentinel-master-service`.
    ```bash
    kubectl get services
    ```
    You can then access the API at `http://<EXTERNAL-IP>`.

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

## 🛡️ Security Considerations

**Current Implementation:**
- **Container Security**: Executors run as a non-root user.
- **Resource Limits**: Kubernetes deployments have CPU and memory limits.
- **Rate Limiting**: IP-based rate limiting is in place.
- **Network Policies**: (Recommended) Implement Kubernetes NetworkPolicies to restrict communication between pods.

**Production Recommendations:**
- **gVisor or Kata Containers**: Use sandboxed container runtimes for stronger isolation.
- **Seccomp and AppArmor**: Apply security profiles to restrict the system calls that can be made from within a container.
- **Managed Redis**: Use a managed Redis service for better security and reliability.
- **Ingress Controller**: Use an Ingress controller with a WAF (Web Application Firewall) for advanced traffic filtering and security.
- **Secrets Management**: Store sensitive information like API keys and database credentials in Kubernetes Secrets.

## License

MIT