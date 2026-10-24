#!/usr/bin/env bash
# Build the Docker image stamped with the version, git commit and build time (shown in the web UI and /api/version).
#
#   scripts/build-image.sh                                               # tags pob2-enhanced:latest
#   IMAGE=192.168.1.147:5000/pob2-enhanced scripts/build-image.sh --push  # also push to a registry
#
# Tags :latest and :<version>-<commit>. A build from uncommitted changes gets a "-dirty" commit.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-pob2-enhanced}"
PUSH=0
[[ "${1:-}" == "--push" ]] && PUSH=1

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' python/pyproject.toml | head -1)"
COMMIT="$(git rev-parse --short=9 HEAD)"
[[ -n "$(git status --porcelain --untracked-files=no)" ]] && COMMIT="$COMMIT-dirty"
BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Building $IMAGE v$VERSION ($COMMIT)"
docker build -f docker/enhanced.Dockerfile \
    --build-arg VERSION="$VERSION" --build-arg GIT_COMMIT="$COMMIT" --build-arg BUILD_TIME="$BUILT" \
    -t "$IMAGE:latest" -t "$IMAGE:$VERSION-$COMMIT" .

if (( PUSH )); then
    docker push "$IMAGE:latest"
    docker push "$IMAGE:$VERSION-$COMMIT"
fi
