resource "aws_amplify_domain_association" "custom" {
  count = var.custom_domain == "" ? 0 : 1

  app_id      = aws_amplify_app.iris_gateway.id
  domain_name = var.custom_domain

  enable_auto_sub_domain = false
  wait_for_verification  = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }
  # Apex (iris-gateway.cz) is not in Amplify subDomains because DNS RFC
  # forbids CNAME at zone apex and WEDOS has no ALIAS/ANAME record type.
  # Apex is handled by WEDOS URL Redirect: 301 to https://www.iris-gateway.cz.
}
