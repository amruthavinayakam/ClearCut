# Clearance Radar -> Cloud Run.
#
#   .\deploy.ps1 -ProjectId my-project -ParallelApiKey pk_live_xxx
#
# Idempotent: safe to re-run. Deploys twice on the first run because the service
# needs to know its own public URL before Parallel Monitor webhooks can reach it.

param(
    [Parameter(Mandatory = $true)][string]$ProjectId,
    [Parameter(Mandatory = $true)][string]$ParallelApiKey,
    [string]$Region = "us-central1",
    [string]$Service = "clearance-radar",
    [string]$VertexLocation = "global",
    [string]$GcsBucket = "",
    [switch]$UseFirestore
)

$ErrorActionPreference = "Stop"

# gcloud on Windows often resolves to a stale Python 2. Point it at Python 3
# before anything else, or every command below fails with a confusing error.
if (-not $env:CLOUDSDK_PYTHON) {
    $py3 = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($py3) {
        $env:CLOUDSDK_PYTHON = $py3.FullName
        Write-Host "Using CLOUDSDK_PYTHON=$($py3.FullName)" -ForegroundColor DarkGray
    }
}

Write-Host "`n=== Clearance Radar deployment ===" -ForegroundColor Cyan
Write-Host "project : $ProjectId"
Write-Host "region  : $Region"
Write-Host "service : $Service`n"

gcloud config set project $ProjectId | Out-Null

Write-Host "-> Enabling APIs (first run takes a minute)..." -ForegroundColor Yellow
gcloud services enable `
    run.googleapis.com `
    aiplatform.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    secretmanager.googleapis.com `
    storage.googleapis.com `
    firestore.googleapis.com

# --- The Parallel key lives in Secret Manager, never in a console env var.
Write-Host "-> Storing the Parallel API key in Secret Manager..." -ForegroundColor Yellow
$secretExists = $true
try { gcloud secrets describe parallel-api-key 2>$null | Out-Null } catch { $secretExists = $false }
if (-not $secretExists) {
    gcloud secrets create parallel-api-key --replication-policy=automatic
}
$ParallelApiKey | gcloud secrets versions add parallel-api-key --data-file=-

# --- Dedicated service account, least privilege.
$saName = "clearance-radar-runner"
$saEmail = "$saName@$ProjectId.iam.gserviceaccount.com"
$saExists = $true
try { gcloud iam service-accounts describe $saEmail 2>$null | Out-Null } catch { $saExists = $false }
if (-not $saExists) {
    Write-Host "-> Creating service account $saEmail..." -ForegroundColor Yellow
    gcloud iam service-accounts create $saName --display-name="Clearance Radar Cloud Run runtime"
}

Write-Host "-> Granting roles..." -ForegroundColor Yellow
# Calls Gemini (text and multimodal video) on Vertex AI.
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$saEmail" --role="roles/aiplatform.user" --condition=None | Out-Null
# Reads the Parallel key at boot.
gcloud secrets add-iam-policy-binding parallel-api-key `
    --member="serviceAccount:$saEmail" --role="roles/secretmanager.secretAccessor" | Out-Null

if ($UseFirestore) {
    gcloud projects add-iam-policy-binding $ProjectId `
        --member="serviceAccount:$saEmail" --role="roles/datastore.user" --condition=None | Out-Null
}

if ($GcsBucket) {
    Write-Host "-> Granting bucket access for rough cuts..." -ForegroundColor Yellow
    gcloud storage buckets add-iam-policy-binding "gs://$GcsBucket" `
        --member="serviceAccount:$saEmail" --role="roles/storage.objectAdmin" | Out-Null
}

$envPairs = @(
    "GOOGLE_CLOUD_PROJECT=$ProjectId",
    "GOOGLE_CLOUD_LOCATION=$VertexLocation",
    "GOOGLE_GENAI_USE_VERTEXAI=TRUE",
    "MOCK_RESEARCH=false",
    "PARALLEL_PROCESSOR=core",
    "PARALLEL_SEARCH_MODE=basic",
    "RESEARCH_CONCURRENCY=16",
    "USE_FIRESTORE=$($UseFirestore.IsPresent.ToString().ToLower())"
)
if ($GcsBucket) { $envPairs += "GCS_BUCKET=$GcsBucket" }
$envVars = $envPairs -join ","

Write-Host "-> Building and deploying..." -ForegroundColor Yellow
# Research fan-out is long-running and I/O bound: real timeout headroom, and
# enough memory to hold a rough cut in flight when GCS is not configured.
gcloud run deploy $Service `
    --source . `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --service-account $saEmail `
    --memory 4Gi `
    --cpu 2 `
    --timeout 3600 `
    --concurrency 20 `
    --max-instances 10 `
    --set-env-vars $envVars `
    --set-secrets "PARALLEL_API_KEY=parallel-api-key:latest"

$url = gcloud run services describe $Service --region $Region --format="value(status.url)"

Write-Host "-> Wiring PUBLIC_BASE_URL so Monitor webhooks can reach us..." -ForegroundColor Yellow
gcloud run services update $Service --region $Region `
    --update-env-vars "PUBLIC_BASE_URL=$url" | Out-Null

Write-Host "`n=== Deployed ===" -ForegroundColor Green
Write-Host $url -ForegroundColor Green
Write-Host "`nSubmit this URL as your hosted project link.`n"
