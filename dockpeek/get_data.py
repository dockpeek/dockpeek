import re
import logging
from flask import current_app
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from .docker_utils import discover_docker_clients, get_container_status_with_exit_code, _get_link_hostname
from .update import update_checker

logger = logging.getLogger(__name__)


def parse_comma_separated(value):
    if not value:
        return []
    try:
        return [item.strip() for item in value.split(',') if item.strip()]
    except:
        return []


def extract_traefik_routes(labels, traefik_enabled):
    if not traefik_enabled or labels.get('traefik.enable', '').lower() == 'false':
        return []
    
    routes = []
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
                
                routes.append({
                    'router': router_name,
                    'url': url,
                    'rule': value,
                    'host': host_
                })
    
    return routes


def should_use_https(port_str, container_port, https_ports_list):
    return (
        container_port == "443/tcp" or
        port_str == "443" or
        port_str.endswith("443") or
        port_str in https_ports_list
    )


def create_port_link(port, https_ports_list, link_hostname, container_port=""):
    is_https = should_use_https(port, container_port, https_ports_list)
    protocol = "https" if is_https else "http"
    
    if port == "443":
        return f"{protocol}://{link_hostname}"
    else:
        return f"{protocol}://{link_hostname}:{port}"


def build_port_map(published_ports, custom_ports_list, https_ports_list, public_hostname, host_ip, is_docker_host):
    port_map = []
    
    for container_port, host_port, protocol in published_ports:
        link_hostname = _get_link_hostname(public_hostname, host_ip, is_docker_host)
        link = create_port_link(host_port, https_ports_list, link_hostname, container_port)
        
        port_map.append({
            'container_port': container_port,
            'host_port': host_port,
            'link': link,
            'is_custom': False
        })
    
    if custom_ports_list:
        link_hostname = _get_link_hostname(public_hostname, None, is_docker_host)
        for port in custom_ports_list:
            link = create_port_link(port, https_ports_list, link_hostname)
            port_map.append({
                'container_port': '',
                'host_port': port,
                'link': link,
                'is_custom': True
            })
    
    return port_map


def extract_swarm_service_ports(service_attrs):
    published_ports = []
    endpoint = service_attrs.get('Endpoint', {})
    ports = endpoint.get('Ports', [])
    
    for p in ports:
        host_port = str(p.get('PublishedPort'))
        container_port = str(p.get('TargetPort'))
        protocol = p.get('Protocol', 'tcp')
        published_ports.append((f"{container_port}/{protocol}", host_port, protocol))
    
    return published_ports


def extract_container_ports(container_attrs):
    published_ports = []
    ports = container_attrs['NetworkSettings']['Ports']
    
    if ports:
        for container_port, mappings in ports.items():
            if mappings:
                m = mappings[0]
                host_port = m['HostPort']
                host_ip = m.get('HostIp', '0.0.0.0')
                published_ports.append((container_port, host_port, host_ip))
    
    return published_ports


def extract_labels_data(labels, tags_enable):
    stack_name = labels.get('com.docker.compose.project', '') or labels.get('com.docker.stack.namespace', '')
    source_url = labels.get('org.opencontainers.image.source') or labels.get('org.opencontainers.image.url', '')
    custom_url = labels.get('dockpeek.link', '')
    custom_ports = labels.get('dockpeek.ports', '') or labels.get('dockpeek.port', '')
    custom_tags = labels.get('dockpeek.tags', '') or labels.get('dockpeek.tag', '')
    https_ports = labels.get('dockpeek.https', '')
    port_range_grouping = labels.get('dockpeek.port-range-grouping', '')
    
    tags = []
    if tags_enable and custom_tags:
        tags = parse_comma_separated(custom_tags)
    
    return {
        'stack_name': stack_name,
        'source_url': source_url,
        'custom_url': custom_url,
        'custom_ports_list': parse_comma_separated(custom_ports),
        'https_ports_list': parse_comma_separated(https_ports),
        'port_range_grouping': port_range_grouping.lower() if port_range_grouping else None,
        'tags': tags
    }


def get_or_check_update(cache_key, client, container_or_service, server_name, image_name, is_swarm):
    cached_update, is_cache_valid = update_checker.get_cached_result(cache_key)
    
    if cached_update is not None and is_cache_valid:
        return cached_update
    
    if is_swarm:
        return False
    else:
        return update_checker.check_local_image_updates(client, container_or_service, server_name)


