#!/usr/bin/env python3
"""Production smoke verifier for the separately deployed ANPOS commercial service.

This tool never creates Marketplace purchases or treats synthetic events as real billing
evidence. It verifies only observable deployment/runtime gates and optional authenticated
operator/customer paths supplied by the operator at execution time.
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

DEFAULT_TIMEOUT = 15.0
MAX_RESPONSE_BYTES = 1_000_000


class VerificationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str]
    body: bytes

    def json(self) -> Any:
        try:
            return json.loads(self.body.decode("utf-8"))
        except Exception as exc:  # pragma: no cover - exact decoder message is not contractual
            raise VerificationError(f"response is not valid UTF-8 JSON: {exc}") from exc


def normalize_base_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if parsed.scheme != "https" or not parsed.netloc:
        raise VerificationError("base URL must be an absolute https:// URL")
    if parsed.username or parsed.password:
        raise VerificationError("base URL must not contain embedded credentials")
    if parsed.query or parsed.fragment:
        raise VerificationError("base URL must not contain query/fragment data")
    path = parsed.path.rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def request(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> Response:
    url = base_url + path
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=context) as raw:
            payload = raw.read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                raise VerificationError(f"response from {path} exceeded {MAX_RESPONSE_BYTES} bytes")
            return Response(raw.status, {k.lower(): v for k, v in raw.headers.items()}, payload)
    except urllib.error.HTTPError as exc:
        payload = exc.read(MAX_RESPONSE_BYTES + 1)
        if len(payload) > MAX_RESPONSE_BYTES:
            payload = payload[:MAX_RESPONSE_BYTES]
        return Response(exc.code, {k.lower(): v for k, v in exc.headers.items()}, payload)
    except urllib.error.URLError as exc:
        raise VerificationError(f"request to {path} failed: {exc.reason}") from exc


def require_status(response: Response, expected: int, label: str) -> None:
    if response.status != expected:
        raise VerificationError(f"{label} expected HTTP {expected}, got {response.status}")


def check_health(base_url: str, timeout: float) -> None:
    response = request(base_url, "/api/health", timeout=timeout)
    require_status(response, 200, "health endpoint")
    data = response.json()
    if not isinstance(data, dict):
        raise VerificationError("health endpoint must return a JSON object")


def check_readiness(base_url: str, timeout: float, require_ready: bool) -> None:
    response = request(base_url, "/api/ready", timeout=timeout)
    if require_ready:
        require_status(response, 200, "readiness endpoint")
        data = response.json()
        if not isinstance(data, dict):
            raise VerificationError("readiness endpoint must return a JSON object")
    elif response.status == 200:
        response.json()
    elif response.status not in {401, 403, 404, 503}:
        raise VerificationError(
            f"readiness endpoint returned unexpected HTTP {response.status}; expected 200 or a fail-closed/protected status"
        )


def check_public_keys(base_url: str, timeout: float) -> None:
    response = request(base_url, "/v1/keys", timeout=timeout)
    require_status(response, 200, "public entitlement keys endpoint")
    data = response.json()
    if not isinstance(data, dict):
        raise VerificationError("public entitlement keys endpoint must return a JSON object")


def check_current_entitlement(base_url: str, timeout: float, github_token: str) -> None:
    response = request(
        base_url,
        "/v1/entitlements/current",
        headers={"Authorization": f"Bearer {github_token}"},
        timeout=timeout,
    )
    if response.status not in {200, 401, 403, 404}:
        raise VerificationError(f"current entitlement endpoint returned unexpected HTTP {response.status}")
    if response.status == 200:
        data = response.json()
        if not isinstance(data, dict):
            raise VerificationError("current entitlement response must be a JSON object")


def check_operator_reconcile(base_url: str, timeout: float, operator_token: str, account_id: str | None) -> None:
    payload: dict[str, Any] = {"dry_run": True}
    if account_id:
        payload["github_account_id"] = account_id
    response = request(
        base_url,
        "/v1/reconcile",
        method="POST",
        headers={
            "Authorization": f"Bearer {operator_token}",
            "Content-Type": "application/json",
            "Idempotency-Key": "anpos-production-verifier-dry-run",
        },
        body=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        timeout=timeout,
    )
    if response.status not in {200, 202, 400, 404}:
        raise VerificationError(f"operator reconciliation dry-run returned unexpected HTTP {response.status}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Production/staging commercial-service HTTPS base URL")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT)
    parser.add_argument("--require-ready", action="store_true", help="Require /api/ready to return HTTP 200")
    parser.add_argument(
        "--github-token-env",
        default=None,
        help="Optional environment-variable name containing a GitHub user token for entitlement smoke verification",
    )
    parser.add_argument(
        "--operator-token-env",
        default=None,
        help="Optional environment-variable name containing the operator token for dry-run reconciliation verification",
    )
    parser.add_argument("--github-account-id", default=None, help="Optional numeric GitHub account ID for operator dry-run reconciliation")
    return parser.parse_args(argv)


def read_secret_from_env(name: str | None) -> str | None:
    if not name:
        return None
    value = os.environ.get(name)
    if not value:
        raise VerificationError(f"required environment variable {name!r} is missing or empty")
    return value


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        if args.timeout <= 0 or args.timeout > 60:
            raise VerificationError("timeout must be > 0 and <= 60 seconds")
        base_url = normalize_base_url(args.base_url)
        github_token = read_secret_from_env(args.github_token_env)
        operator_token = read_secret_from_env(args.operator_token_env)

        check_health(base_url, args.timeout)
        check_readiness(base_url, args.timeout, args.require_ready)
        check_public_keys(base_url, args.timeout)
        if github_token:
            check_current_entitlement(base_url, args.timeout, github_token)
        if operator_token:
            check_operator_reconcile(base_url, args.timeout, operator_token, args.github_account_id)
    except VerificationError as exc:
        print(f"ANPOS commercial production verification FAILED: {exc}", file=sys.stderr)
        return 1

    print("ANPOS commercial production smoke verification passed.")
    if not args.require_ready:
        print("NOTE: production launch is not certified unless --require-ready passes and real Marketplace E2E evidence is recorded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
