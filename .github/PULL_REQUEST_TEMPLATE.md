## Description

Please include a summary of the change and which issue it fixes (if applicable). Provide context on the changes and any implementation details.

Fixes # (issue reference, if any)

---

## Type of Change

Please tick the options that apply:

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactoring (internal cleanup with no functional changes)
- [ ] Documentation update

---

## Quality Checklist

Before submitting this pull request, please verify that you have met all these requirements:

- [ ] **PNPM Strictness**: Verified that all packages were installed and managed strictly via `pnpm` (no `package-lock.json` was generated, and no `npm` commands were run).
- [ ] **Tests Pass**: Ran `pnpm test` and ensured all tests passed successfully with no leaks or open handles.
- [ ] **Linter check**: Ran `pnpm lint` and resolved all errors/warnings.
- [ ] **Text Casing Rules**: Verified that any new toast notifications, dialogs, or UI copy do **not** use all-uppercase text casing.
- [ ] **State Integrity**: Any environment variable cleanups in tests use `delete process.env.VAR` (not `= null` or `= undefined`).

---

## Testing / Verification Walkthrough

Please describe how you verified your changes:
- Include commands run for automated tests.
- Outline steps taken for manual UI validation (e.g. checked in dev environment, verified hover states, checked tab transitions).
