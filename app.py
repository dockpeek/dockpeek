import os
import re
import logging
from datetime import datetime, timedelta
from threading import Lock
from urllib.parse import urlparse
import docker
from docker.client import DockerClient
from packaging import version
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import (
    Flask, render_template, request, jsonify,
    redirect, url_for, session
)
from flask_cors import CORS
from flask_login import (
    LoginManager, UserMixin, login_user,
    logout_user, login_required, current_user
)
from werkzeug.security import generate_password_hash, check_password_hash

# === Logging Configuration ===
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("dockpeek" if __name__ == "__main__" else __name__)
logging.getLogger('werkzeug').setLevel(logging.WARNING)

# === Flask Initialization ===
app = Flask(__name__)
secret_key = os.environ.get("SECRET_KEY")
if not secret_key:
    raise RuntimeError("ERROR: SECRET_KEY environment variable is not set.")

app.permanent_session_lifetime = timedelta(days=14)
app.secret_key = secret_key
CORS(app)

# === Cache for update checks ===
update_cache = {}
cache_lock = Lock()
CACHE_DURATION = 300  # 5 minutes cache

# === ThreadPoolExecutor for async operations ===
executor = ThreadPoolExecutor(max_workers=4)

class UpdateChecker:
    def __init__(self):
        self.cache = {}
        self.lock = Lock()
        self.cache_duration = 300  # 5 minutes
        
    def get_cache_key(self, server_name, container_name, image_name):
        return f"{server_name}:{container_name}:{image_name}"
    
    def is_cache_valid(self, timestamp):
        return datetime.now() - timestamp < timedelta(seconds=self.cache_duration)
    
    def get_cached_result(self, cache_key):
        with self.lock:
            if cache_key in self.cache:
                result, timestamp = self.cache[cache_key]
                if self.is_cache_valid(timestamp):
                    return result, True
        return None, False
    
    def set_cache_result(self, cache_key, result):
        with self.lock:
            self.cache[cache_key] = (result, datetime.now())

    def check_local_image_updates(self, client, container, server_name):
        """Check if newer image is available locally"""
        try:
            container_image_id = container.attrs.get('Image', '')
            if not container_image_id:
                return False
                
            image_name = container.attrs.get('Config', {}).get('Image', '')
            if not image_name:
                return False
            
            # Extract image name and tag
            if ':' in image_name:
                base_name, current_tag = image_name.rsplit(':', 1)
            else:
                base_name = image_name
                current_tag = 'latest'
            
            try:
                local_image = client.images.get(f"{base_name}:{current_tag}")
                return container_image_id != local_image.id
            except Exception:
                return False
                
        except Exception as e:
            logger.error(f"Error checking local image updates for container '{container.name}'")
            return False
    
    def check_image_updates_async(self, client, container, server_name):
        """Asynchronous image update check with caching"""
        try:
            container_image_id = container.attrs.get('Image', '')
            if not container_image_id:
                return False
                
            image_name = container.attrs.get('Config', {}).get('Image', '')
            if not image_name:
                return False
            
            cache_key = self.get_cache_key(server_name, container.name, image_name)
            
            # Check cache first
            cached_result, is_valid = self.get_cached_result(cache_key)
            if is_valid:
                logger.info(f"🔄[ {server_name} ] - Using cached update result for {image_name}: {cached_result}")
                return cached_result
            
            # Extract image name and tag
            if ':' in image_name:
                base_name, current_tag = image_name.rsplit(':', 1)
            else:
                base_name = image_name
                current_tag = 'latest'
            
            try:
                # Pull image with timeout
                client.images.pull(base_name, tag=current_tag)
                updated_image = client.images.get(f"{base_name}:{current_tag}")
                updated_hash = updated_image.id
                
                result = container_image_id != updated_hash
                self.set_cache_result(cache_key, result)                
                if result:
                    logger.info(f" [ {server_name} ] - Update available - ⬆️{base_name}  :{current_tag}")
                else:
                    logger.info(f" [ {server_name} ] - Image is up to date - ✅{base_name}  :{current_tag}")                
                return result                
            except Exception as pull_error:
                logger.warning(f" [ {server_name} ] - Cannot pull latest version of - ⚠️{base_name}  :{current_tag}  -  it might be a locally built image")
                self.set_cache_result(cache_key, False)
                return False
                
        except Exception as e:
            logger.error(f"❌ Error checking image updates for '{container.name}'")
            return False

