#!/usr/bin/env bash
# Deploys the stock screener (screener-server.js) to Cloud Run + Firestore + Cloud
# Scheduler. Run this yourself from a machine/session with `gcloud` authenticated
# against your GCP project — it was not run by Claude (no GCP credentials in that
# session). Review every command before running; nothing here is destructive to
# existing resources, but it does create billable GCP resources.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - A GCP project with billing enabled
#   - (optional but recommended) an FMP_API_KEY from financialmodelingprep.com
#     for real dividend data — without it the screener runs technical-only.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to your GCP project id, e.g. export PROJECT_ID=my-project}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-stock-screener}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
RUN_TOKEN="${SCREENER_RUN_TOKEN:?Set SCREENER_RUN_TOKEN to a random secret string, e.g. export SCREENER_RUN_TOKEN=$(openssl rand -hex 16)}"
FMP_API_KEY="${FMP_API_KEY:-}"

gcloud config set project "$PROJECT_ID"

echo "== Enabling required APIs =="
gcloud services enable run.googleapis.com firestore.googleapis.com \
  cloudscheduler.googleapis.com cloudbuild.googleapis.com

echo "== Creating Firestore database (native mode) if it doesn't exist =="
gcloud firestore databases create --location="$REGION" --type=firestore-native || \
  echo "(Firestore database likely already exists — continuing)"

echo "== Building the screener image from Dockerfile.screener =="
gcloud builds submit --tag "$IMAGE" -f Dockerfile.screener .

echo "== Deploying to Cloud Run =="
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --no-allow-unauthenticated \
  --set-env-vars "RESULTS_STORE=firestore,SCREENER_RUN_TOKEN=${RUN_TOKEN}${FMP_API_KEY:+,FMP_API_KEY=$FMP_API_KEY}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
echo "Deployed: $SERVICE_URL"

echo "== Creating the service account Cloud Scheduler will invoke Cloud Run as =="
SCHEDULER_SA="screener-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create screener-scheduler \
  --display-name="Cloud Scheduler invoker for the stock screener" || true
gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --region "$REGION" \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker"

echo "== Scheduling a daily run after US market close (21:30 UTC ~ 4:30pm ET) =="
gcloud scheduler jobs create http screener-daily-run \
  --location "$REGION" \
  --schedule="30 21 * * 1-5" \
  --uri="${SERVICE_URL}/run" \
  --http-method=POST \
  --headers="X-Run-Token=${RUN_TOKEN}" \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --oidc-token-audience="$SERVICE_URL" || \
  echo "(job may already exist — use 'gcloud scheduler jobs update http screener-daily-run' to change it)"

echo ""
echo "Dashboard (requires an authenticated request, since --no-allow-unauthenticated):"
echo "  gcloud run services proxy $SERVICE_NAME --region $REGION"
echo "  then open http://localhost:8080 in your browser"
echo ""
echo "To allow public read-only access to the dashboard instead, split it into its"
echo "own Cloud Run service or front it with Identity-Aware Proxy — not done here by"
echo "default, since this data reflects your own research criteria."
