# Security and AI governance baseline

## Mandatory controls

- MFA, least-privilege RBAC/ABAC, jurisdiction scoping and audited access.
- Encrypt data in transit and at rest; manage service secrets outside Git.
- Strict action policy: independent maker and checker, no self-approval, no real dispatch or public warning from AI alone.
- Input validation, source verification, replay protection, idempotency and rate limits.
- Prompt-injection resistant document retrieval with provenance, citations and explicit untrusted content boundaries.
- Data classification, minimization and permitted retention; no biometric identification in initial scope.
- No continuous retraining from unchecked operator responses or raw footage; validate labels and evaluate offline.
- Defined incident response, recovery objectives and audit export procedures before live deployment.

## Mode model

observe → recommend → supervised internal triage → bounded reversible internal automation.

Critical public-safety actions always require a designated human decision. An AI-only mode may run in a disconnected simulator, never against live dispatch or alert infrastructure.

## Threat model targets

Compromised sensor/device, forged official alerts, data poisoning, unauthorized exports, model drift, workflow bypass, prompt injection, malicious insiders, overloaded services and stale-data misinterpretation.
