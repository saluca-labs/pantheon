#!/bin/bash
set -euo pipefail

PROJECT=salucainfrastructure
REGION=us-central1
CLUSTER=tiresias-prod
REPO=us-central1-docker.pkg.dev/$PROJECT/tiresias
TAG=v1.0.0

echo "=== Tiresias Production Deployment ==="

# 1. Set project
gcloud config set project $PROJECT

# 2. Create GKE cluster if it doesn't exist
if ! gcloud container clusters describe $CLUSTER --region=$REGION --project=$PROJECT &>/dev/null; then
  echo "Creating GKE cluster $CLUSTER..."
  gcloud container clusters create $CLUSTER \
    --region=$REGION \
    --project=$PROJECT \
    --num-nodes=2 \
    --machine-type=e2-standard-2 \
    --workload-pool=$PROJECT.svc.id.goog \
    --enable-autoscaling \
    --min-nodes=1 \
    --max-nodes=5
else
  echo "Cluster $CLUSTER already exists, skipping create."
fi

# 3. Get cluster credentials
gcloud container clusters get-credentials $CLUSTER --region=$REGION

# 4. Create GCP service account for Workload Identity
gcloud iam service-accounts create tiresias-sa --display-name="Tiresias Service Account" 2>/dev/null || true

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:tiresias-sa@$PROJECT.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client" --condition=None 2>/dev/null

# 5. Submit Cloud Build (builds all 4 images)
gcloud builds submit --config=cloudbuild.yaml --timeout=1800s

# 6. Create namespace
kubectl apply -f k8s/namespace.yaml

# 7. Bind Workload Identity
kubectl annotate serviceaccount tiresias-sa \
  --namespace tiresias \
  iam.gke.io/gcp-service-account=tiresias-sa@$PROJECT.iam.gserviceaccount.com \
  --overwrite 2>/dev/null || true

gcloud iam service-accounts add-iam-policy-binding \
  tiresias-sa@$PROJECT.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:$PROJECT.svc.id.goog[tiresias/tiresias-sa]" 2>/dev/null

# 8. Apply secrets
kubectl apply -f k8s/secrets.yaml

# 9. Run database migrations as a one-off Job before deploying services
echo "Running database migrations..."
kubectl apply -f k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/tiresias-migrate -n tiresias --timeout=120s
kubectl delete -f k8s/migrate-job.yaml --ignore-not-found

# 10. Deploy all services
kubectl apply -f k8s/soulauth-deployment.yaml
kubectl apply -f k8s/soulgate-deployment.yaml
kubectl apply -f k8s/soulwatch-deployment.yaml
kubectl apply -f k8s/portal-deployment.yaml

# 11. Apply ingress, HPA, network policies, backend configs
kubectl apply -f k8s/backendconfigs.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/network-policy.yaml

# 12. Wait for rollout
echo "Waiting for deployments..."
kubectl rollout status deployment/soulauth -n tiresias --timeout=300s
kubectl rollout status deployment/soulgate -n tiresias --timeout=300s
kubectl rollout status deployment/soulwatch -n tiresias --timeout=300s
kubectl rollout status deployment/portal -n tiresias --timeout=300s

echo "=== Deployment Complete ==="
kubectl get pods -n tiresias
kubectl get ingress -n tiresias
echo ""
echo "Point tiresias.saluca.com DNS to the ingress IP above."
