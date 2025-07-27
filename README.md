# Remote Code Execution Service - Sentinel

Sentinel is a scalable, cloud-native remote code execution service designed for high performance, fault tolerance, and intelligent, event-driven autoscaling with Kubernetes and KEDA.

## 🏗️ Architecture: Event-Driven & Auto-Scaling

Sentinel's architecture is built for the cloud, leveraging Kubernetes for orchestration and KEDA for event-driven autoscaling. This design ensures that resources are used efficiently, scaling up to meet high demand and scaling down to zero during idle periods to save costs.

-   **Master Service**: A highly available API server that validates requests and places code execution jobs onto language-specific Redis queues. It also provides endpoints for monitoring system health and job status.
-   **Language-Specific Executor Pods**: Each programming language runs in its own isolated, sandboxed environment. These pods are stateless workers that process jobs from their designated Redis queue.
-   **Redis**: Acts as a lightweight, high-performance message broker for the job queues.
-   **KEDA (Kubernetes Event-driven Autoscaling)**: The core of the autoscaling system. KEDA monitors the length of the Redis list (queue) for each language. If the number of jobs in a queue exceeds a defined threshold, KEDA automatically scales up the number of executor pods for that specific language. When the queue is empty, KEDA scales the pods back down, even to zero.

### Benefits

-   **Massive Scalability**: Horizontally scales to handle thousands of concurrent execution requests.
-   **Intelligent Autoscaling**: Automatically adjusts the number of language-specific pods based on real-time demand, scaling down to zero to minimize costs.
-   **High Availability**: With replicated master services and stateless, auto-scaling executors, the system is resilient with no single point of failure.
-   **Resource Optimization**: Fine-grained resource allocation and autoscaling for each language ensures optimal cloud resource consumption.
-   **Fault Tolerance**: The system is self-healing; Kubernetes automatically replaces any failed master or executor pods.

## ✨ Features

-   **Multi-language support**: Execute code in Python, JavaScript, Java, C++, Go, Rust, and more.
-   **Test Case Execution**: Run submitted code against multiple test cases and receive a detailed report with results for each case.
-   **Asynchronous Job Processing**: Utilizes a Redis-based job queue (Bull) for non-blocking, asynchronous code execution.
-   **Sandboxed & Secure**: Code execution occurs in isolated Docker containers running as a non-root user. Resource limits are enforced by Kubernetes to prevent abuse.
-   **Rate Limiting**: Protects the service from abuse with IP-based rate limiting.
-   **Dynamic Language Management**: Easily add or remove support for new languages using a powerful management script without changing the core application logic.
-   **Comprehensive Monitoring**: Provides endpoints to monitor system health, queue status, and job statistics in real-time.

## 🚀 Kubernetes Deployment

