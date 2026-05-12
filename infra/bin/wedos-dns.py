#!/usr/bin/env python3
"""WEDOS WAPI helper for DNS record management.

Auth: SHA1(login + SHA1(wapi_password) + current_hour_Europe_Prague)
Endpoint: https://api.wedos.com/wapi/json
Docs: https://kb.wedos.global/wapi-manual/

Required env (load from infra/.env): WEDOS_LOGIN, WEDOS_WAPI_PASSWORD

Usage:
  wedos-dns.py ping
  wedos-dns.py list <domain>
  wedos-dns.py add <domain> <name> <type> <rdata> [ttl]
  wedos-dns.py delete <domain> <row-id>
  wedos-dns.py commit <domain>
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request

try:
    import zoneinfo
    PRAGUE = zoneinfo.ZoneInfo("Europe/Prague")
except ImportError:
    PRAGUE = None

ENDPOINT = "https://api.wedos.com/wapi/json"


def auth_string(login: str, password: str) -> str:
    if PRAGUE:
        hour = datetime.datetime.now(PRAGUE).strftime("%H")
    else:
        hour = datetime.datetime.utcnow().strftime("%H")
    pw_hash = hashlib.sha1(password.encode()).hexdigest()
    return hashlib.sha1(f"{login}{pw_hash}{hour}".encode()).hexdigest()


def call(command: str, data: dict | None = None) -> dict:
    login = os.environ["WEDOS_LOGIN"]
    password = os.environ["WEDOS_WAPI_PASSWORD"]
    payload = {
        "request": {
            "user": login,
            "auth": auth_string(login, password),
            "command": command,
            "clTRID": f"iris-{int(time.time() * 1000)}",
            **({"data": data} if data is not None else {}),
        }
    }
    body = urllib.parse.urlencode({"request": json.dumps(payload)}).encode()
    req = urllib.request.Request(ENDPOINT, data=body)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def cmd_ping(_args: list[str]) -> dict:
    return call("ping")


def cmd_list(args: list[str]) -> dict:
    return call("dns-rows-list", {"domain": args[0]})


def cmd_add(args: list[str]) -> dict:
    domain, name, rtype, rdata = args[:4]
    ttl = int(args[4]) if len(args) > 4 else 300
    return call("dns-row-add", {
        "domain": domain,
        "name": name,
        "ttl": ttl,
        "type": rtype,
        "rdata": rdata,
    })


def cmd_delete(args: list[str]) -> dict:
    return call("dns-row-delete", {"domain": args[0], "row_id": args[1]})


def cmd_commit(args: list[str]) -> dict:
    return call("dns-domain-commit", {"name": args[0]})


COMMANDS = {
    "ping": cmd_ping,
    "list": cmd_list,
    "add": cmd_add,
    "delete": cmd_delete,
    "commit": cmd_commit,
}


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    result = COMMANDS[sys.argv[1]](sys.argv[2:])
    print(json.dumps(result, indent=2))
    code = result.get("response", {}).get("code")
    if code != 1000:
        sys.exit(1)


if __name__ == "__main__":
    main()
