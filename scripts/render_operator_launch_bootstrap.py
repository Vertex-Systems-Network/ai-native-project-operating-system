#!/usr/bin/env python3
"""Render a secret-safe ANPOS commercial launch handoff.

The renderer preconfigures GitHub App registration URLs, exact deployable
artifact identity, production-verifier arguments, and the production
environment-variable contract. It never accepts private keys, webhook secrets,
database credentials, operator tokens, Marketplace plan IDs, prices, or other
live secret/business-authority values.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_PATH = ROOT / "commercial-service/package.json"
PROTOCOL_PATH = ROOT / "config/protocol/version.json"
ORG_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
APP_NAME_RE = re.compile(r"^[^\r\n]{3,100}$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
EXPECTED_SERVICE_NAME = "anpos-commercial-service"
EXPECTED_RUNTIME_CONTRACT = "split-github-app-v1"

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


def load_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise BootstrapError(f"{label} is unavailable or invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise BootstrapError(f"{label} must contain a JSON object")
    return value


def load_artifact_identity(
    package_path: Path = PACKAGE_PATH,
    protocol_path: Path = PROTOCOL_PATH,
) -> dict[str, str]:
    """Load deployable identity from committed package/protocol metadata.

    The package is the deployable artifact identity source. Canonical protocol
    metadata is checked as an invariant so a stale package cannot generate a
    misleading operator handoff.
    """
    package = load_json_object(package_path, "commercial service package metadata")
    protocol = load_json_object(protocol_path, "canonical protocol metadata")

    service = str(package.get("name") or "")
    service_version = str(package.get("version") or "")
    anpos = package.get("anpos") or {}
    if not isinstance(anpos, dict):
        raise BootstrapError("commercial service package anpos metadata must be an object")
    source_protocol_version = str(anpos.get("source_protocol_version") or "")
    runtime_contract = str(anpos.get("runtime_contract") or "")
    canonical_protocol_version = str(protocol.get("version") or "")

    if service != EXPECTED_SERVICE_NAME:
        raise BootstrapError(f"unexpected commercial service package name: {service or '<missing>'}")
    if not VERSION_RE.fullmatch(service_version):
        raise BootstrapError("commercial service package version is missing or invalid")
    if not VERSION_RE.fullmatch(source_protocol_version):
        raise BootstrapError("commercial service source protocol version is missing or invalid")
    if source_protocol_version != canonical_protocol_version:
        raise BootstrapError(
            "commercial service source protocol version does not match canonical protocol metadata"
        )
    if runtime_contract != EXPECTED_RUNTIME_CONTRACT:
        raise BootstrapError(
            f"commercial service runtime contract must be {EXPECTED_RUNTIME_CONTRACT}"
        )

    return {
        "service": service,
        "service_version": service_version,
        "source_protocol_version": source_protocol_version,
        "runtime_contract": runtime_contract,
    }


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


def render(
    inputs: Inputs,
    artifact_identity: dict[str, str] | None = None,
) -> dict[str, Any]:
    identity = dict(artifact_identity or load_artifact_identity())
    required_identity = {"service", "service_version", "source_protocol_version", "runtime_contract"}
    if set(identity) != required_identity or any(not str(identity[key]) for key in required_identity):
        raise BootstrapError("artifact identity is incomplete")

    vendor_permissions = {"contents": "read", "metadata": "read"}
    if inputs.collaborator_provisioning:
        vendor_permissions["administration"] = "write"

    verifier_arguments = [
        "--require-ready",
        "--expected-service-version",
        identity["service_version"],
        "--expected-protocol-version",
        identity["source_protocol_version"],
    ]

    return {
        "schema_version": 2,
        "status": "operator_actions_required",
        "launch_authorized": False,
        "organization": inputs.organization,
        "service_base_url": inputs.service_base_url,
        "homepage_url": inputs.homepage_url,
        "artifact_identity": identity,
        "production_verifier_arguments": verifier_arguments,
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
            f"Populate the {identity['service']} {identity['service_version']} production environment contract with real external values.",
            f"Deploy the exact {identity['service']} {identity['service_version']} artifact and require /api/version to report source protocol {identity['source_protocol_version']} and runtime contract {identity['runtime_contract']}.",
            "Run scripts/verify_commercial_production.py with the generated production_verifier_arguments; exact artifact identity must pass before /api/ready can count as evidence.",
            "Require /api/ready HTTP 200 and real Marketplace E2E evidence before launch authorization.",
        ],
        "safety": [
            "This output contains no credentials and is not proof that either GitHub App exists.",
            "Registration URLs are prefilled operator aids; GitHub remains the authority for the final App configuration.",
            "Artifact identity is read from committed deployable package metadata and checked against canonical protocol metadata; do not replace it with hand-maintained expected versions.",
            "Do not reuse App IDs or private keys across Marketplace and Vendor Distribution roles.",
            "Do not use legacy GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY with the split-App commercial service contract.",
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
        output = render(inputs)
    except BootstrapError as exc:
        print(f"ANPOS operator launch bootstrap FAILED: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