**Prerequisites:**
* A running Kubernetes cluster.
* `kubectl` configured to connect to your cluster.
* [KEDA](https://keda.sh/docs/latest/deploy/) installed in your cluster.
* A Docker Hub account or other container registry to push images to.

**1. Configure Docker Repository**

Before building, open `package.json` and replace `harshithd` in the `docker:build` and `docker:push` scripts with your Docker Hub username or private registry prefix.

**2. Build and Push Docker Images**

Run the following commands to build the master image and an executor image for each supported language, then push them to your registry.

```bash
# Build all Docker images
npm run docker:build

# Push all Docker images
npm run docker:push
```

**3. Deploy to Kubernetes**

Apply all the Kubernetes manifests, which include deployments for Redis, the master service, and the executor services, along with the KEDA ScaledObjects.

```bash
kubectl apply -f k8s/
```

**4. Access the Service**

Find the external IP address of the master service to start sending requests.

```bash
kubectl get services sentinel-master-service
```

The API will be available at `http://<EXTERNAL-IP>:8910`.

## ⚙️ API Endpoints

### Execute Code

Submits code for asynchronous execution. The system will queue the job, and KEDA will scale the necessary executors to handle it.

  - **Endpoint**: `POST /execute`

  - **Body**:

    ```json
    {
      "code": "n = int(input())\nprint(n * 2)",
      "language": "python",
      "testCases": [
        { "input": "5", "expected": "10" },
        { "input": "100", "expected": "200" }
      ]
    }
    ```

  - **Example Request**:

    ```bash
    curl -X POST \
      http://<EXTERNAL-IP>:8910/execute \
      -H 'Content-Type: application/json' \
      -d '{
        "code": "n = int(input())\nprint(n * 2)",
        "language": "python",
        "testCases": [
          { "input": "5", "expected": "10" },
          { "input": "100", "expected": "200" }
        ]
      }'
    ```

  - **Success Response** (`200 OK`):

    ```json
    {
      "id": "c6a2c3a3-a3f2-4b9e-b9b6-8e8a6a5a0e9c",
      "status": "queued",
      "timestamp": "2025-07-25T05:30:00.000Z",
      "message": "Job queued for python"
    }
    ```

### Check Job Status & Get Result

Retrieves the status and result of a previously submitted job.

  - **Endpoint**: `GET /job/{job-id}`

  - **Example Request**:

    ```bash
    curl http://<EXTERNAL-IP>:8910/job/c6a2c3a3-a3f2-4b9e-b9b6-8e8a6a5a0e9c
    ```

  - **Response while processing**:

    ```json
    {
      "id": "c6a2c3a3-a3f2-4b9e-b9b6-8e8a6a5a0e9c",
      "status": "active",
      "timestamp": "2025-07-25T05:30:05.000Z",
      "progress": 10
    }
    ```

  - **Response when completed**:

    ```json
    {
      "id": "c6a2c3a3-a3f2-4b9e-b9b6-8e8a6a5a0e9c",
      "status": "completed",
      "timestamp": "2025-07-25T05:30:10.000Z",
      "progress": 100,
      "output": "",
      "error": "",
      "executionTime": 250,
      "testCases": [
        {
          "input": "5",
          "expected": "10",
          "actualOutput": "10",
          "passed": true,
          "executionTime": 120
        },
        {
          "input": "100",
          "expected": "200",
          "actualOutput": "200",
          "passed": true,
          "executionTime": 130
        }
      ]
    }
    ```

### System Health & Monitoring

  - **Health Check**: `GET /health`
      - Provides the overall system status, including the connection to Redis and the health of all language queues.
  - **System Load**: `GET /load`
      - Returns real-time statistics for each language queue, including the number of waiting, active, completed, and failed jobs.
  - **Supported Languages**: `GET /languages`
      - Lists all currently supported programming languages.

## ➕ How to Add a New Language

Adding a new language is simple and does not require modifying the core application code, thanks to the management script.

1.  **Run the `add` command**:
    ```bash
    npm run manage -- add
    ```
2.  **Follow the prompts**: The interactive script will ask for details about the language, such as its name, file extension, execution command, and the base Docker image to use.
3.  **Regenerate files**: The script will automatically create the new language's JSON config, Dockerfile, and Kubernetes manifests (Deployment and KEDA ScaledObject).
4.  **Rebuild and redeploy**: Re-run the build, push, and deploy steps to make the new language available in your cluster.

## 🛡️ Security Considerations

  - **Container Security**: Executors run as a non-root user inside minimal Docker containers.
  - **Resource Limits**: Kubernetes deployments have CPU and memory limits to prevent resource exhaustion.
  - **Network Policies**: It is highly recommended to implement Kubernetes NetworkPolicies to restrict communication between pods, allowing executors to only talk to Redis.
  - **Sandboxing Runtimes**: For enhanced security in a multi-tenant production environment, consider using sandboxed container runtimes like **gVisor** or **Kata Containers**.
  - **Secrets Management**: Use Kubernetes Secrets for storing sensitive information like registry credentials or Redis passwords.

## 📄 License

This project is licensed under the MIT License.