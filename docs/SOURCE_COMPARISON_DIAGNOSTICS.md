# Synthetic Source Comparison Diagnostics

AEGIS can compare only synthetic observations whose source records explicitly
share a comparison group, unit, time window and absolute tolerance. It never
infers compatibility from geography, labels or units alone.

The deterministic result is `agreement`, `disagreement`, or `not_comparable`.
Only current, curated, numeric observations inside the configured time window
participate. Every evaluated group cites its source UUIDs and publishes the
observed range and threshold. Partial or conflicting policy metadata fails
closed.

The seeded A1/A2 rainfall pair demonstrates the path. Its threshold is a
teaching fixture, not a learned confidence score or scientific calibration.
Agreement does not establish independent corroboration, sensor accuracy,
hazard probability, asset impact or authority to act. The result remains part
of the human assessment checklist and cannot approve or execute a response.

Schema changes are additive in `db/migrations/010_exercise_source_comparison.sql`.
Existing volumes receive them through the one-shot `migrate` service; the seed
service then idempotently adds the second fictional rain gauge.
