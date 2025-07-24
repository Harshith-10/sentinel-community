# Sentinel Kubernetes Deployment Script

# 1. Build Docker Images
Write-Host "Building Docker images..."
npm run docker:build

# 2. Push Docker Images
Write-Host "Pushing Docker images to the registry..."
npm run docker:push

# 3. Deploy to Kubernetes
Write-Host "Deploying to Kubernetes..."
kubectl apply -f k8s/

# 4. Access the Service
Write-Host "Getting the external IP for the service..."
kubectl get services sentinel-master-service

Write-Host "Deployment complete! You can now access the API at the EXTERNAL-IP of the sentinel-master-service."