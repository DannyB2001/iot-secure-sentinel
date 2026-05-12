terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.44"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "iot-secure-sentinel"
      Environment = "production"
      ManagedBy   = "terraform"
      Stack       = "cloud-app-amplify"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  app_name = "iris-gateway"
}
