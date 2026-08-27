# Testing Rules

- PASS may be claimed only for checks that actually ran successfully and for acceptance criteria that have direct evidence; never infer PASS from compilation, confidence, or a different test.
- Run the verification required by root governance and the active PRD for the affected scope; unavailable test infrastructure must be reported as a limitation, not replaced with a fake script or fabricated result.
- Bug fixes should add regression coverage at the nearest stable automated layer when such a layer exists; otherwise require direct reproducible verification of the corrected behavior.
- UI behavior requires rendered browser evidence when acceptance depends on interaction or appearance; visual-parity claims require direct comparison evidence.
- Export changes require validation of a generated artifact and its content/fidelity, not only a successful API response or build.
- Database/security changes require evidence for the affected schema, policy, ownership, or trust-boundary behavior; static compilation alone is insufficient.
- Never weaken, delete, skip, or broadly suppress existing tests, lint rules, type checks, or assertions merely to obtain a green result.
- Tests and fixtures must not depend on production secrets or unnecessary real user data and should remain deterministic where practical.
