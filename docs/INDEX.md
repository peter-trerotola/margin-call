# Margin Call Documentation Index

Complete documentation for the Margin Call Chrome Extension.

| Document | Link | Last Updated | Purpose |
|----------|------|--------------|---------|
| Project Overview | [README.md](./README.md) | 2026-04-15 | What Margin Call does, quick start, basic architecture |
| Development Guide | [DEVELOPMENT.md](./DEVELOPMENT.md) | 2026-04-15 | Setup, build workflow, GitHub OAuth setup, Makefile reference |
| Architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) | 2026-04-15 | Technical deep-dive, component interactions, data flows, design decisions |
| Testing | [TESTING.md](./TESTING.md) | 2026-04-15 | Test pyramid, running tests, writing new tests, coverage targets |
| Publishing | [PUBLISHING.md](./PUBLISHING.md) | 2026-04-15 | Chrome Web Store submission, versioning, distribution, update workflow |

## Quick Navigation

**Getting Started:**
1. Read [README.md](./README.md) for project overview
2. Follow [DEVELOPMENT.md](./DEVELOPMENT.md) for local setup
3. Run `make docker-build && make build && make test`

**Understanding the System:**
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for component details
2. Explore source files in `src/` with architecture in mind

**Writing Code:**
1. Reference [DEVELOPMENT.md](./DEVELOPMENT.md) for build/test commands
2. Reference [TESTING.md](./TESTING.md) for test writing
3. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for component interactions

**Deploying:**
1. Follow [PUBLISHING.md](./PUBLISHING.md) for Chrome Web Store
2. Manage versions in `manifest.json`
3. Create release notes in commit messages

## File Organization

All documentation lives in `/docs/`:

```
docs/
├── INDEX.md               # This file
├── README.md              # Project overview and quick start
├── DEVELOPMENT.md         # Development workflow and setup
├── ARCHITECTURE.md        # Technical deep-dive
├── TESTING.md             # Testing guide
└── PUBLISHING.md          # Chrome Web Store publishing
```

## Document Purposes

### README.md
**Audience:** New contributors, users, overview seekers

**Contains:**
- What Margin Call does and why it exists
- Quick start commands
- How to load the extension in Chrome
- Architecture summary (visual diagrams)
- Links to other documentation

**Read this first.**

### DEVELOPMENT.md
**Audience:** Developers setting up local environment

**Contains:**
- Prerequisites (Docker, Make, Chrome)
- Build commands (`make docker-build`, `make build`, etc.)
- Development workflow (edit → build → test → reload)
- GitHub OAuth App setup (step-by-step)
- Makefile targets reference
- Project structure overview

**Use this to get up and running.**

### ARCHITECTURE.md
**Audience:** Developers understanding the codebase

**Contains:**
- System overview with component diagram
- Details on each component (background, content script, panel)
- Data flows (OAuth, comment posting, selection mapping)
- Markdown rendering pipeline
- Diff parsing logic
- Design decisions with rationale
- Error handling patterns
- Performance and security considerations

**Reference this when making architectural decisions or understanding how features work.**

### TESTING.md
**Audience:** Developers writing and running tests

**Contains:**
- Test pyramid (unit, integration, E2E)
- How to run all test types (`make test`, `make test-unit`, etc.)
- Test organization and file locations
- Test fixtures (sample data)
- Chrome API mocks
- Examples of unit, integration, and E2E tests
- Coverage targets and goals
- How to write new tests
- Common issues and debugging

**Use this when adding features or fixing bugs (write tests first).**

### PUBLISHING.md
**Audience:** Maintainers publishing to Chrome Web Store

**Contains:**
- Pre-publication checklist
- Creating distribution package (`make package`)
- Chrome Web Store submission process (account setup, listing, review)
- Privacy policy template
- Screenshots and icon requirements
- Post-review publishing workflow
- Update process for new versions
- Policies and compliance
- Distribution alternatives

**Use this before releasing a new version.**

## Key Concepts Across Docs

### OAuth Flow
- **README.md:** High-level overview
- **DEVELOPMENT.md:** Step-by-step setup with GitHub OAuth App creation
- **ARCHITECTURE.md:** Detailed technical flow and implementation
- **TESTING.md:** How to test OAuth flow with mocks

### Line Mapping
- **README.md:** Mentioned as core feature
- **ARCHITECTURE.md:** Detailed explanation of markdown rendering pipeline and selection mapping
- **TESTING.md:** Examples of testing selection analysis

### Building and Testing
- **README.md:** Quick start commands
- **DEVELOPMENT.md:** Detailed explanation of each command
- **TESTING.md:** Detailed explanation of test commands and organization

## Update Frequency

These documents should be updated whenever:

1. **New features are added** → Update ARCHITECTURE.md and TESTING.md
2. **Build process changes** → Update DEVELOPMENT.md and PUBLISHING.md
3. **Component structure changes** → Update ARCHITECTURE.md
4. **GitHub OAuth setup changes** → Update DEVELOPMENT.md
5. **Publishing requirements change** → Update PUBLISHING.md

Each document has a "Last Updated" date in the index above.

## Contributing to Documentation

When adding to documentation:

1. Keep content accurate and up-to-date
2. Use clear, direct language (no marketing speak)
3. Include examples or code snippets where helpful
4. Use mermaid diagrams for complex flows or relationships
5. Update the date and index when finished

Document quality is as important as code quality.