def process_swarm_service(service, tasks_by_service, client, server_name, public_hostname, is_docker_host, traefik_enabled, tags_enable, port_range_grouping_enabled):
    try:
        s_attrs = service.attrs
        spec = s_attrs.get('Spec', {})
        labels = spec.get('Labels', {}) or {}
        image_name = spec.get('TaskTemplate', {}).get('ContainerSpec', {}).get('Image', 'unknown')
        
        labels_data = extract_labels_data(labels, tags_enable)
        traefik_routes = extract_traefik_routes(labels, traefik_enabled)
        published_ports = extract_swarm_service_ports(s_attrs)
        port_map = build_port_map(
            published_ports,
            labels_data['custom_ports_list'],
            labels_data['https_ports_list'],
            public_hostname,
            None,
            is_docker_host
        )
        
        # Determine if port range grouping should be enabled for this container
        container_port_range_grouping = labels_data['port_range_grouping']
        if container_port_range_grouping is None:
            # Use global setting if not specified per container
            port_range_grouping = port_range_grouping_enabled
        else:
            # Use per-container setting
            port_range_grouping = container_port_range_grouping == 'true'
        
        service_tasks = tasks_by_service.get(service.id, [])
        running = sum(1 for t in service_tasks if t['Status']['State'] == 'running')
        total = len(service_tasks)
        status = f"running ({running}/{total})" if total else "no-tasks"
        
        cache_key = update_checker.get_cache_key(server_name, service.name, image_name)
        update_available = get_or_check_update(cache_key, client, service, server_name, image_name, True)
        
        container_info = {
            'server': server_name,
            'name': spec.get('Name', service.name),
            'status': status,
            'exit_code': None,
            'image': image_name,
            'stack': labels_data['stack_name'],
            'source_url': labels_data['source_url'],
            'custom_url': labels_data['custom_url'],
            'ports': port_map,
            'traefik_routes': traefik_routes,
            'tags': labels_data['tags'],
            'update_available': update_available,
            'port_range_grouping': port_range_grouping
        }
        
        return container_info
    except Exception:
        return {
            'server': server_name,
            'name': getattr(service, 'name', 'unknown'),
            'status': 'swarm-error',
            'image': 'error-loading',
            'ports': []
        }


def process_container(container, client, server_name, public_hostname, is_docker_host, traefik_enabled, tags_enable, port_range_grouping_enabled):
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
        
        container_status, exit_code = get_container_status_with_exit_code(container)
        start_time = container.attrs.get('State', {}).get('StartedAt', '')
        
        labels = container.attrs.get('Config', {}).get('Labels', {}) or {}
        labels_data = extract_labels_data(labels, tags_enable)
        traefik_routes = extract_traefik_routes(labels, traefik_enabled)
        
        published_ports_data = extract_container_ports(container.attrs)
        published_ports = [(cp, hp, None) for cp, hp, hi in published_ports_data]
        host_ips = {cp: hi for cp, hp, hi in published_ports_data}
        
        port_map = []
        for container_port, host_port, _ in published_ports:
            host_ip = host_ips.get(container_port, '0.0.0.0')
            link_hostname = _get_link_hostname(public_hostname, host_ip, is_docker_host)
            link = create_port_link(host_port, labels_data['https_ports_list'], link_hostname, container_port)
            port_map.append({
                'container_port': container_port,
                'host_port': host_port,
                'link': link,
                'is_custom': False
            })
        
        if labels_data['custom_ports_list']:
            link_hostname = _get_link_hostname(public_hostname, None, is_docker_host)
            for port in labels_data['custom_ports_list']:
                link = create_port_link(port, labels_data['https_ports_list'], link_hostname)
                port_map.append({
                    'container_port': '',
                    'host_port': port,
                    'link': link,
                    'is_custom': True
                })
        
        # Determine if port range grouping should be enabled for this container
        container_port_range_grouping = labels_data['port_range_grouping']
        if container_port_range_grouping is None:
            # Use global setting if not specified per container
            port_range_grouping = port_range_grouping_enabled
        else:
            # Use per-container setting
            port_range_grouping = container_port_range_grouping == 'true'
        
        cache_key = update_checker.get_cache_key(server_name, container.name, image_name)
        update_available = get_or_check_update(cache_key, client, container, server_name, image_name, False)
        
        container_info = {
            'server': server_name,
            'name': container.name,
            'status': container_status,
            'started_at': start_time,
            'exit_code': exit_code,
            'image': image_name,
            'stack': labels_data['stack_name'],
            'source_url': labels_data['source_url'],
            'custom_url': labels_data['custom_url'],
            'ports': port_map,
            'traefik_routes': traefik_routes,
            'tags': labels_data['tags'],
            'update_available': update_available,
            'port_range_grouping': port_range_grouping
        }
                
        return container_info
    except Exception as e:
        logger.warning(f"Error processing container {getattr(container, 'name', 'unknown')}: {e}")
        return {
            'server': server_name,
            'name': getattr(container, 'name', 'unknown'),
            'status': 'error',
            'image': 'error-loading',
            'ports': []
        }
    
