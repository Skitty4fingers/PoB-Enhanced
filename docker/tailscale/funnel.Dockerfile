# A Tailscale node that publishes a PoB-Enhanced server on the internet with Funnel:
#   https://<TS_HOSTNAME>.<tailnet>.ts.net  ->  TARGET
# For running next to an existing server (e.g. a NAS app) instead of the compose sidecar:
#   docker build -f docker/tailscale/funnel.Dockerfile --build-arg TARGET=http://192.168.1.147:8080 -t pob2-funnel docker/tailscale
# Needs HTTPS certificates and the "funnel" node attribute enabled for the node in the Tailscale admin console.
# Add the node's name (pob2.<tailnet>.ts.net) to the server's POB2_ALLOWED_HOSTS.
FROM tailscale/tailscale:stable
ARG TARGET=http://127.0.0.1:8080
RUN mkdir -p /config && printf '%s\n' \
	'{"TCP": {"443": {"HTTPS": true}},' \
	' "Web": {"${TS_CERT_DOMAIN}:443": {"Handlers": {"/": {"Proxy": "'"$TARGET"'"}}}},' \
	' "AllowFunnel": {"${TS_CERT_DOMAIN}:443": true}}' > /config/serve.json
ENV TS_SERVE_CONFIG=/config/serve.json \
	TS_STATE_DIR=/var/lib/tailscale \
	TS_USERSPACE=true \
	TS_HOSTNAME=pob2
