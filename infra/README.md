# Iris Gateway infra (AWS Amplify Hosting)

Terraform stack that deploys [cloud-app](../cloud-app/) to AWS Amplify Hosting on the `pavel-sandbox` account.

## What it provisions

- `aws_amplify_app` (platform `WEB_COMPUTE`, monorepo root `cloud-app/`)
- `aws_amplify_branch` for `main` (Next.js SSR, production stage)
- `aws_amplify_webhook` (manual rebuild trigger)
- `aws_iam_role` for the Amplify compute runtime (CloudWatch Logs only)

That is the entire stack. Roughly 5 AWS resources, no VPC, no ALB, no NAT.

## Architecture

```
GitHub (DannyB2001/iot-secure-sentinel:main)
        |
        v  push -> webhook
AWS Amplify Hosting (eu-central-1)
  - Build container: bun install + bun run build
  - SSR runtime: managed Lambda + CloudFront
  - Static assets: managed S3
        |
        v
MongoDB Atlas M0 (eu-central-1, free tier)
```

## Costs (eu-central-1, low traffic)

| Item | Estimate |
|---|---|
| Amplify build minutes | ~$1/mo (one build per push) |
| Amplify hosting + SSR compute | ~$5-10/mo |
| Amplify data transfer | ~$1/mo |
| Atlas M0 cluster | $0 (free tier, 512 MB) |
| **Total** | **~$7-12/mo** |

Within the $50/mo budget with ~4x headroom.

## Prerequisites

1. **Terraform >= 1.9.0** installed:
   ```powershell
   winget install --id HashiCorp.Terraform
   terraform version
   ```

2. **Dedicated IAM user `iris-terraform-deployer`** in account `116921840130` with the inline policy from [`.terraform-deployer-policy.json`](.terraform-deployer-policy.json) (gitignored). Created via:
   ```powershell
   aws iam create-user --user-name iris-terraform-deployer --profile pavel-sandbox
   aws iam put-user-policy --user-name iris-terraform-deployer --policy-name iris-tf-deploy --policy-document file://.terraform-deployer-policy.json --profile pavel-sandbox
   aws iam create-access-key --user-name iris-terraform-deployer --profile pavel-sandbox
   ```
   Save the access key + secret to [`infra/.env`](.env) (gitignored). The AWS provider auto-discovers the keys from environment, so no AWS profile is needed for Terraform itself.

3. **MongoDB Atlas M0 cluster** in `eu-central-1`:
   - Sign up at https://www.mongodb.com/cloud/atlas/register
   - Create M0 free cluster, region AWS `eu-central-1` (Frankfurt)
   - Database Access: create user `iris-app`, generate password
   - Network Access: add IP `0.0.0.0/0` (acceptable for school project; Amplify SSR Lambdas use dynamic egress IPs)
   - Connect → Drivers → copy the connection string and substitute the password
   - Final form: `mongodb+srv://iris-app:<password>@cluster0.xxxxx.mongodb.net/iris?retryWrites=true&w=majority`

4. **GitHub access token** for the repo. Two options:
   - **Option A (fastest)**: use the gh CLI OAuth token if you have `repo` scope (`gh auth status` to check):
     ```powershell
     gh auth token
     ```
   - **Option B (recommended for production)**: create a fine-grained PAT scoped to the single repo:
     - https://github.com/settings/personal-access-tokens/new
     - Repository access: `DannyB2001/iot-secure-sentinel` only
     - Permissions: Contents = Read, Metadata = Read, Webhooks = Read and write

5. **Generate two secrets** locally:
   ```powershell
   openssl rand -base64 32   # auth_secret
   openssl rand -hex 32      # seed_device_token
   ```

## Deploy

```bash
cd infra

# 1. Copy example, fill in values
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars in your editor — github_access_token, mongodb_uri, auth_secret, seed_admin_password, seed_device_token

# 2. Load AWS credentials from .env (bash)
set -a; source .env; set +a

# Or in PowerShell:
# Get-Content .env | Where-Object { $_ -match '^[^#]' -and $_ } | ForEach-Object { $name,$value = $_ -split '=',2; Set-Item "env:$name" $value }

# 3. Init providers
terraform init

# 4. Plan and review
terraform plan -out tfplan

# 5. Apply
terraform apply tfplan

# 6. Read outputs
terraform output
```

The first build kicks off automatically once the resources exist. Watch progress:

```powershell
terraform output -raw console_url
# open that URL in browser, click on the build in progress
```

First build takes 4-6 minutes (cold cache, downloads bun, installs dependencies, builds Next).

## After deploy

Open the URL from `terraform output -raw app_url` and sign in:
- Email: value of `seed_admin_email` from your tfvars
- Password: value of `seed_admin_password` from your tfvars

Change the admin password after first login (no UI for this yet, do it via Atlas web shell or add the route).

## Update the running app

Push to `main`. Amplify rebuilds automatically via the GitHub webhook.

To change env vars or build config, edit `infra/*.tf` and re-apply:

```powershell
terraform plan -out tfplan
terraform apply tfplan
```

Amplify triggers a rebuild whenever environment variables change.

## Tear down

```powershell
terraform destroy
```

Atlas cluster is not managed by this stack. Delete it from the Atlas console if you want to remove that too.

## Files

| File | Purpose |
|---|---|
| `main.tf` | Provider, Terraform version pin, default tags |
| `variables.tf` | Input variables and validation |
| `iam.tf` | Service role for Amplify Hosting compute |
| `amplify.tf` | App, branch, webhook |
| `outputs.tf` | App URL, console URL, IDs |
| `terraform.tfvars.example` | Template for sensitive inputs (real `terraform.tfvars` is gitignored) |
| `.gitignore` | Excludes state, lock, tfvars, plan files |

## Limits

- Amplify Hosting officially supports Next.js 12-15. We pinned `next@^15.5.18` in cloud-app. Do not bump to Next 16 without re-evaluating deployment.
- Edge Runtime middleware is not supported on Amplify. Our `middleware.ts` runs Node runtime by default, so this is fine.
- Image optimization output cap: 4.3 MB per image.
- Cold start: ~1-2s on the first request after idle. Acceptable for school project demo.

## Troubleshooting

**Build fails with "bun: command not found"**: the `_CUSTOM_IMAGE = "amplify:al2023"` env var is set so we are on Amazon Linux 2023. The `preBuild` step installs bun via the official curl script. If this breaks, check the install URL in `amplify.tf`.

**"Refusing to seed in production without SEED_ADMIN_PASSWORD and SEED_DEVICE_TOKEN"**: both must be set in your `terraform.tfvars`. The Terraform validation rules enforce minimum lengths.

**App URL returns 502**: cold start in progress, retry after 5 seconds. If it persists, check CloudWatch Logs at `/aws/amplify/<app_id>/<branch>` for the SSR runtime errors.

**Atlas connection times out from Amplify**: confirm Atlas Network Access allows `0.0.0.0/0`. Amplify SSR Lambdas have dynamic egress IPs.