# Global update checker instance
update_checker = UpdateChecker()

# === Flask-Login Initialization ===
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# === User credentials from environment ===
ADMIN_USERNAME = os.environ.get("USERNAME")
ADMIN_PASSWORD = os.environ.get("PASSWORD")
TRAEFIK_ENABLE = os.environ.get("TRAEFIK_LABELS", "true").lower() == "true" 
TAGS_ENABLE = os.environ.get("TAGS", "true").lower() == "true"

if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise RuntimeError("USERNAME and PASSWORD environment variables must be set.")

# Hashed user storage
users = {
    ADMIN_USERNAME: {
        "password": generate_password_hash(ADMIN_PASSWORD)
    }
}

class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    if user_id in users:
        return User(user_id)
    return None

@login_manager.unauthorized_handler
def unauthorized_callback():
    return redirect(url_for('login'))

# === Docker Client Logic ===
DOCKER_TIMEOUT = 0.5  # Timeout in seconds

def _extract_hostname_from_url(url, is_docker_host):
    """Extracts hostname from Docker URL for public hostname determination"""
    if not url:
        return None
    
    # Handle unix socket (local connection)
    if url.startswith("unix://"):
        return None
    
    # Handle TCP connections
    if url.startswith("tcp://"):
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname
            if hostname:
                if hostname in ["127.0.0.1", "0.0.0.0", "localhost"]:
                    return None
                if _is_likely_internal_hostname(hostname, is_docker_host):
                    return None
                return hostname
        except Exception:
            pass
    
    # Handle other protocols
    try:
        match = re.search(r"(?:tcp://)?([^:]+)(?::\d+)?", url)
        if match:
            hostname = match.group(1)
            if hostname in ["127.0.0.1", "0.0.0.0", "localhost"]:
                return None
            if _is_likely_internal_hostname(hostname, is_docker_host):
                return None
            return hostname
    except Exception:
        pass
    
    return None

def _is_likely_internal_hostname(hostname, is_docker_host):
    """Determine if hostname is likely an internal Docker network name.
    This check is only applied to the main DOCKER_HOST, not DOCKER_HOST_n instances."""
    # For numbered hosts (DOCKER_HOST_n), we skip this check to allow
    # simple hostnames (e.g., 'server1') without being flagged as internal.
    if not is_docker_host:
        return False
    ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if re.match(ip_pattern, hostname):
        return False
    if '.' in hostname:
        return False
    return True

def _get_link_hostname(public_hostname, host_ip, is_docker_host):
    """Determine correct hostname for generating links"""
    if public_hostname:
        return public_hostname
    if host_ip and host_ip not in ['0.0.0.0', '127.0.0.1']:
        return host_ip
    try:
        return request.host.split(":")[0]
    except:
        return "localhost"

