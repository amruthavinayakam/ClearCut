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
  firestore.googleapis.com \
  storage.googleapis.com \
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
# Gemini needs no secret: it runs on Vertex AI under the runtime service account.
# Only Parallel ships a key.
for secret in parallel-api-key parallel-webhook-secret; do
  if ! gcloud secrets describe "$secret" >/dev/null 2>&1; then
    echo "--> Creating secret $secret"
    gcloud secrets create "$secret" --replication-policy=automatic --quiet
  fi
done

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "--> Granting the runtime service account access to the secrets"
for secret in parallel-api-key parallel-webhook-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done

# Cloud Build runs as the compute service account and needs to push images and
# write logs. Without these the build fails with an opaque permissions error.
echo "--> Granting the build and runtime service account its roles"
# aiplatform.user lets the API call Gemini on Vertex without a key; datastore.user
# and storage.objectAdmin are what make project records and media survive a
# restart instead of dying with the instance.
for role in roles/artifactregistry.writer roles/logging.logWriter roles/aiplatform.user roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

# Live mode refuses to boot without provider keys, so a secret with no version
# would produce a container that crash-loops behind a healthy-looking deploy.
# Fail here instead, with the command that fixes it.
# Live mode needs the Parallel key. Without it the container would crash-loop
# behind a deploy that otherwise looks healthy, so fall back to fixture mode and
# say so plainly rather than shipping something broken.
MOCK_RESEARCH="false"
if [ -z "$(gcloud secrets versions list parallel-api-key --limit 1 --format='value(name)' 2>/dev/null)" ]; then
  MOCK_RESEARCH="true"
  echo
  echo "!! parallel-api-key has no value, so this deploys in FIXTURE mode."
  echo "   Research results will be replayed, not researched."
  echo "   To go live, add the key and flip one variable:"
  echo "     printf 'YOUR_KEY' | gcloud secrets versions add parallel-api-key --data-file=-"
  echo "     gcloud run services update ${API_SERVICE} --region ${REGION} --update-env-vars MOCK_RESEARCH=false"
  echo
fi

# The webhook secret is ours to generate rather than fetch.
if [ -z "$(gcloud secrets versions list parallel-webhook-secret --limit 1 --format='value(name)' 2>/dev/null)" ]; then
  echo "--> Generating a Parallel webhook secret"
  openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add parallel-webhook-secret --data-file=- --quiet >/dev/null
fi

# A secret with no version cannot be mounted, so only reference what exists.
API_SECRETS="PARALLEL_WEBHOOK_SECRET=parallel-webhook-secret:latest"
if [ "$MOCK_RESEARCH" = "false" ]; then
  API_SECRETS="PARALLEL_API_KEY=parallel-api-key:latest,${API_SECRETS}"
fi

# --- Durable storage --------------------------------------------------------
# Cloud Run instances are disposable: without these the API keeps projects in a
# process-local Map and media in an in-memory /tmp, so every redeploy or idle
# reclaim silently deletes every production.
ASSET_BUCKET="${PROJECT_ID}-assets"

if ! gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  echo "--> Creating the Firestore database"
  gcloud firestore databases create --location=nam5 --type=firestore-native --quiet
fi

if ! gcloud storage buckets describe "gs://${ASSET_BUCKET}" >/dev/null 2>&1; then
  echo "--> Creating the asset bucket gs://${ASSET_BUCKET}"
  gcloud storage buckets create "gs://${ASSET_BUCKET}" \
    --location="$REGION" --uniform-bucket-level-access --quiet
fi

gcloud storage buckets add-iam-policy-binding "gs://${ASSET_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/storage.objectAdmin --quiet >/dev/null

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
  --set-env-vars "NODE_ENV=production,MOCK_RESEARCH=${MOCK_RESEARCH},GEMINI_MODEL=gemini-3.8-flash,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,RESEARCH_CONCURRENCY=32,RESEARCH_DEPTH=fast,ASSET_STORAGE_DIR=/tmp/clearcut-assets,FIRESTORE_COLLECTION=projects,GCS_BUCKET=${ASSET_BUCKET}" \
  --set-secrets "$API_SECRETS" \
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
