#!/usr/bin/env bash
set -euo pipefail
image="${1:?Pass the OAuth container image}"
container="thoughts-oauth-check-${RANDOM}-${RANDOM}"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT

docker run --detach --name "$container" \
    --read-only --init --cap-drop ALL --security-opt no-new-privileges:true \
    --memory 128m --cpus 0.5 --pids-limit 64 \
    --publish 127.0.0.1::4010 \
    --env NOTION_OAUTH_CLIENT_ID=container-smoke \
    --env NOTION_OAUTH_CLIENT_SECRET=container-smoke-secret \
    --env NOTION_OAUTH_REDIRECT_URI=https://auth.example.com/notion/oauth/callback \
    "$image" >/dev/null
address="http://$(docker port "$container" 4010/tcp)"
for attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 2 "$address/health" >/dev/null; then break; fi
    sleep 1
done
curl --fail --silent --max-time 3 "$address/health"
response=$(curl --fail --silent --max-time 3 "$address/notion/oauth/start" \
    --header 'Content-Type: application/json' \
    --data '{"challenge":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')
node --input-type=module - "$response" <<'JS'
import assert from 'node:assert/strict'
const data = JSON.parse(process.argv[2])
const url = new URL(data.url)
assert.equal(url.origin, 'https://api.notion.com')
assert.equal(url.searchParams.get('client_id'), 'container-smoke')
assert.equal(url.searchParams.get('redirect_uri'), 'https://auth.example.com/notion/oauth/callback')
assert.equal(url.searchParams.get('state'), data.state)
console.log('\nContainer health and OAuth start passed')
JS
test "$(docker exec "$container" id -u)" != 0
docker stop --time 25 "$container" >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = 0
