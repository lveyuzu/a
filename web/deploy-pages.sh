#!/usr/bin/env bash
# Builds the web app and publishes web/dist to the gh-pages branch, which GitHub Pages serves.
#   bash web/deploy-pages.sh
set -euo pipefail
cd "$(dirname "$0")"

npm run build

tmp="$(mktemp -d)"
cleanup() { git worktree remove --force "$tmp" 2>/dev/null || rm -rf "$tmp"; git worktree prune; }
trap cleanup EXIT

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch -q origin gh-pages
  git worktree add -q --detach "$tmp" origin/gh-pages
else
  git worktree add -q --detach "$tmp"
  git -C "$tmp" checkout -q --orphan gh-pages-publish
fi

git -C "$tmp" rm -rfq --ignore-unmatch .
cp -R dist/. "$tmp"/
touch "$tmp/.nojekyll"   # serve files as they are, without Jekyll
git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
  echo "The published site is already up to date."
  exit 0
fi
git -C "$tmp" commit -qm "Publish $(git rev-parse --short HEAD)"
git -C "$tmp" push -q origin HEAD:gh-pages
echo "Published. GitHub Pages updates within a minute or two."