def discover_docker_clients():
    """Discover Docker clients from environment variables"""
    clients = []
    
    # Support DOCKER_HOST for backward compatibility
    if "DOCKER_HOST" in os.environ:
        host_url = os.environ.get("DOCKER_HOST")
        host_name = os.environ.get("DOCKER_HOST_NAME", "default")
        public_hostname = os.environ.get("DOCKER_HOST_PUBLIC_HOSTNAME")
        
        if not public_hostname:
            public_hostname = _extract_hostname_from_url(host_url, is_docker_host=True)
        
        try:
            client = DockerClient(base_url=host_url, timeout=DOCKER_TIMEOUT)
            client.ping()
            logger.debug(f"Docker host '{host_name}' is active.")
            clients.append({
                "name": host_name, 
                "client": client, 
                "url": host_url, 
                "public_hostname": public_hostname, 
                "status": "active", 
                "is_docker_host": True,
                "order": 0
            })
        except Exception as e:
            logger.error(f"Could not connect to DOCKER_HOST '{host_name}' at '{host_url}'")
            clients.append({
                "name": host_name, 
                "client": None, 
                "url": host_url, 
                "public_hostname": public_hostname, 
                "status": "inactive", 
                "is_docker_host": True,
                "order": 0
            })

    # Discover DOCKER_HOST_n_URL variables
    host_vars = {k: v for k, v in os.environ.items() if re.match(r"^DOCKER_HOST_\d+_URL$", k)}
    for key, url in host_vars.items():
        match = re.match(r"^DOCKER_HOST_(\d+)_URL$", key)
        if match:
            num = match.group(1)
            name = os.environ.get(f"DOCKER_HOST_{num}_NAME", f"server{num}")
            public_hostname = os.environ.get(f"DOCKER_HOST_{num}_PUBLIC_HOSTNAME")
            
            if not public_hostname:
                public_hostname = _extract_hostname_from_url(url, is_docker_host=False)
            
            try:
                client = DockerClient(base_url=url, timeout=DOCKER_TIMEOUT)
                client.ping()
                logger.info(f"[ {name} ]  Docker host is active")
                clients.append({
                    "name": name, 
                    "client": client, 
                    "url": url, 
                    "public_hostname": public_hostname, 
                    "status": "active", 
                    "is_docker_host": False,
                    "order": int(num)
                })
            except Exception as e:
                logger.error(f"[ {name} ] Could not connect to Docker host at {url}")
                clients.append({
                    "name": name, 
                    "client": None, 
                    "url": url, 
                    "public_hostname": public_hostname, 
                    "status": "inactive", 
                    "is_docker_host": False,
                    "order": int(num)
                })

    # Fallback to local socket if no hosts found
    if not clients:
        fallback_name = os.environ.get("DOCKER_NAME", "default")
        try:
            client = docker.from_env(timeout=DOCKER_TIMEOUT)
            client.ping()
            clients.append({
                "name": fallback_name, 
                "client": client, 
                "url": "unix:///var/run/docker.sock", 
                "public_hostname": "", 
                "status": "active", 
                "is_docker_host": True,
                "order": 0
            })
        except Exception as e:
            clients.append({
                "name": fallback_name, 
                "client": None, 
                "url": "unix:///var/run/docker.sock", 
                "public_hostname": "", 
                "status": "inactive", 
                "is_docker_host": True,
                "order": 0
            })
            
    return clients

def get_container_status_with_exit_code(container):
    """Get container status with exit code information if available"""
    try:
        base_status = container.status
        container_attrs = container.attrs
        state = container_attrs.get('State', {})
        
        exit_code = state.get('ExitCode')
        
        # First check base status - this takes priority over health status
        if base_status in ['exited', 'dead']:
            return base_status, exit_code
        elif base_status in ['paused', 'restarting', 'removing', 'created']:
            return base_status, None
        elif base_status == 'running':
            # Only check health status if container is actually running
            health = state.get('Health', {})
            if health:
                health_status = health.get('Status', '')
                if health_status == 'healthy':
                    return 'healthy', None
                elif health_status == 'unhealthy':
                    return 'unhealthy', exit_code
                elif health_status == 'starting':
                    return 'starting', None
            # If no health check or running without health info
            return 'running', None
        
        return base_status, None
            
    except Exception as e:
        logger.warning(f"Error getting status with exit code for container {container.name}: {e}")
        return container.status, None
    
