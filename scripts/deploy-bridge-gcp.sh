#!/usr/bin/env bash
# Deploys the IBKR bridge + trading engine (server.js) to Cloud Run, wired to
# call Claude via Vertex AI (no separate Anthropic API key). Run this yourself
# from a machine/session with `gcloud` authenticated against your GCP project —
# it was not run by Claude (no GCP credentials in that session). Review every
# command before running.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - A GCP project with billing enabled
#   - Claude models enabled in Vertex AI Model Garden for this project
#     (console.cloud.google.com/vertex-ai/model-garden -> search "Claude" -> Enable)
#   - Your IB Gateway reachable from the internet (ngrok, a static IP, etc.) —
#     same IBKR_HOST/IBKR_PORT setup as the Railway deploy used.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to your GCP project id}"
REGION="${REGION:-us-east5}" # us-east5 has Claude on Vertex; keep GCP_REGION below in sync
SERVICE_NAME="${SERVICE_NAME:-ibkr-bridge}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
IBKR_HOST="${IBKR_HOST:?Set IBKR_HOST to your IB Gateway reachable host}"
IBKR_PORT="${IBKR_PORT:-5000}"

gcloud config set project "$PROJECT_ID"

echo "== Enabling required APIs =="
gcloud services enable run.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com

echo "== Building the bridge image =="
gcloud builds submit --tag "$IMAGE" -f Dockerfile .

echo "== Creating a dedicated service account with Vertex AI access =="
SA_NAME="ibkr-bridge-run"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create "$SA_NAME" --display-name="IBKR bridge Cloud Run identity" || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"

echo "== Deploying to Cloud Run =="
# PAPER_MODE stays true until you've graduated (see GET /graduation/status) —
# do not flip it here. Add FMP_API_KEY/FINNHUB_API_KEY if you have them.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},IBKR_HOST=${IBKR_HOST},IBKR_PORT=${IBKR_PORT},PAPER_MODE=true"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
echo "Deployed: $SERVICE_URL"
echo "Dashboard: ${SERVICE_URL}/dashboard"
echo ""
echo "NOTE: --allow-unauthenticated exposes /dashboard and the trading endpoints"
echo "publicly. This service places real orders once graduated — put it behind"
echo "Identity-Aware Proxy or Cloud Run's built-in auth (drop --allow-unauthenticated,"
echo "use 'gcloud run services proxy') before you trust it with real capital."
