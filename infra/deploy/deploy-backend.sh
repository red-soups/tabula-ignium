#!/usr/bin/env bash
set -euo pipefail

revision="${1:?Pass the release commit SHA}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || {
  echo "Invalid commit SHA" >&2
  exit 1
}

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir=/opt/sanbul24
service=sanbul24-api.service

if [[ ! -s /etc/sanbul24/api.env ]]; then
  echo "Configure /etc/sanbul24/api.env before deploying." >&2
  exit 1
fi

install -d -m 0755 "$app_dir/releases"

exec 9>"$app_dir/deploy.lock"
flock 9

if ! id -u sanbul24 >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --shell /sbin/nologin sanbul24
fi
install -d -m 0750 -o sanbul24 -g sanbul24 /var/lib/sanbul24/documents
release_dir="$(mktemp -d "$app_dir/releases/$revision.XXXXXX")"
chmod 0755 "$release_dir"
install -d -m 0755 "$release_dir/migrations"
install -m 0644 "$source_dir/api.jar" "$release_dir/api.jar"
install -m 0644 "$source_dir"/migrations/*.sql "$release_dir/migrations/"
install -m 0644 "$source_dir/$service" "/etc/systemd/system/$service"

ln -sfn "$release_dir" "$app_dir/current.next"
mv -Tf "$app_dir/current.next" "$app_dir/current"
systemctl daemon-reload
systemctl restart "$service"

for ((attempt = 0; attempt < 40; attempt++)); do
  if systemctl is-active --quiet "$service" &&
     response="$(curl -fsS --max-time 3 http://127.0.0.1:8080/api/regions 2>/dev/null)" &&
     [[ "$response" == *'"countryCode":"KOR"'* ]]; then
    systemctl enable "$service"
    echo "Deployed $revision. The regions API returned data for KOR."
    exit 0
  fi
  sleep 3
done

echo "The regions API did not return data for KOR. Check journalctl -u $service on EC2." >&2
exit 1
