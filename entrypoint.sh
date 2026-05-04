#!/bin/sh
set -e

# In this fork search is provided by an external orio-search instance, so the
# bundled SearXNG that upstream starts here is gone. The container now boots
# straight into Vane (Next.js standalone server).

cd /home/vane
echo "Starting Vane (search via orio-search at ${TAVILY_BASE_URL:-default})..."

exec node server.js