def process_single_host_data(host, traefik_enabled, tags_enable, port_range_grouping_enabled):
    if host['status'] == 'inactive':
        return []
    
    container_data = []
    
    try:
        server_name = host["name"]
        client = host["client"]
        public_hostname = host["public_hostname"]
        is_docker_host = host["is_docker_host"]

        try:
            info = client.info()
            is_swarm = info.get('Swarm', {}).get('LocalNodeState', '').lower() == 'active'
        except Exception:
            is_swarm = False

        if is_swarm:
            try:
                services = client.services.list()
                tasks = client.api.tasks()
                
                tasks_by_service = {}
                for t in tasks:
                    sid = t['ServiceID']
                    tasks_by_service.setdefault(sid, []).append(t)
                
                for service in services:
                    container_info = process_swarm_service(
                        service, tasks_by_service, client, server_name,
                        public_hostname, is_docker_host, traefik_enabled, tags_enable, port_range_grouping_enabled
                    )
                    container_data.append(container_info)
            except Exception as swarm_error:
                logger.error(f"Swarm error on {server_name}: {swarm_error}")
                container_data.append({
                    'server': server_name,
                    'name': 'unknown',
                    'status': 'swarm-error',
                    'image': 'error-loading',
                    'ports': []
                })
            return container_data

        try:
            containers = client.containers.list(all=True)
        except Exception as list_error:
            logger.error(f"Failed to list containers on {server_name}: {list_error}")
            return [{
                'server': server_name,
                'name': 'error',
                'status': 'list-error',
                'image': 'error-loading',
                'ports': []
            }]
        
        for container in containers:
            try:
                container_info = process_container(
                    container, client, server_name, public_hostname,
                    is_docker_host, traefik_enabled, tags_enable, port_range_grouping_enabled
                )
                container_data.append(container_info)
            except Exception as container_error:
                logger.warning(f"Error processing container {getattr(container, 'name', 'unknown')} on {server_name}: {container_error}")
                container_data.append({
                    'server': server_name,
                    'name': getattr(container, 'name', 'unknown'),
                    'status': 'processing-error',
                    'image': 'error-loading',
                    'ports': []
                })
                
    except Exception as e:
        logger.error(f"Error processing host {host.get('name', 'unknown')}: {e}")
        return [{
            'server': host.get('name', 'unknown'),
            'name': 'error',
            'status': 'host-error',
            'image': 'error-loading',
            'ports': []
        }]
    
    return container_data

def get_all_data():
    servers = discover_docker_clients()
    
    TRAEFIK_ENABLE = current_app.config['TRAEFIK_ENABLE']
    TAGS_ENABLE = current_app.config['TAGS_ENABLE']
    PORT_RANGE_GROUPING = current_app.config['PORT_RANGE_GROUPING']
    PORT_RANGE_THRESHOLD = current_app.config['PORT_RANGE_THRESHOLD']
    
    if not servers:
        return {"servers": [], "containers": [], "swarm_servers": []}

    all_container_data = []
    swarm_servers = []
    server_list_for_json = [{"name": s["name"], "status": s["status"], "order": s["order"], "url": s["url"]} for s in servers]

    HOST_PROCESSING_TIMEOUT = 30.0
    
    with ThreadPoolExecutor(max_workers=len(servers)) as executor:
        future_to_host = {
            executor.submit(process_single_host_data, host, TRAEFIK_ENABLE, TAGS_ENABLE, PORT_RANGE_GROUPING): host 
            for host in servers
        }
        
        for future in future_to_host:
            host = future_to_host[future]
            try:
                host_containers = future.result(timeout=HOST_PROCESSING_TIMEOUT)
                all_container_data.extend(host_containers)
                
                if host['status'] != 'inactive':
                    try:
                        client = host["client"]
                        info = client.info()
                        is_swarm = info.get('Swarm', {}).get('LocalNodeState', '').lower() == 'active'
                        if is_swarm:
                            swarm_servers.append(host["name"])
                    except:
                        pass
                        
            except FuturesTimeoutError:
                logger.error(f"Timeout processing host {host['name']} after {HOST_PROCESSING_TIMEOUT}s")
                for s in server_list_for_json:
                    if s["name"] == host["name"]:
                        s["status"] = "inactive"
                        break
                all_container_data.append({
                    'server': host["name"],
                    'name': 'timeout',
                    'status': 'host-timeout',
                    'image': 'timeout-error',
                    'ports': []
                })
            except Exception as e:
                logger.error(f"Error processing host {host['name']}: {e}")
                for s in server_list_for_json:
                    if s["name"] == host["name"]:
                        s["status"] = "inactive"
                        break

    return {
        "servers": server_list_for_json, 
        "containers": all_container_data,
        "traefik_enabled": TRAEFIK_ENABLE,
        "port_range_grouping_enabled": PORT_RANGE_GROUPING,
        "port_range_threshold": PORT_RANGE_THRESHOLD,
        "swarm_servers": swarm_servers
    }