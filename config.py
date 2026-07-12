import os, json
from datetime import timedelta
from pathlib import Path


def load_custom_registry_templates():
    try:
        raw = os.getenv("CUSTOM_REGISTRY_TEMPLATES", "{}")
        return json.loads(raw)
    except Exception:
        return {}

def resolve_env(var_name: str, default: str | None = None) -> str | None:
    file_var = f"{var_name}_FILE"

    value = os.environ.get(var_name)
    file_name = os.environ.get(file_var)

    if value is not None and file_name is not None:
        raise ValueError(f"{var_name} and {file_var} cannot both be set")

    if value is not None:
        return value

    if file_name is not None:
        return Path(file_name).read_text().rstrip("\n")

    return default

class Config:
    SECRET_KEY = resolve_env("SECRET_KEY")
    if not SECRET_KEY:
        raise RuntimeError("ERROR: Neither SECRET_KEY or SECRET_KEY_FILE environment variables are set.")

    DISABLE_AUTH = os.environ.get("DISABLE_AUTH", "false").lower() == "true"

    if not DISABLE_AUTH:
        ADMIN_USERNAME = resolve_env("USERNAME")
        ADMIN_PASSWORD = resolve_env("PASSWORD")
        if not ADMIN_USERNAME or not ADMIN_PASSWORD:
            raise RuntimeError("USERNAME and PASSWORD environment variables (or *_FILE equivalents) must be set.")
    else:
        ADMIN_USERNAME = None
        ADMIN_PASSWORD = None
        
    TRAEFIK_ENABLE = os.environ.get("TRAEFIK_LABELS", "true").lower() == "true"
    TAGS_ENABLE = os.environ.get("TAGS", "true").lower() == "true"
    PORT_RANGE_GROUPING = os.environ.get("PORT_RANGE_GROUPING", "true").lower() == "true"
    PORT_RANGE_THRESHOLD = int(os.environ.get("PORT_RANGE_THRESHOLD", "5"))
    
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)
    
    APP_VERSION = os.environ.get('VERSION', 'dev')
        
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

    DOCKER_CONNECTION_TIMEOUT = float(os.environ.get("DOCKER_CONNECTION_TIMEOUT", "2"))
    
    PORT = int(os.environ.get("PORT", "8000"))
    
    CUSTOM_REGISTRY_TEMPLATES = load_custom_registry_templates()
