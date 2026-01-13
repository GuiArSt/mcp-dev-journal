.PHONY: dev build start lint format fix clean install check typecheck help prod docker-up docker-down docker-logs docker-build

# Default - run from web directory
all: check build

# Delegate everything to web/
dev:
	cd web && npm run dev

build:
	cd web && npm run build

start:
	cd web && npm run start

# Production build + start (for network sharing)
prod:
	cd web && npm run build && npm run start

lint:
	cd web && npx eslint .

format:
	cd web && npx prettier --check "**/*.{ts,tsx,js,jsx,json,css}"

fix:
	cd web && npx prettier --write "**/*.{ts,tsx,js,jsx,json,css}"
	cd web && npx eslint --fix .

typecheck:
	cd web && npx tsc --noEmit

check:
	cd web && npx prettier --check "**/*.{ts,tsx,js,jsx,json,css}"
	cd web && npx eslint .
	cd web && npx tsc --noEmit
	@echo "✅ All checks passed!"

install:
	cd web && npm install --legacy-peer-deps

clean:
	rm -rf web/.next
	rm -rf web/node_modules/.cache

clean-all: clean
	rm -rf web/node_modules
	rm -rf web/package-lock.json

# Database
db-backup:
	curl -X POST http://localhost:3000/api/db/backup

sync-export:
	cd web && npx ts-node scripts/sync-db.ts export

sync-import:
	cd web && npx ts-node scripts/sync-db.ts import

sync-compare:
	cd web && npx ts-node scripts/sync-db.ts compare

# Docker commands
docker-build:
	docker compose build

docker-up:
	docker compose up -d
	@echo "🚀 Tartarus running at http://localhost:3777"
	@echo "🔧 MCP Server at http://localhost:3333"

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-restart:
	docker compose down && docker compose up -d

help:
	@echo ""
	@echo "📚 Developer Journal Workspace"
	@echo "==============================="
	@echo ""
	@echo "Development:"
	@echo "  make dev        - Start dev server (localhost only)"
	@echo "  make prod       - Build + start production (network sharing)"
	@echo "  make build      - Production build only"
	@echo "  make start      - Start production server"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up  - Start containers (port 3777)"
	@echo "  make docker-down - Stop containers"
	@echo "  make docker-logs - View logs"
	@echo "  make docker-build - Rebuild images"
	@echo ""
	@echo "Code quality:"
	@echo "  make check      - Run all checks"
	@echo "  make fix        - Auto-fix lint + format"
	@echo ""
