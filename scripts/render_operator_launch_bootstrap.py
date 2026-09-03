#!/usr/bin/env python3
"""Render a secret-safe ANPOS commercial launch handoff.

The renderer preconfigures GitHub App registration URLs and the production
environment-variable contract, but it never accepts private keys, webhook
secrets, database credentials, operator tokens, Marketplace plan IDs, prices,
or other live secret/business values.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from dataclasses import dataclass
from typing import Any

ORG_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
APP_NAME_RE = re.compile(r"^[^\r\n]{3,100}$")

MARKETPLACE_APP_ENV = [
    "GITHUB_MARKETPLACE_APP_ID",
    "GITHUB_MARKETPLACE_APP_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
]
VENDOR_APP_ENV = [
    "GITHUB_VENDOR_APP_ID",
    "GITHUB_VENDOR_APP_PRIVATE_KEY",
    "GITHUB_VENDOR_INSTALLATION_ID",
    "ANPOS_PRIVATE_TEMPLATE_REPO",
]
SERVICE_ENV = [
    "DATABASE_URL",
    "ANPOS_ENTITLEMENT_PRIVATE_KEY",
    "ANPOS_ENTITLEMENT_KEY_ID",
    "ANPOS_ENTITLEMENT_ISSUER",
    "ANPOS_OPERATOR_TOKEN",
    "ANPOS_MARKETPLACE_PLAN_MAP",
    "ANPOS_ORG_SEAT_LIMITS",
]
LEGACY_SINGLE_APP_ENV = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"]


class BootstrapError(ValueError):
    pass


@dataclass(frozen=True)
class Inputs:
    organization: str
    service_base_url: str
    homepage_url: str
    marketplace_app_name: str
    vendor_app_name: str
    collaborator_provisioning: bool


def normalize_https_url(value: str, label: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if parsed.scheme != "https" or not parsed.netloc:
        raise BootstrapError(f"{label} must be an absolute https:// URL")
    if parsed.username or parsed.password:
        raise BootstrapError(f"{label} must not contain embedded credentials")
    if parsed.query or parsed.fragment:
        raise BootstrapError(f"{label} must not contain query or fragment data")
    path = parsed.path.rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def validate_org(value: str) -> str:
    organization = value.strip()
    if not ORG_RE.fullmatch(organization):
        raise BootstrapError("organization must be a valid GitHub organization slug")
    return organization


def validate_app_name(value: str, label: str) -> str:
    name = value.strip()
    if not APP_NAME_RE.fullmatch(name):
        raise BootstrapError(f"{label} must be 3-100 characters and contain no newlines")
    return name


def registration_url(organization: str, params: list[tuple[str, str]]) -> str:
    query = urllib.parse.urlencode(params, doseq=True, quote_via=urllib.parse.quote)
    return f"https://github.com/organizations/{organization}/settings/apps/new?{query}"


def marketplace_registration_url(inputs: Inputs) -> str:
    webhook_url = inputs.service_base_url + "/api/webhooks/github/marketplace"
    params = [
        ("name", inputs.marketplace_app_name),
        ("description", "ANPOS customer-facing GitHub Marketplace application"),
        ("url", inputs.homepage_url),
        ("public", "true"),
        ("webhook_active", "true"),
        ("webhook_url", webhook_url),
        ("events[]", "marketplace_purchase"),
        ("request_oauth_on_install", "false"),
    ]
    return registration_url(inputs.organization, params)


def vendor_registration_url(inputs: Inputs) -> str:
    params = [
        ("name", inputs.vendor_app_name),
        ("description", "ANPOS private vendor template distribution application"),
        ("url", inputs.homepage_url),
        ("public", "false"),
        ("webhook_active", "false"),
        ("request_oauth_on_install", "false"),
        ("contents", "read"),
    ]
    if inputs.collaborator_provisioning:
        params.append(("administration", "write"))
    return registration_url(inputs.organization, params)


def render(inputs: Inputs) -> dict[str, Any]:
    vendor_permissions = {"contents": "read", "metadata": "read"}
    if inputs.collaborator_provisioning:
        vendor_permissions["administration"] = "write"

    return {
        "schema_version": 1,
        "status": "operator_actions_required",
        "launch_authorized": False,
        "organization": inputs.organization,
        "service_base_url": inputs.service_base_url,
        "homepage_url": inputs.homepage_url,
        "github_apps": {
            "marketplace": {
                "role": "customer_marketplace_app",
                "public": True,
                "registration_url": marketplace_registration_url(inputs),
                "webhook_url": inputs.service_base_url + "/api/webhooks/github/marketplace",
                "events": ["marketplace_purchase"],
                "repository_permissions": {},
                "environment_keys": MARKETPLACE_APP_ENV,
            },
            "vendor_distribution": {
                "role": "vendor_distribution_app",
                "public": False,
                "registration_url": vendor_registration_url(inputs),
                "events": [],
                "permissions": vendor_permissions,
                "collaborator_provisioning_enabled": inputs.collaborator_provisioning,
                "environment_keys": VENDOR_APP_ENV,
            },
        },
        "service_environment_keys": SERVICE_ENV,
        "legacy_single_app_environment_keys_forbidden": LEGACY_SINGLE_APP_ENV,
        "operator_sequence": [
            "Create private vendor service and template repositories from certified deterministic exports.",
            "Register the public Marketplace App using the prefilled URL; review every field before submission.",
            "Register the private Vendor Distribution App using the prefilled URL; keep Administration write disabled unless collaborator provisioning is deliberately enabled.",
            "Generate and store distinct App private keys in the deployment secret store; never commit them.",
            "Install only the Vendor Distribution App on the private commercial-template repository.",
            "Populate the 0.3.0 production environment contract with real external values.",
            "Deploy commercial service 0.3.0 from vendor-private source or a verified immutable artifact.",
            "Require /api/ready HTTP 200 and real Marketplace E2E evidence before launch authorization.",
        ],
        "safety": [
            "This output contains no credentials and is not proof that either GitHub App exists.",
            "Registration URLs are prefilled operator aids; GitHub remains the authority for the final App configuration.",
            "Do not reuse App IDs or private keys across Marketplace and Vendor Distribution roles.",
            "Do not use legacy GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY with commercial service 0.3.0.",
            "Do not infer Marketplace approval, publisher verification, installation counts, prices, plan IDs, repository existence, or production readiness from this output.",
        ],
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization", required=True, help="GitHub organization that will own both App registrations")
    parser.add_argument("--service-base-url", required=True, help="HTTPS base URL of the ANPOS commercial service")
    parser.add_argument("--homepage-url", required=True, help="HTTPS product/application homepage URL")
    parser.add_argument("--marketplace-app-name", default="ANPOS Marketplace")
    parser.add_argument("--vendor-app-name", default="ANPOS Vendor Distribution")
    parser.add_argument(
        "--enable-collaborator-provisioning",
        action="store_true",
        help="Prefill Administration: write on the private Vendor App; archive-only is safer and remains the default",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        inputs = Inputs(
            organization=validate_org(args.organization),
            service_base_url=normalize_https_url(args.service_base_url, "service base URL"),
            homepage_url=normalize_https_url(args.homepage_url, "homepage URL"),
            marketplace_app_name=validate_app_name(args.marketplace_app_name, "Marketplace App name"),
            vendor_app_name=validate_app_name(args.vendor_app_name, "Vendor App name"),
            collaborator_provisioning=bool(args.enable_collaborator_provisioning),
        )
    except BootstrapError as exc:
        print(f"ANPOS operator launch bootstrap FAILED: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(render(inputs), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