def get_all_data():
    """Return data for all Docker hosts, with Swarm support if enabled."""
    servers = discover_docker_clients()
    
    if not servers:
        return {"servers": [], "containers": []}

    all_container_data = []
    server_list_for_json = [{"name": s["name"], "status": s["status"], "order": s["order"], "url": s["url"]} for s in servers]

    for host in servers:
        if host['status'] == 'inactive':
            continue
        
        try:
            server_name = host["name"]
            client = host["client"]
            public_hostname = host["public_hostname"]
            is_docker_host = host["is_docker_host"]

            # --- Swarm support ---
            try:
                info = client.info()
                is_swarm = info.get('Swarm', {}).get('LocalNodeState', '').lower() == 'active'
            except Exception:
                is_swarm = False

            if is_swarm:
                # Swarm mode: show services/tasks as containers
                try:
                    services = client.services.list()
                    tasks = client.api.tasks()
                    nodes = {n['ID']: n for n in client.api.nodes()}
                    # Map tasks by service
                    tasks_by_service = {}
                    for t in tasks:
                        sid = t['ServiceID']
                        tasks_by_service.setdefault(sid, []).append(t)
                    for service in services:
                        s_attrs = service.attrs
                        spec = s_attrs.get('Spec', {})
                        labels = spec.get('Labels', {}) or {}
                        image_name = spec.get('TaskTemplate', {}).get('ContainerSpec', {}).get('Image', 'unknown')
                        stack_name = labels.get('com.docker.stack.namespace', '')
                        custom_url = labels.get('dockpeek.link', '')
                        custom_ports = labels.get('dockpeek.ports', '') or labels.get('dockpeek.port', '')
                        custom_tags = labels.get('dockpeek.tags', '') or labels.get('dockpeek.tag', '')
                        https_ports = labels.get('dockpeek.https', '')
                        source_url = labels.get('org.opencontainers.image.source') or labels.get('org.opencontainers.image.url', '')
                        # Parse tags
                        tags = []
                        if TAGS_ENABLE and custom_tags:
                            try:
                                tags = [tag.strip() for tag in custom_tags.split(',') if tag.strip()]
                            except:
                                tags = []
                        # Traefik routes
                        traefik_routes = []
                        if TRAEFIK_ENABLE and labels.get('traefik.enable', '').lower() != 'false':
                            for key, value in labels.items():
                                if key.startswith('traefik.http.routers.') and key.endswith('.rule'):
                                    router_name = key.split('.')[3]
                                    host_matches = re.findall(r'Host\(`([^`]+)`\)', value)
                                    for host_ in host_matches:
                                        tls_key = f'traefik.http.routers.{router_name}.tls'
                                        is_tls = labels.get(tls_key, '').lower() == 'true'
                                        entrypoints_key = f'traefik.http.routers.{router_name}.entrypoints'
                                        entrypoints = labels.get(entrypoints_key, '')
                                        is_https_entrypoint = False
                                        if entrypoints:
                                            entrypoint_list = [ep.strip().lower() for ep in entrypoints.split(',')]
                                            is_https_entrypoint = any(
                                                any(key in ep for key in ("https", "443", "secure", "ssl", "tls"))
                                                for ep in entrypoint_list
                                            )
                                        protocol = 'https' if is_tls or is_https_entrypoint else 'http'
                                        url = f"{protocol}://{host_}"
                                        path_match = re.search(r'PathPrefix\(`([^`]+)`\)', value)
                                        if path_match:
                                            url += path_match.group(1)
                                        traefik_routes.append({
                                            'router': router_name,
                                            'url': url,
                                            'rule': value,
                                            'host': host_
                                        })
                        # Ports
                        https_ports_list = []
                        if https_ports:
                            try:
                                https_ports_list = [str(port.strip()) for port in https_ports.split(',') if port.strip()]
                            except:
                                https_ports_list = []
                        port_map = []
                        custom_ports_list = []
                        if custom_ports:
                            try:
                                custom_ports_list = [str(port.strip()) for port in custom_ports.split(',') if port.strip()]
                            except:
                                custom_ports_list = []
                        # Published ports from Endpoint
                        endpoint = s_attrs.get('Endpoint', {})
                        ports = endpoint.get('Ports', [])
                        for p in ports:
                            host_port = str(p.get('PublishedPort'))
                            container_port = str(p.get('TargetPort'))
                            protocol = p.get('Protocol', 'tcp')
                            link_hostname = _get_link_hostname(public_hostname, None, is_docker_host)
                            is_https_port = (
                                container_port == "443" or
                                host_port == "443" or
                                host_port.endswith("443") or
                                host_port in https_ports_list
                            )
                            proto = "https" if is_https_port else "http"
                            if host_port == "443":
                                link = f"{proto}://{link_hostname}"
                            else:
                                link = f"{proto}://{link_hostname}:{host_port}"
                            port_map.append({
                                'container_port': f"{container_port}/{protocol}",
                                'host_port': host_port,
                                'link': link,
                                'is_custom': False
                            })
                        # Add custom ports
                        if custom_ports_list:
                            link_hostname = _get_link_hostname(public_hostname, None, is_docker_host)
                            for port in custom_ports_list:
                                is_https_port = (
                                    port == "443" or 
                                    port.endswith("443") or
                                    port in https_ports_list
                                )
                                proto = "https" if is_https_port else "http"
                                if port == "443":
                                    link = f"{proto}://{link_hostname}"
                                else:
                                    link = f"{proto}://{link_hostname}:{port}"
                                port_map.append({
                                    'container_port': '',
                                    'host_port': port,
                                    'link': link,
                                    'is_custom': True
                                })
                        # Status: summarize from tasks
                        service_tasks = tasks_by_service.get(service.id, [])
                        running = sum(1 for t in service_tasks if t['Status']['State'] == 'running')
                        total = len(service_tasks)
                        status = f"running ({running}/{total})" if total else "no-tasks"
                        exit_code = None
                        # Compose info
                        container_info = {
                            'server': server_name,
                            'name': spec.get('Name', service.name),
                            'status': status,
                            'exit_code': exit_code,
                            'image': image_name,
                            'stack': stack_name,
                            'source_url': source_url,
                            'custom_url': custom_url,
                            'ports': port_map,
                            'traefik_routes': traefik_routes,
                            'tags': tags
                        }
                        if TAGS_ENABLE:
                            container_info['tags'] = tags
                        # Update check: use image name as cache key
                        cache_key = update_checker.get_cache_key(server_name, service.name, image_name)
                        cached_update, is_cache_valid = update_checker.get_cached_result(cache_key)
                        if cached_update is not None and is_cache_valid:
                            container_info['update_available'] = cached_update
                        else:
                            # For Swarm, check local image update using the image name
                            try:
                                local_update = False
                                if image_name:
                                    local_image = client.images.get(image_name)
                                    # No container_image_id, so just skip or always False
                                    local_update = False
                                container_info['update_available'] = local_update
                            except Exception:
                                container_info['update_available'] = False
                        all_container_data.append(container_info)
                except Exception as swarm_error:
                    all_container_data.append({
                        'server': server_name,
                        'name': getattr(service, 'name', 'unknown'),
                        'status': 'swarm-error',
                        'image': 'error-loading',
                        'ports': []
                    })
                continue  # skip normal container listing if Swarm
            # --- End Swarm support ---

            # Normal container listing (non-Swarm)
            containers = client.containers.list(all=True)
            for container in containers:
                try:
                    original_image = container.attrs.get('Config', {}).get('Image', '')
                    if original_image:
                        image_name = original_image
                    else:
                        if hasattr(container, 'image') and container.image:
                            if hasattr(container.image, 'tags') and container.image.tags:
                                image_name = container.image.tags[0]
                            else:
                                image_name = container.image.id[:12] if hasattr(container.image, 'id') else "unknown"
                    # Check update cache
                    cache_key = update_checker.get_cache_key(server_name, container.name, image_name)
                    cached_update, is_cache_valid = update_checker.get_cached_result(cache_key)
                    
                    # Get status with health check information and exit codes
                    container_status, exit_code = get_container_status_with_exit_code(container)

                    # Get stack information from Docker Compose labels
                    labels = container.attrs.get('Config', {}).get('Labels', {}) or {}
                    stack_name = labels.get('com.docker.compose.project', '')
                    
                    # Get source URL from OCI labels
                    source_url = (labels.get('org.opencontainers.image.source') or 
                                labels.get('org.opencontainers.image.url', ''))                             

                    # Get custom dockpeek labels
                    https_ports = labels.get('dockpeek.https', '')
                    custom_url = labels.get('dockpeek.link', '')
                    custom_ports = labels.get('dockpeek.ports', '') or labels.get('dockpeek.port', '')
                    custom_tags = labels.get('dockpeek.tags', '') or labels.get('dockpeek.tag', '')     

                    # Parse tags
                    tags = []
                    if TAGS_ENABLE and custom_tags:
                        try:
                            tags = [tag.strip() for tag in custom_tags.split(',') if tag.strip()]
                        except:
                            tags = []

                    # Extract Traefik routes
                    traefik_routes = []
                    if TRAEFIK_ENABLE and labels.get('traefik.enable', '').lower() != 'false':
                        for key, value in labels.items():
                            if key.startswith('traefik.http.routers.') and key.endswith('.rule'):
                                router_name = key.split('.')[3]

                                # Find all hosts in the rule
                                host_matches = re.findall(r'Host\(`([^`]+)`\)', value)

                                for host_ in host_matches:
                                    # Check if this router has TLS enabled
                                    tls_key = f'traefik.http.routers.{router_name}.tls'
                                    is_tls = labels.get(tls_key, '').lower() == 'true'

                                    # Check entrypoints to determine protocol
                                    entrypoints_key = f'traefik.http.routers.{router_name}.entrypoints'
                                    entrypoints = labels.get(entrypoints_key, '')

                                    is_https_entrypoint = False
                                    if entrypoints:
                                        entrypoint_list = [ep.strip().lower() for ep in entrypoints.split(',')]
                                        is_https_entrypoint = any(
                                            any(key in ep for key in ("https", "443", "secure", "ssl", "tls"))
                                            for ep in entrypoint_list
                                        )

                                    protocol = 'https' if is_tls or is_https_entrypoint else 'http'
                                    url = f"{protocol}://{host_}"

                                    # Check for PathPrefix
                                    path_match = re.search(r'PathPrefix\(`([^`]+)`\)', value)
                                    if path_match:
                                        url += path_match.group(1)

                                    traefik_routes.append({
                                        'router': router_name,
                                        'url': url,
                                        'rule': value,
                                        'host': host_
                                    })

                                    
                    # Parse HTTPS ports
                    https_ports_list = []
                    if https_ports:
                        try:
                            https_ports_list = [str(port.strip()) for port in https_ports.split(',') if port.strip()]
                        except:
                            https_ports_list = []
                    
                    # Port information with HTTPS detection
                    ports = container.attrs['NetworkSettings']['Ports']
                    port_map = []

                    # Parse custom ports for any container with dockpeek.ports label
                    custom_ports_list = []
                    if custom_ports:
                        try:
                            custom_ports_list = [str(port.strip()) for port in custom_ports.split(',') if port.strip()]
                        except:
                            custom_ports_list = []

                    # First, add standard mapped ports (only if no custom ports or for additional ports)
                    if ports:
                        for container_port, mappings in ports.items():
                            if mappings:
                                m = mappings[0]
                                host_port = m['HostPort']
                                host_ip = m.get('HostIp', '0.0.0.0')
                                link_hostname = _get_link_hostname(public_hostname, host_ip, is_docker_host)

                                # Check if this port should use HTTPS
                                is_https_port = (
                                    container_port == "443/tcp" or 
                                    host_port == "443" or 
                                    host_port.endswith("443") or
                                    str(host_port) in https_ports_list
                                )
                                protocol = "https" if is_https_port else "http"

                                if host_port == "443":
                                    link = f"{protocol}://{link_hostname}"
                                else:
                                    link = f"{protocol}://{link_hostname}:{host_port}"

                                port_map.append({
                                    'container_port': container_port,
                                    'host_port': host_port,
                                    'link': link,
                                    'is_custom': False
                                })

                    # Then, add custom ports if label is present
                    if custom_ports_list:
                        link_hostname = _get_link_hostname(public_hostname, None, is_docker_host)

                        for port in custom_ports_list:
                            # Check if this port should use HTTPS
                            is_https_port = (
                                port == "443" or 
                                port.endswith("443") or
                                port in https_ports_list
                            )
                            protocol = "https" if is_https_port else "http"

                            if port == "443":
                                link = f"{protocol}://{link_hostname}"
                            else:
                                link = f"{protocol}://{link_hostname}:{port}"

                            port_map.append({
                                'container_port': '',
                                'host_port': port,
                                'link': link,
                                'is_custom': True
                            })
                    container_info = {
                         'server': server_name,
                         'name': container.name,
                         'status': container_status,
                         'exit_code': exit_code,
                         'image': image_name,
                         'stack': stack_name,
                         'source_url': source_url,
                         'custom_url': custom_url,
                         'ports': port_map,
                         'traefik_routes': traefik_routes,
                         'tags': tags
                    }
                    if TAGS_ENABLE:
                        container_info['tags'] = tags

                    
                    if cached_update is not None and is_cache_valid:
                        container_info['update_available'] = cached_update
                    else:
                        local_update = update_checker.check_local_image_updates(client, container, server_name)
                        container_info['update_available'] = local_update
                    
                    all_container_data.append(container_info)
                except Exception as container_error:
                    all_container_data.append({
                        'server': server_name,
                        'name': getattr(container, 'name', 'unknown'),
                        'status': getattr(container, 'status', 'unknown'),
                        'image': 'error-loading',
                        'ports': []
                    })
        except Exception as e:
            for s in server_list_for_json:
                if s["name"] == host["name"]:
                    s["status"] = "inactive"
                    break
            continue

    return {
        "servers": server_list_for_json, 
        "containers": all_container_data,
        "traefik_enabled": TRAEFIK_ENABLE
    }


