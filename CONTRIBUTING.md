# Contributing to DzLinux

Thank you for your interest in contributing to DzLinux! We welcome issues, suggestions, and pull requests to help make this server browser and mod manager even better.

Please review the following guidelines before getting started.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any violations or unacceptable behavior to **dzlinux@route2place.com**.

---

## How to Contribute

### 1. Reporting Bugs & Requesting Features
- Search the open issues to ensure your bug or feature request has not already been reported.
- Open a new issue with a clear title and description, detailing how to reproduce the bug (if applicable) or explaining the utility of the feature request.

### 2. Submitting Pull Requests
- Fork the repository and create your branch from `main`:
  ```bash
  git checkout -b feature/your-feature-name
  ```
- Keep changes concise, focused, and well-tested.
- Ensure your branch is up-to-date with `main` before submitting a PR.
- Fill out the provided [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) completely.

---

## Local Development Guidelines

### 1. Package Manager (Strictly PNPM)
This repository strictly enforces `pnpm` for dependency and package management.
- **Do NOT** use `npm` or `yarn` (such as `npm install` or `npm update`), as this will break lockfile synchronization (`pnpm-lock.yaml`) and fail the CI pipelines.
- To install dependencies, run:
  ```bash
  pnpm install
  ```

### 2. Linting & Formatting
Before committing your changes, ensure your code passes ESLint checks:
- Run the linter:
  ```bash
  pnpm lint
  ```
- Automatically fix simple lint errors:
  ```bash
  pnpm lint:fix
  ```

### 3. Testing
This project uses Jest for unit and integration testing.
- Always run the test suite to verify your changes do not introduce regressions:
  ```bash
  pnpm test
  ```
- Ensure any test setup/teardown cleaning up env variables uses `delete process.env.VAR` rather than assigning `undefined` or `null` to avoid global variable leakages.

### 4. UI Design & Casing Guidelines
To maintain our tactical HUD styling:
- **Case Formatting**: Do not use all-uppercase strings in toast notifications, dialogs, button labels, or general user-facing UI copy unless explicitly requested (e.g. use standard sentence case or title case like `Your DzLinux client is up to date` instead of `YOUR DZLINUX CLIENT IS UP TO DATE`).
- Use HSL variables and defined design systems instead of ad-hoc CSS colors.

---

## Commit Message Style

We prefer clear, imperative, and descriptive commit titles.
- **Format**: `<type>(<scope>): <short description>`
- **Types**:
  - `feat`: A new feature
  - `fix`: A bug fix
  - `docs`: Documentation-only changes
  - `style`: Changes that do not affect the meaning of the code (formatting, white-space, etc.)
  - `refactor`: A code change that neither fixes a bug nor adds a feature
  - `test`: Adding missing tests or correcting existing tests
  - `chore`: Internal tool updates or build/dependency changes

Example:
```text
feat(ui): relocate utility buttons to titlebar and add hotkeys
```
