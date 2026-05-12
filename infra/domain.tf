resource "aws_amplify_domain_association" "custom" {
  count = var.custom_domain == "" ? 0 : 1

  app_id      = aws_amplify_app.iris_gateway.id
  domain_name = var.custom_domain

  enable_auto_sub_domain = false
  wait_for_verification  = true

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = ""
  }

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }
}
