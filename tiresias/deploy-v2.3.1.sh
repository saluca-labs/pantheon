#!/bin/bash
# Deploy Tiresias v2.3.1
# Prerequisites: gcloud auth login must be working
set -euo pipefail

PROJECT=salucainfrastructure
REGION=us-central1
CLUSTER=tiresias-v2
REGISTRY=us-central1-docker.pkg.dev/$PROJECT/tiresias

echo '=== Step 1: Auth + cluster credentials ==='
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
gcloud container clusters get-credentials $CLUSTER --region=$REGION --project=$PROJECT

echo '=== Step 2: Configure Docker ==='
gcloud auth configure-docker $REGION-docker.pkg.dev --quiet

echo '=== Step 3: Push soulwatch:v2.3.1 (already built locally) ==='
docker push $REGISTRY/soulwatch:v2.3.1

echo '=== Step 4: Check cluster state before deploy ==='
kubectl get pods -n tiresias

echo '=== Step 5: Apply all deployments (drain-then-add) ==='
kubectl apply -f k8s/soulauth-deployment.yaml
kubectl apply -f k8s/soulgate-deployment.yaml
kubectl apply -f k8s/soulwatch-deployment.yaml
kubectl apply -f k8s/portal-deployment.yaml

echo '=== Step 6: Apply ingress and policies ==='
kubectl apply -f k8s/backendconfigs.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/network-policy.yaml

echo '=== Step 7: Watch rollouts ==='
kubectl rollout status deployment/soulauth -n tiresias --timeout=300s
kubectl rollout status deployment/soulgate -n tiresias --timeout=300s
kubectl rollout status deployment/soulwatch -n tiresias --timeout=300s
kubectl rollout status deployment/portal -n tiresias --timeout=300s

echo '=== Step 8: Final verification ==='
kubectl get pods -n tiresias
kubectl get deployments -n tiresias

echo '=== Deployment Complete ==='
