import os, json
from datetime import timedelta


def load_custom_registry_templates():
    try:
        raw = os.getenv("CUSTOM_REGISTRY_TEMPLATES", "{}")
        return json.loads(raw)
    except Exception:
        return {}
        
class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    if not SECRET_KEY:
        raise RuntimeError("ERROR: SECRET_KEY environment variable is not set.")

    DISABLE_AUTH = os.environ.get("DISABLE_AUTH", "false").lower() == "true"

    if not DISABLE_AUTH:
        ADMIN_USERNAME = os.environ.get("USERNAME")
        ADMIN_PASSWORD = os.environ.get("PASSWORD")
        if not ADMIN_USERNAME or not ADMIN_PASSWORD:
            raise RuntimeError("USERNAME and PASSWORD environment variables must be set.")
    else:
        ADMIN_USERNAME = None
        ADMIN_PASSWORD = None
        
    TRAEFIK_ENABLE = os.environ.get("TRAEFIK_LABELS", "true").lower() == "true"
    TAGS_ENABLE = os.environ.get("TAGS", "true").lower() == "true"
    PORT_RANGE_GROUPING = os.environ.get("PORT_RANGE_GROUPING", "true").lower() == "true"
    PORT_RANGE_THRESHOLD = int(os.environ.get("PORT_RANGE_THRESHOLD", "5"))
    CONTAINER_ACTIONS_ENABLE = os.environ.get("CONTAINER_ACTIONS_ENABLE", "false").lower() == "true"
    
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)
    
    APP_VERSION = os.environ.get('VERSION', 'dev')
        
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

    DOCKER_CONNECTION_TIMEOUT = float(os.environ.get("DOCKER_CONNECTION_TIMEOUT", "2"))
    
    PORT = int(os.environ.get("PORT", "8000"))
    
    CUSTOM_REGISTRY_TEMPLATES = load_custom_registry_templates()

    # Defence in depth against injected markup in container labels: no inline
    # scripts, and no requests off-origin (which is what an exfiltration payload
    # needs). 'unsafe-inline' is required for style-src only because the app
    # renders style="" attributes; inline styles cannot execute script.
    #
    # frame-ancestors is 'self' rather than 'none' so dashboards that embed
    # dockpeek in an iframe keep working. Set CONTENT_SECURITY_POLICY to
    # override the whole policy, or to an empty string to send no CSP at all.
    DEFAULT_CONTENT_SECURITY_POLICY = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'self'; "
        "base-uri 'self'; "
        "object-src 'none'"
    )

    CONTENT_SECURITY_POLICY = os.environ.get(
        "CONTENT_SECURITY_POLICY", DEFAULT_CONTENT_SECURITY_POLICY
    )
