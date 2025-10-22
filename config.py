import os
from datetime import timedelta

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
    
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)
    
    APP_VERSION = os.environ.get('VERSION', 'dev')
        
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

    DOCKER_CONNECTION_TIMEOUT = float(os.environ.get("DOCKER_CONNECTION_TIMEOUT", "0.5"))