# === Routes ===
@app.route("/")
def index():
    if current_user.is_authenticated:
        version = os.environ.get('VERSION', 'dev')
        return render_template("index.html", version=version)
    return redirect(url_for("login"))

@app.route("/data")
@login_required
def data():
    return jsonify(get_all_data())

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user_record = users.get(username)
        if user_record and check_password_hash(user_record["password"], password):
            login_user(User(username))
            session.permanent = True
            return redirect(url_for("index"))
        else:
            error = "Invalid credentials. Please try again."
    return render_template("login.html", error=error)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))

@app.route("/export/json")
@login_required
def export_json():
    from flask import make_response
    server_filter = request.args.get('server', 'all')
    
    data = get_all_data()
    
    filtered_servers = data.get("servers", [])
    filtered_containers = data.get("containers", [])
    
    if server_filter != 'all':
        filtered_servers = [s for s in filtered_servers if s["name"] == server_filter]
        filtered_containers = [c for c in filtered_containers if c.get("server") == server_filter]
    
    export_data = {
        "export_info": {
            "timestamp": datetime.now().isoformat(),
            "dockpeek_version": os.environ.get('VERSION', 'dev'),
            "server_filter": server_filter,
            "total_containers": len(filtered_containers),
            "total_servers": len(filtered_servers)
        },
        "servers": [
            {k: v for k, v in server.items() if k != "order"} 
            for server in filtered_servers
        ],
        "containers": []
    }
    
    for container in filtered_containers:
        ports_all = container.get("ports", [])
        ports_normalized = []

        for p in ports_all:
            if p.get("is_custom", False):
                ports_normalized.append({
                    "custom_port": p.get("host_port"),
                    "link": p.get("link"),
                })
            else:
                ports_normalized.append({
                    "container_port": p.get("container_port"),
                    "host_port": p.get("host_port"),
                    "link": p.get("link"),
                })

        enhanced_container = {
            "name": container.get("name"),
            "server": container.get("server"),
            "stack": container.get("stack"),
            "image": container.get("image"),
            "status": container.get("status"),
        }

        if ports_normalized:
            standard_ports = [
                f"{p.get('host_port')}:{p.get('container_port', '').split('/')[0]}"
                for p in ports_all if not p.get("is_custom", False)
            ]
            if standard_ports:
                enhanced_container["port_summary"] = standard_ports
            enhanced_container["ports"] = ports_normalized

        if container.get("custom_url"):
            enhanced_container["custom_url"] = container.get("custom_url")

        traefik_routes = container.get("traefik_routes", [])
        if traefik_routes:
            enhanced_container["traefik_routes"] = [
                {
                    "router": route.get("router"),
                    "url": route.get("url")
                }
                for route in traefik_routes
            ]

        if container.get("exit_code") is not None:
            enhanced_container["exit_code"] = container.get("exit_code")

        export_data["containers"].append(enhanced_container)
    
    import json
    
    formatted_json = json.dumps(export_data, indent=2, ensure_ascii=False)

    if server_filter == 'all':
        filename_suffix = 'all-servers'
    else:
        filename_suffix = f'server-{server_filter}'
    
    response = make_response(formatted_json)
    response.headers['Content-Disposition'] = f'attachment; filename=dockpeek-export-{filename_suffix}-{datetime.now().strftime("%Y%m%d-%H%M%S")}.json'
    response.headers['Content-Type'] = 'application/json'
    return response

