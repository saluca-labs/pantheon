#!/usr/bin/env python3
"""
Tiresias License Issuer
Usage:
  python3 issue_license.py keygen
  python3 issue_license.py issue --tenant saluca --tier enterprise --expires 2027-03-18 --nfr
"""

import argparse
import base64
import hmac
import hashlib
import json
import os
import secrets
import time
from datetime import datetime


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def issue_license(tenant, tier, expires, nfr, license_secret):
    header = {"alg": "HS256", "typ": "JWT"}
    exp_dt = datetime.strptime(expires, "%Y-%m-%d")
    exp_ts = int(exp_dt.timestamp())
    claims = {
        "sub": tenant,
        "tier": tier,
        "features": [],
        "is_nfr": nfr,
        "iat": int(time.time()),
        "exp": exp_ts,
    }
    h = b64url_encode(json.dumps(header, separators=(',', ':')).encode())
    p = b64url_encode(json.dumps(claims, separators=(',', ':')).encode())
    signing_input = f"{h}.{p}".encode()
    sig = hmac.new(license_secret.encode(), signing_input, hashlib.sha256).digest()
    s = b64url_encode(sig)
    return f"{h}.{p}.{s}"


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd')
    sub.add_parser('keygen')
    issue = sub.add_parser('issue')
    issue.add_argument('--tenant', required=True)
    issue.add_argument('--tier', default='enterprise')
    issue.add_argument('--expires', required=True)
    issue.add_argument('--nfr', action='store_true', default=True)
    issue.add_argument('--secret', default=os.environ.get('TIRESIAS_LICENSE_SECRET', ''))
    args = parser.parse_args()

    if args.cmd == 'keygen':
        secret = secrets.token_hex(32)
        b64 = base64.b64encode(secret.encode()).decode()
        print("TIRESIAS_LICENSE_SECRET=" + secret)
        print("base64=" + b64)
    elif args.cmd == 'issue':
        if not args.secret:
            print("ERROR: Set TIRESIAS_LICENSE_SECRET env var or pass --secret")
            raise SystemExit(1)
        jwt = issue_license(args.tenant, args.tier, args.expires, args.nfr, args.secret)
        b64 = base64.b64encode(jwt.encode()).decode()
        print("LICENSE_JWT=" + jwt)
        print("base64=" + b64)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
