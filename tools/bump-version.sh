#!/bin/sh
# Stamps the script and stylesheet links in the pages with a new ?v= so browsers load the new files after a release.
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
for f in index.html preview.html; do
  sed -i -E "s#(src|href)=\"((js|css|vendor|presets)/[^\"?]+)(\?v=[0-9]+)?\"#\1=\"\2?v=$V\"#g" "$f"
done
echo "version $V"
