#!/usr/bin/env bash
set -euo pipefail

(cd backend && npm run typecheck && npm test)
(cd frontend && npm run lint && npm test && npm run build)
