# GitHub Marketplace Listing Evidence

Status: **external listing assets and live URLs pending**.

ANPOS already has a requirements baseline in `blueprints/commercial/github-marketplace-compliance.json` and a listing draft. This evidence layer answers a different question: whether the actual assets, URLs, contacts, public App behavior, and webhook configuration needed for submission have been verified.

Machine-readable state lives in `config/licensing/marketplace-listing-evidence.json`.

## Evidence that must be real

Before Marketplace submission, retain verified evidence for:

- product homepage;
- privacy policy;
- support URL or support email;
- Terms URL when used by the listing;
- publisher contact details;
- final logo;
- final feature card;
- final screenshots;
- public GitHub App installability;
- Marketplace webhook configuration and reachable behavior.

For artwork, use immutable artifact references plus SHA-256 when possible. For URLs and public App behavior, record verification time and evidence reference.

## Fail-closed rule

Draft copy, placeholder URLs, repository files, mocked images, or a green source build do not prove the Marketplace listing is ready. `listing_evidence_complete` stays false until the external evidence is actually supplied and reviewed.

GitHub requirements can change. Re-check official GitHub Marketplace documentation immediately before submission even when all local evidence items are complete.
