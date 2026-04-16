.PHONY: docker-build install build test test-unit test-int test-e2e test-coverage lint clean package shell icons release

# Build the Docker image
docker-build:
	docker compose build

# Install/update npm dependencies (inside container)
install: docker-build
	docker compose run --rm dev npm install

# Build the extension (esbuild bundles to dist/)
build:
	docker compose run --rm dev npm run build

# Run all unit + integration tests
test:
	docker compose run --rm dev npm test

# Run unit tests only
test-unit:
	docker compose run --rm dev npm run test:unit

# Run integration tests only
test-int:
	docker compose run --rm dev npm run test:int

# Run e2e tests (requires Chrome in container)
test-e2e:
	docker compose run --rm dev npm run test:e2e

# Run tests with coverage report
test-coverage:
	docker compose run --rm dev npm run test:coverage

# Type-check without emitting
lint:
	docker compose run --rm dev npx tsc --noEmit

# Package extension as .zip for Chrome Web Store
package: build
	docker compose run --rm dev sh -c 'cd dist && zip -r ../margin-call.zip .'

# Remove build artifacts
clean:
	rm -rf dist margin-call.zip

# Render icons/icon.svg → icon16/48/128.png (uses Chromium in the dev container)
icons:
	docker compose run --rm dev node scripts/render-icons.mjs

# Cut a release: bump version in manifest.json + package.json, commit, tag.
# Usage: make release VERSION=1.2.3
# Then push: git push && git push origin v$(VERSION)
release:
	@if [ -z "$(VERSION)" ]; then \
	  echo "Usage: make release VERSION=1.2.3"; exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9]+)?$$'; then \
	  echo "VERSION must be semver (e.g. 1.2.3 or 1.2.3-rc1)"; exit 1; \
	fi
	@if [ -n "$$(git status --porcelain)" ]; then \
	  echo "Working tree is dirty; commit or stash first."; exit 1; \
	fi
	@if git rev-parse "v$(VERSION)" >/dev/null 2>&1; then \
	  echo "Tag v$(VERSION) already exists."; exit 1; \
	fi
	@echo "Bumping version to $(VERSION)..."
	@docker compose run --rm dev sh -c "\
	  node -e \"const f='manifest.json';const m=JSON.parse(require('fs').readFileSync(f));m.version='$(VERSION)';require('fs').writeFileSync(f,JSON.stringify(m,null,2)+'\n');\" && \
	  node -e \"const f='package.json';const m=JSON.parse(require('fs').readFileSync(f));m.version='$(VERSION)';require('fs').writeFileSync(f,JSON.stringify(m,null,2)+'\n');\" \
	"
	@git add manifest.json package.json
	@git commit -m "chore: release $(VERSION)"
	@git tag -a "v$(VERSION)" -m "Release $(VERSION)"
	@echo ""
	@echo "Tagged v$(VERSION). Push with:"
	@echo "  git push && git push origin v$(VERSION)"

# Open a shell inside the container for debugging
shell:
	docker compose run --rm dev sh
