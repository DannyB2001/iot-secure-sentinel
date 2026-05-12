output "amplify_app_id" {
  description = "Amplify app ID. Use to find app in AWS console."
  value       = aws_amplify_app.iris_gateway.id
}

output "amplify_default_domain" {
  description = "Auto-generated Amplify domain (without branch prefix)."
  value       = aws_amplify_app.iris_gateway.default_domain
}

output "app_url" {
  description = "Live URL of the deployed app once the first build succeeds."
  value       = "https://${var.github_branch}.${aws_amplify_app.iris_gateway.default_domain}"
}

output "console_url" {
  description = "Direct link to the Amplify Hosting console for this app."
  value       = "https://${var.aws_region}.console.aws.amazon.com/amplify/apps/${aws_amplify_app.iris_gateway.id}"
}

output "webhook_url" {
  description = "Incoming webhook URL. POST to it to trigger a build manually."
  value       = aws_amplify_webhook.main.url
  sensitive   = true
}

output "service_role_arn" {
  description = "IAM role assumed by Amplify Hosting compute for SSR runtime."
  value       = aws_iam_role.amplify_service_role.arn
}

output "custom_domain_dns_records" {
  description = "DNS records to add at the registrar (e.g. WEDOS) to validate and route the custom domain. Empty list when no custom domain is set."
  value       = var.custom_domain == "" ? [] : aws_amplify_domain_association.custom[0].sub_domain
}

output "custom_domain_certificate_verification_dns_record" {
  description = "ACM certificate verification CNAME (only for custom domain). Add this record at the registrar to prove domain ownership before HTTPS cert issues."
  value       = var.custom_domain == "" ? null : aws_amplify_domain_association.custom[0].certificate_verification_dns_record
}

output "custom_domain_url" {
  description = "Final HTTPS URL once the domain validates."
  value       = var.custom_domain == "" ? null : "https://${var.custom_domain}"
}