@app.route("/check-updates", methods=["POST"])
@login_required
def check_updates():
    """Endpoint for manual container update checks"""
    request_data = request.get_json() or {}
    server_filter = request_data.get('server_filter', 'all')
    
    servers = discover_docker_clients()
    active_servers = [s for s in servers if s['status'] == 'active']
    
    if server_filter != 'all':
        active_servers = [s for s in active_servers if s['name'] == server_filter]
    
    updates = {}
    
    def check_container_update(args):
        server, container = args
        try:
            update_available = update_checker.check_image_updates_async(
                server['client'], container, server['name']
            )
            container_key = f"{server['name']}:{container.name}"
            return container_key, update_available
        except Exception as e:
            return f"{server['name']}:{container.name}", False
    
    # Collect containers from filtered servers
    check_args = []
    for server in active_servers:
        try:
            containers = server['client'].containers.list(all=True)
            for container in containers:
                check_args.append((server, container))
        except Exception as e:
            logger.error(f"❌ Error accessing containers on {server['name']} for update check")
    
    # Parallel check
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = executor.map(check_container_update, check_args)
        for container_key, update_result in results:
            if container_key:
                updates[container_key] = update_result
    
    return jsonify({"updates": updates})

# === Entry Point ===
if __name__ == "__main__":
    if not os.path.exists('templates'):
        os.makedirs('templates')
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=8000, debug=debug)