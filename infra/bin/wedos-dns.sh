#!/usr/bin/env bash
# WEDOS WAPI helper for DNS record management.
#
# Auth: SHA1(login + SHA1(wapi_password) + current_hour_Europe_Prague)
# Endpoint: https://api.wedos.com/wapi/json
# Docs: https://kb.wedos.global/wapi-manual/
#
# Required env (load from infra/.env): WEDOS_LOGIN, WEDOS_WAPI_PASSWORD
#
# Usage:
#   ./wedos-dns.sh ping
#   ./wedos-dns.sh list <domain>
#   ./wedos-dns.sh add <domain> <name> <type> <rdata> [ttl]
#   ./wedos-dns.sh delete <domain> <row-id>
#   ./wedos-dns.sh commit <domain>

set -euo pipefail

: "${WEDOS_LOGIN:?WEDOS_LOGIN not set (source infra/.env)}"
: "${WEDOS_WAPI_PASSWORD:?WEDOS_WAPI_PASSWORD not set (source infra/.env)}"

ENDPOINT="https://api.wedos.com/wapi/json"

build_auth() {
  local hour
  hour=$(TZ=Europe/Prague date +%H)
  local pw_hash
  pw_hash=$(printf '%s' "$WEDOS_WAPI_PASSWORD" | sha1sum | cut -d' ' -f1)
  printf '%s%s%s' "$WEDOS_LOGIN" "$pw_hash" "$hour" | sha1sum | cut -d' ' -f1
}

call() {
  local command=$1
  local data=${2:-'{}'}
  local auth
  auth=$(build_auth)
  local payload
  payload=$(cat <<EOF
{"request":{"user":"$WEDOS_LOGIN","auth":"$auth","command":"$command","clTRID":"iris-$(date +%s%N)","data":$data}}
EOF
)
  # WAPI expects request=<json> as form-encoded body, not raw JSON
  curl -sS -X POST --data-urlencode "request=$payload" "$ENDPOINT"
}

cmd_ping() { call ping; }

cmd_list() {
  local domain=${1:?domain required}
  call dns-rows-list "$(printf '{"domain":"%s"}' "$domain")"
}

cmd_add() {
  local domain=${1:?domain required}
  local name=${2:?name required (use empty string for apex)}
  local type=${3:?type required}
  local rdata=${4:?rdata required}
  local ttl=${5:-300}
  call dns-row-add "$(printf '{"domain":"%s","name":"%s","ttl":%d,"type":"%s","rdata":"%s"}' "$domain" "$name" "$ttl" "$type" "$rdata")"
}

cmd_delete() {
  local domain=${1:?domain required}
  local row_id=${2:?row_id required}
  call dns-row-delete "$(printf '{"domain":"%s","row_id":"%s"}' "$domain" "$row_id")"
}

cmd_commit() {
  local domain=${1:?domain required}
  call dns-domain-commit "$(printf '{"name":"%s"}' "$domain")"
}

case ${1:-} in
  ping)   shift; cmd_ping "$@" ;;
  list)   shift; cmd_list "$@" ;;
  add)    shift; cmd_add "$@" ;;
  delete) shift; cmd_delete "$@" ;;
  commit) shift; cmd_commit "$@" ;;
  *)
    echo "Usage: $0 {ping|list|add|delete|commit} ..." >&2
    exit 1
    ;;
esac
