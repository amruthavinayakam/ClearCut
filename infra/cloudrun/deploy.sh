#!/usr/bin/env bash
#
# Deploy ClearCut to Google Cloud Run.
#
#   ./infra/cloudrun/deploy.sh PROJECT_ID [REGION]
#
# Two services are deployed from the repo root:
#   clearcut-api  Bun + Hono + Google ADK agents + Parallel research
#   clearcut-web  Next.js 16 standalone, proxying /api/* to the API service
#
# The API is deployed twice on a first run: the Parallel Monitor webhook needs
# the public web URL, which does not exist until the web service is up.
#
# Prerequisites: gcloud CLI, an authenticated account, and billing enabled.
# Secrets are read from Secret Manager, never passed as plain env vars.

set -euo pipefail

PROJECT_ID="${1:?usage: deploy.sh PROJECT_ID [REGION]}"
REGION="${2:-us-central1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

API_SERVICE="clearcut-api"
WEB_SERVICE="clearcut-web"

cd "$REPO_ROOT"

echo "project : $PROJECT_ID"
echo "region  : $REGION"
echo

gcloud config set project "$PROJECT_ID" >/dev/null

echo "--> Enabling required services"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

# --- Image registry ----------------------------------------------------------
AR_REPO="clearcut"
IMAGE_HOST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"

if ! gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1; then
  echo "--> Creating Artifact Registry repository $AR_REPO"
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --quiet
fi

# Both images are built from an explicitly named Dockerfile with the repo root
# as context. The root Dockerfile belongs to the retired Python stack and must
# never be the one Cloud Build picks up.
build_image() {
  local dockerfile="$1" image="$2"
  echo "--> Building $image from $dockerfile"
  gcloud builds submit \
    --config infra/cloudrun/cloudbuild.yaml \
    --substitutions "_DOCKERFILE=${dockerfile},_IMAGE=${image}" \
    --quiet \
    .
}

# --- Secrets -----------------------------------------------------------------
# Created empty on first run; add versions with:
#   printf 'VALUE' | gcloud secrets versions add NAME --data-file=-
for secret in google-api-key parallel-api-key parallel-webhook-secret; do
  if ! gcloud secrets describe "$secret" >/dev/null 2>&1; then
    echo "--> Creating secret $secret (add a version before the app can run live)"
    gcloud secrets create "$secret" --replication-policy=automatic --quiet
  fi
done

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "--> Granting the runtime service account access to the secrets"
for secret in google-api-key parallel-api-key parallel-webhook-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done

# --- API ---------------------------------------------------------------------
# --no-cpu-throttling is load-bearing, not a tuning knob: the clearance pipeline
# is started with queueMicrotask *after* the HTTP response is sent. Under the
# default request-based billing the instance loses CPU the moment the response
# flushes and the pipeline would stall mid-run.
#
# --min-instances=1 --max-instances=1 pins a single instance because project
# records and the SSE event bus are in-memory; a second instance would serve
# a different, empty world.
#
# --timeout=3600 is the ceiling Cloud Run allows and covers long SSE streams.
echo
build_image "apps/api/Dockerfile" "${IMAGE_HOST}/api:latest"

echo "--> Deploying $API_SERVICE"
gcloud run deploy "$API_SERVICE" \
  --image "${IMAGE_HOST}/api:latest" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 2 \
  --memory 4Gi \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1 \
  --no-cpu-throttling \
  --set-env-vars "NODE_ENV=production,MOCK_RESEARCH=false,GEMINI_MODEL=gemini-3.8-flash,RESEARCH_CONCURRENCY=16,ASSET_STORAGE_DIR=/tmp/clearcut-assets" \
  --set-secrets "GOOGLE_API_KEY=google-api-key:latest,PARALLEL_API_KEY=parallel-api-key:latest,PARALLEL_WEBHOOK_SECRET=parallel-webhook-secret:latest" \
  --quiet

API_URL="$(gcloud run services describe "$API_SERVICE" --region "$REGION" --format='value(status.url)')"
echo "    api: $API_URL"

# --- Web ---------------------------------------------------------------------
echo
build_image "apps/web/Dockerfile" "${IMAGE_HOST}/web:latest"

echo "--> Deploying $WEB_SERVICE"
gcloud run deploy "$WEB_SERVICE" \
  --image "${IMAGE_HOST}/web:latest" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --timeout 3600 \
  --min-instances 0 \
  --set-env-vars "NODE_ENV=production,CLEARCUT_API_ORIGIN=${API_URL}" \
  --quiet

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region "$REGION" --format='value(status.url)')"

# --- Second API pass ---------------------------------------------------------
# Parallel Monitor delivers webhooks to PUBLIC_BASE_URL/api/webhooks/parallel,
# which has to be the public web origin.
echo
echo "--> Pointing the API's webhook origin at the web service"
gcloud run services update "$API_SERVICE" \
  --region "$REGION" \
  --update-env-vars "PUBLIC_BASE_URL=${WEB_URL}" \
  --quiet >/dev/null

echo
echo "web : $WEB_URL"
echo "api : $API_URL"
echo
echo "Health check:"
echo "  curl ${WEB_URL}/api/health"
