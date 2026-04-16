.PHONY: docker-build install build test test-unit test-int test-e2e test-coverage lint clean package shell

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

# Open a shell inside the container for debugging
shell:
	docker compose run --rm dev sh
