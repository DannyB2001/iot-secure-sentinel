resource "aws_amplify_app" "iris_gateway" {
  name        = local.app_name
  description = "Iris Gateway operator console (Next.js 15 SSR + Mongoose, monorepo: cloud-app/)"

  repository   = var.github_repo_url
  access_token = var.github_access_token

  platform             = "WEB_COMPUTE"
  iam_service_role_arn = aws_iam_role.amplify_service_role.arn

  enable_branch_auto_build    = true
  enable_branch_auto_deletion = false

  build_spec = <<-YAML
    version: 1
    applications:
      - appRoot: cloud-app
        frontend:
          phases:
            preBuild:
              commands:
                - curl -fsSL https://bun.sh/install | bash
                - export PATH="$HOME/.bun/bin:$PATH"
                - bun --version
                - bun install --frozen-lockfile
            build:
              commands:
                - export PATH="$HOME/.bun/bin:$PATH"
                - env | grep -E '^(MONGODB_URI|AUTH_SECRET|NEXTAUTH_SECRET|NEXTAUTH_URL|SEED_ADMIN_EMAIL|SEED_ADMIN_PASSWORD|SEED_DEVICE_NAME|SEED_DEVICE_TOKEN|NODE_ENV)=' >> .env.production
                - bun run build
          artifacts:
            baseDirectory: .next
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
              - .next/cache/**/*
  YAML

  custom_rule {
    source = "/<*>"
    status = "404-200"
    target = "/index.html"
  }

  environment_variables = {
    AMPLIFY_DIFF_DEPLOY       = "false"
    AMPLIFY_MONOREPO_APP_ROOT = "cloud-app"
    _CUSTOM_IMAGE             = "amplify:al2023"
    NODE_OPTIONS              = "--max-old-space-size=4096"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.iris_gateway.id
  branch_name = var.github_branch

  framework = "Next.js - SSR"
  stage     = "PRODUCTION"

  enable_auto_build           = true
  enable_pull_request_preview = false

  environment_variables = {
    NODE_ENV            = "production"
    MONGODB_URI         = var.mongodb_uri
    AUTH_SECRET         = var.auth_secret
    NEXTAUTH_SECRET     = var.auth_secret
    NEXTAUTH_URL        = var.custom_domain != "" ? "https://www.${var.custom_domain}" : "https://${var.github_branch}.${aws_amplify_app.iris_gateway.default_domain}"
    SEED_ADMIN_EMAIL    = var.seed_admin_email
    SEED_ADMIN_PASSWORD = var.seed_admin_password
    SEED_DEVICE_NAME    = var.seed_device_name
    SEED_DEVICE_TOKEN   = var.seed_device_token
  }
}

resource "aws_amplify_webhook" "main" {
  app_id      = aws_amplify_app.iris_gateway.id
  branch_name = aws_amplify_branch.main.branch_name
  description = "Trigger build on git push to ${var.github_branch}"
}
