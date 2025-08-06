#!/bin/bash

# Sentinel Kubernetes Deployment Script

set -e  # Exit on any error

# 1. Build Docker Images
echo "Building Docker images..."
npm run docker:build

# 2. Push Docker Images
echo "Pushing Docker images to the registry..."
npm run docker:push

# 3. Delete any existing deployments
echo "Deleting any existing deployments..."
npm run k8s:delete

# 4. Deploy to Kubernetes
echo "Deploying to Kubernetes..."
npm run k8s:apply

# 5. Access the Service
echo "Getting the external IP for the service..."
kubectl get services sentinel-master-service

echo "Deployment complete! You can now access the API at the EXTERNAL-IP of the sentinel-master-service."
