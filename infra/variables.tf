variable "aws_region" {
  description = "AWS region for Amplify app. Match MongoDB Atlas region for lowest latency."
  type        = string
  default     = "eu-central-1"
}

variable "github_repo_url" {
  description = "Full HTTPS URL to the GitHub repository, e.g. https://github.com/DannyB2001/iot-secure-sentinel"
  type        = string
}

variable "github_branch" {
  description = "Branch Amplify deploys from."
  type        = string
  default     = "main"
}

variable "github_access_token" {
  description = "GitHub personal access token with repo:read permission. Generate at https://github.com/settings/tokens?type=beta — fine-grained, scope to the single repo, Contents: Read."
  type        = string
  sensitive   = true
}

variable "mongodb_uri" {
  description = "MongoDB Atlas connection string. Use M0 free cluster in the same region as aws_region."
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "Secret used by next-auth v4 to sign JWTs. Generate with `openssl rand -base64 32`."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.auth_secret) >= 32
    error_message = "auth_secret must be at least 32 characters."
  }
}

variable "seed_admin_email" {
  description = "Email for the seeded admin user created on first DB connect."
  type        = string
  default     = "admin@iris.local"
}

variable "seed_admin_password" {
  description = "Initial password for the seeded admin user. Change after first login."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.seed_admin_password) >= 12
    error_message = "seed_admin_password must be at least 12 characters."
  }
}

variable "seed_device_token" {
  description = "Bearer token used by the mock gateway device. Hashed before storage. Refusing to seed without this in production."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.seed_device_token) >= 24
    error_message = "seed_device_token must be at least 24 characters."
  }
}

variable "seed_device_name" {
  description = "Name of the seeded mock gateway device. Used to look it up after first connect."
  type        = string
  default     = "iris-gateway-prod"
}
