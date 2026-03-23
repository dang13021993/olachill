# Olachill Deployment Checklist

Muc tieu: push len `main` la Cloud Build tu build + deploy dung service, khong bi lech ban nhu truoc.

## 1) One-time setup (lam 1 lan)

1. Cloud Build Trigger:
- Repository: `dang13021993/olachill`
- Event: `Push to branch`
- Branch: `^main$`
- Configuration type: `Cloud Build configuration file (yaml/json)`
- File location: `cloudbuild.yaml`

2. Trigger service account can co quyen:
- `Cloud Run Admin`
- `Artifact Registry Writer` (hoac quyen push image tuong duong)
- `Service Account User`

3. Cloud Run service dung de map domain:
- Service: `olachill-chuy-n-gia-du-l-ch-nh-t-b-n`
- Region: `us-west1`
- Domain mappings: `olachill.com`, `www.olachill.com`

## 2) Pre-push checklist (moi lan release)

Chay trong local repo:

```bash
npm run lint
npm run build
```

Neu pass moi push:

```bash
git add .
git commit -m "feat/fix: ..."
git push origin main
```

## 3) Post-push verification (bat buoc)

### A. Verify Cloud Build

- Vao `Cloud Build > History`
- Build moi nhat phai `Success`
- Commit SHA trong build phai trung voi commit vua push

### B. Verify Cloud Run traffic

- Vao `Cloud Run > Service > Revisions`
- Revision moi nhat phai duoc deploy sau build
- `Traffic = 100% (to latest)`

### C. Verify live domain

Trong Cloud Shell:

```bash
curl -sL https://olachill.com | grep -E 'index-.*\\.js|<title>'
```

Check:
- `<title>` phai la `Olachill - ...`
- file `index-*.js` phai doi fingerprint sau moi release

## 4) Neu web khong len ban moi

1. Kiem tra trigger dang `Enabled` va dung branch `main`.
2. Kiem tra trigger dang doc `cloudbuild.yaml`.
3. Kiem tra service account cua trigger con du quyen deploy.
4. Redeploy tay trong Cloud Shell:

```bash
PROJECT_ID="gen-lang-client-0857788729"
REGION="us-west1"
SERVICE="olachill-chuy-n-gia-du-l-ch-nh-t-b-n"

# Lay image tu build moi nhat
BUILD_ID="$(gcloud builds list --limit=1 --sort-by=~createTime --format='value(id)')"
IMG="$(gcloud builds describe "$BUILD_ID" --format='value(results.images[0].name)')"
DIG="$(gcloud builds describe "$BUILD_ID" --format='value(results.images[0].digest)')"

# Deploy image exact theo digest

gcloud run deploy "$SERVICE" \
  --image "${IMG}@${DIG}" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated

gcloud run services update-traffic "$SERVICE" --to-latest --region "$REGION"
```

## 5) Runtime env checklist (de flow mobile on dinh)

Cloud Run variables:
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (khuyen nghi: `gemini-2.0-flash`)
- `CHECKOUT_BASIC_URL`
- `CHECKOUT_PRO_URL`
- `ESIM_PROVIDER_BASE_URL`
- `ESIM_PROVIDER_API_KEY`
- `AFFILIATE_LINKS_JSON` (co key `klook`, `kkday`)
- `KLOOK_COUPON_CODE` / `KKDAY_COUPON_CODE` (neu co)

Neu thieu bien, UI van hien duoc flow nhung co the khong mo duoc checkout that.

Firebase Auth checklist:
- Authorized domains bat buoc co: `olachill.com`, `www.olachill.com`
- Google provider phai `Enabled`

Quick smoke test sau deploy:

```bash
curl -sL https://olachill.com/api/health
curl -sL "https://olachill.com/api/esim/plans?country=JP" | head -c 300
curl -sL "https://olachill.com/api/public-config" | head -c 400

# eSIM guard checks (JP-only + order validation)
curl -sL "https://olachill.com/api/esim/plans?country=US" | head -c 500
curl -sL -X POST "https://olachill.com/api/esim/order" \
  -H "Content-Type: application/json" \
  -d '{"planId":"invalid-plan-id","paymentMethod":"bank_transfer"}'
```
