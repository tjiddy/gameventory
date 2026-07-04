# Security

This is a personal, single-admin application. Write access is gated behind Authelia OIDC
(default-deny; only the configured `BOOTSTRAP_ADMIN` subject is accepted). Public browsing
is read-only.

## Reporting

Found something? Open a private security advisory on the GitHub repo, or contact the owner
directly. Please don't file a public issue for a vulnerability.

## Notes

- Secrets are provided via `*_FILE` env vars (mounted files), never baked into the image.
- All BGG traffic uses TLS verification (the legacy app disabled it — see SPEC.md §2 ledger C).
- Scraped tagline text is rendered as decoded plain text, never as HTML (ledger F).
