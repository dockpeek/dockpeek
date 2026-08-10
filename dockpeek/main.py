import json
from datetime import datetime
from functools import wraps

import docker
from flask import (
    Blueprint,
    Response,
    current_app,
    jsonify,
    make_response,
    render_template,
    request,
)
from flask_login import current_user, login_required

from .docker_utils import (
    DockerClientFactory,
    create_streaming_client,
    discover_docker_clients,
    get_container_status_with_exit_code,
)
from .get_data import get_all_data
from .logs_manager import (
    get_container_logs,
    get_service_logs,
    stream_container_logs,
    stream_service_logs,
)
from .update import update_checker
from .update_manager import update_container

main_bp = Blueprint("main", __name__)


def conditional_login_required(f):
    """Dekorator który wymaga logowania tylko gdy autoryzacja nie jest wyłączona."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_app.config.get("DISABLE_AUTH", False):
            return f(*args, **kwargs)
        else:
            from flask_login import current_user

            if not current_user.is_authenticated:
                return current_app.login_manager.unauthorized()
            return f(*args, **kwargs)

    return decorated_function


@main_bp.route("/")
@conditional_login_required
def index():
    version = current_app.config["APP_VERSION"]
    return render_template("index.html", version=version)


@main_bp.route("/health")
def health():
    return (
        jsonify(
            {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "version": current_app.config["APP_VERSION"],
            }
        ),
        200,
    )


@main_bp.route("/config/registry-templates")
def get_registry_templates():
    """Expose CUSTOM_REGISTRY_TEMPLATES from config for frontend use."""
    from flask import current_app, jsonify

    return jsonify(current_app.config.get("CUSTOM_REGISTRY_TEMPLATES", {}))


@main_bp.route("/data")
@conditional_login_required
def data():
    return jsonify(get_all_data())


@main_bp.route("/check-updates", methods=["POST"])
@conditional_login_required
def check_updates():
    update_checker.start_check()
    request_data = request.get_json() or {}
    server_filter = request_data.get("server_filter", "all")

    servers = discover_docker_clients()
    active_servers = [s for s in servers if s["status"] == "active"]

    if server_filter != "all":
        active_servers = [s for s in active_servers if s["name"] == server_filter]

    updates = {}
    was_cancelled = False
    total_containers = 0
    processed_containers = 0

    for server in active_servers:
        try:
            containers = server["client"].containers.list(all=True)
            total_containers += len(containers)
        except Exception:
            pass
    for server in active_servers:
        if update_checker.is_cancelled:
            was_cancelled = True
            break

        try:
            containers = server["client"].containers.list(all=True)
            for container in containers:
                if update_checker.is_cancelled:
                    was_cancelled = True
                    break

                processed_containers += 1
                key = f"{server['name']}:{container.name}"
                try:
                    update_available = update_checker.check_image_updates(
                        server["client"], container, server["name"]
                    )
                    updates[key] = update_available
                except Exception as e:
                    updates[key] = False
                    current_app.logger.error(
                        f"Error during update check for {key}: {e}"
                    )

                if update_checker.is_cancelled:
                    was_cancelled = True
                    break

        except Exception as e:
            current_app.logger.error(
                f"Error accessing containers on {server['name']}: {e}"
            )

        if was_cancelled:
            break

    return jsonify(
        {
            "updates": updates,
            "cancelled": was_cancelled,
            "progress": {"processed": processed_containers, "total": total_containers},
        }
    )


@main_bp.route("/check-single-update", methods=["POST"])
@conditional_login_required
def check_single_update():
    update_checker.start_check()
    request_data = request.get_json() or {}
    server_name = request_data.get("server_name")
    container_name = request_data.get("container_name")

    if not server_name or not container_name:
        return jsonify({"error": "Missing server_name or container_name"}), 400

    if update_checker.is_cancelled:
        return jsonify({"cancelled": True}), 200

    servers = discover_docker_clients()
    server = next(
        (s for s in servers if s["name"] == server_name and s["status"] == "active"),
        None,
    )

    if not server:
        return jsonify({"error": f"Server {server_name} not found or inactive"}), 404

    try:
        # Detect if this is a Swarm service
        is_swarm = False
        try:
            info = server["client"].info()
            is_swarm = (
                info.get("Swarm", {}).get("LocalNodeState", "").lower() == "active"
            )
        except Exception:
            pass

        # Block update checks for Swarm
        if is_swarm:
            current_app.logger.info(
                f"[{server_name}] Container '{container_name}' is part of a Swarm service — update check skipped."
            )
            key = f"{server_name}:{container_name}"
            return (
                jsonify(
                    {
                        "key": key,
                        "update_available": False,
                        "server_name": server_name,
                        "container_name": container_name,
                        "cancelled": False,
                    }
                ),
                200,
            )

        container = server["client"].containers.get(container_name)

        if update_checker.is_cancelled:
            return jsonify({"cancelled": True}), 200

        update_available = update_checker.check_image_updates(
            server["client"], container, server_name
        )

        key = f"{server_name}:{container_name}"
        return jsonify(
            {
                "key": key,
                "update_available": update_available,
                "server_name": server_name,
                "container_name": container_name,
                "cancelled": update_checker.is_cancelled,
            }
        )

    except Exception as e:
        current_app.logger.error(
            f"Error checking update for {server_name}:{container_name}: {e}"
        )
        return jsonify({"error": str(e)}), 500


@main_bp.route("/get-containers-list", methods=["POST"])
@conditional_login_required
def get_containers_list():
    request_data = request.get_json() or {}
    server_filter = request_data.get("server_filter", "all")

    servers = discover_docker_clients()
    active_servers = [s for s in servers if s["status"] == "active"]

    if server_filter != "all":
        active_servers = [s for s in active_servers if s["name"] == server_filter]

    containers_list = []

    for server in active_servers:
        try:
            for container in server["client"].containers.list(all=True):
                containers_list.append(
                    {
                        "server_name": server["name"],
                        "container_name": container.name,
                        "key": f"{server['name']}:{container.name}",
                        "image": container.attrs.get("Config", {}).get("Image", ""),
                        "status": container.status,
                    }
                )
        except Exception as e:
            current_app.logger.error(
                f"Error accessing containers on {server['name']}: {e}"
            )

    return jsonify({"containers": containers_list, "total": len(containers_list)})


@main_bp.route("/update-check-status", methods=["GET"])
@conditional_login_required
def get_update_check_status():
    return jsonify(
        {
            "is_cancelled": update_checker.is_cancelled,
            "cache_stats": update_checker.get_cache_stats(),
        }
    )


@main_bp.route("/cancel-updates", methods=["POST"])
@conditional_login_required
def cancel_updates():
    update_checker.cancel_check()
    current_app.logger.info("Cancellation request received.")
    return jsonify({"status": "cancellation_requested"})


@main_bp.route("/check-dependent-containers", methods=["POST"])
@conditional_login_required
def check_dependent_containers():
    data = request.get_json()
    server_name = data.get("server_name")
    container_name = data.get("container_name")

    if not server_name or not container_name:
        return jsonify({"error": "Missing server_name or container_name"}), 400

    servers = discover_docker_clients()
    server = next(
        (s for s in servers if s["name"] == server_name and s["status"] == "active"),
        None,
    )

    if not server:
        return jsonify({"error": f"Server '{server_name}' not found or inactive"}), 404

    try:
        container = server["client"].containers.get(container_name)
        dependent = []
        all_containers = server["client"].containers.list(all=True)
        for other in all_containers:
            if other.id == container.id:
                continue
            network_mode = other.attrs.get("HostConfig", {}).get("NetworkMode", "")
            if network_mode in [
                f"container:{container.name}",
                f"container:{container.id}",
            ]:
                dependent.append(other.name)

        return jsonify({"dependent_containers": dependent}), 200
    except Exception as e:
        current_app.logger.error(f"Error checking dependent containers: {e}")
        return jsonify({"dependent_containers": [], "error": str(e)}), 200


@main_bp.route("/update-container", methods=["POST"])
@conditional_login_required
def update_container_route():
    data = request.get_json()
    server_name = data.get("server_name")
    container_name = data.get("container_name")

    if not server_name or not container_name:
        return jsonify({"error": "Missing server_name or container_name"}), 400

    servers = discover_docker_clients()
    server = next(
        (s for s in servers if s["name"] == server_name and s["status"] == "active"),
        None,
    )

    if not server:
        return jsonify({"error": f"Server '{server_name}' not found or inactive"}), 404

    try:
        result = update_container(server["client"], server_name, container_name)
        return jsonify(result), 200
    except Exception as e:
        if hasattr(e, "html_message"):
            current_app.logger.error(f"Update error for {container_name}: {str(e)}")
            return jsonify({"error": e.html_message}), 500
        else:
            current_app.logger.error(f"Update error for {container_name}: {str(e)}")
            return jsonify({"error": str(e)}), 500


def parse_image_name(image_name):
    if ":" in image_name:
        base_name, tag = image_name.rsplit(":", 1)
    else:
        base_name, tag = image_name, "latest"
    return base_name, tag


def get_image_creation_time(image):
    created_str = image.attrs.get("Created", "")
    if created_str:
        try:
            return datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except:
            pass
    return None


@main_bp.route("/get-prune-info", methods=["POST"])
@conditional_login_required
def get_prune_info():
    request_data = request.get_json() or {}
    server_name = request_data.get("server_name", "all")

    servers = discover_docker_clients()
    active_servers = [s for s in servers if s["status"] == "active"]

    if server_name != "all":
        active_servers = [s for s in active_servers if s["name"] == server_name]

    total_size = 0
    total_count = 0
    server_details = []

    for server in active_servers:
        try:
            all_images = server["client"].images.list()
            used_images = set()
            container_images_info = {}

            for container in server["client"].containers.list(all=True):
                image_id = container.image.id
                used_images.add(image_id)

                image_name = container.attrs.get("Config", {}).get("Image", "")
                if image_name:
                    base_name, tag = parse_image_name(image_name)
                    key = f"{base_name}:{tag}"
                    creation_time = get_image_creation_time(container.image)

                    if key not in container_images_info or (
                        creation_time
                        and container_images_info[key]["created"]
                        and creation_time > container_images_info[key]["created"]
                    ):
                        container_images_info[key] = {
                            "id": image_id,
                            "created": creation_time,
                        }

            unused_images = []
            unused_size = 0

            for image in all_images:
                if image.id not in used_images:
                    size = image.attrs.get("Size", 0)

                    if image.tags:
                        tags = image.tags
                    else:
                        repo_tags = image.attrs.get("RepoTags", [])
                        if repo_tags and len(repo_tags) > 0:
                            tags = [repo_tags[0]]
                        else:
                            repo_digests = image.attrs.get("RepoDigests", [])
                            if repo_digests and len(repo_digests) > 0:
                                repo_name = repo_digests[0].split("@")[0]
                                tags = [f"{repo_name}:<none>"]
                            else:
                                tags = ["<none>:<none>"]

                    pending_update = False
                    image_created = get_image_creation_time(image)

                    for tag in tags:
                        if tag != "<none>:<none>":
                            if tag in container_images_info:
                                used_image_info = container_images_info[tag]
                                if image_created and used_image_info["created"]:
                                    if image_created > used_image_info["created"]:
                                        pending_update = True
                                        break

                    unused_images.append(
                        {
                            "id": image.id,
                            "tags": tags,
                            "size": size,
                            "pending_update": pending_update,
                        }
                    )

                    if not pending_update:
                        unused_size += size

            if unused_images:
                count = sum(1 for img in unused_images if not img["pending_update"])
                total_count += count
                total_size += unused_size

                server_details.append(
                    {
                        "server": server["name"],
                        "count": count,
                        "size": unused_size,
                        "images": unused_images,
                    }
                )

        except Exception as e:
            current_app.logger.error(
                f"Error getting prune info for {server['name']}: {e}"
            )

    return jsonify(
        {
            "total_count": total_count,
            "total_size": total_size,
            "servers": server_details,
        }
    )


@main_bp.route("/prune-images", methods=["POST"])
@conditional_login_required
def prune_images():
    request_data = request.get_json() or {}
    server_name = request_data.get("server_name", "all")

    servers = discover_docker_clients()
    active_servers = [s for s in servers if s["status"] == "active"]

    if server_name != "all":
        active_servers = [s for s in active_servers if s["name"] == server_name]

    total_size = 0
    total_count = 0
    server_results = []

    for server in active_servers:
        try:
            all_images = server["client"].images.list()
            used_images = set()
            container_images_info = {}

            for container in server["client"].containers.list(all=True):
                image_id = container.image.id
                used_images.add(image_id)

                image_name = container.attrs.get("Config", {}).get("Image", "")
                if image_name:
                    base_name, tag = parse_image_name(image_name)
                    key = f"{base_name}:{tag}"
                    creation_time = get_image_creation_time(container.image)

                    if key not in container_images_info or (
                        creation_time
                        and container_images_info[key]["created"]
                        and creation_time > container_images_info[key]["created"]
                    ):
                        container_images_info[key] = {
                            "id": image_id,
                            "created": creation_time,
                        }

            removed_count = 0
            removed_size = 0

            for image in all_images:
                if image.id not in used_images:
                    pending_update = False
                    image_created = get_image_creation_time(image)

                    tags = image.tags if image.tags else []
                    for tag in tags:
                        if tag != "<none>:<none>":
                            if tag in container_images_info:
                                used_image_info = container_images_info[tag]
                                if image_created and used_image_info["created"]:
                                    if image_created > used_image_info["created"]:
                                        pending_update = True
                                        break

                    if not pending_update:
                        try:
                            size = image.attrs.get("Size", 0)
                            long_client = docker.DockerClient(
                                base_url=server["url"], timeout=60
                            )
                            long_client.images.remove(image.id, force=True)
                            long_client.close()
                            removed_count += 1
                            removed_size += size
                        except Exception as e:
                            current_app.logger.warning(
                                f"Could not remove image {image.id}: {e}"
                            )

            total_count += removed_count
            total_size += removed_size

            if removed_count > 0:
                server_results.append(
                    {
                        "server": server["name"],
                        "count": removed_count,
                        "size": removed_size,
                    }
                )

            current_app.logger.info(
                f"Pruned {removed_count} images from {server['name']}, reclaimed {removed_size} bytes"
            )

        except Exception as e:
            current_app.logger.error(f"Error pruning images on {server['name']}: {e}")
            return (
                jsonify({"error": f"Failed to prune on {server['name']}: {str(e)}"}),
                500,
            )

    return jsonify(
        {
            "total_count": total_count,
            "total_size": total_size,
            "servers": server_results,
        }
    )


@main_bp.route("/get-container-logs", methods=["POST"])
@conditional_login_required
def get_logs():
    request_data = request.get_json() or {}
    server_name = request_data.get("server_name")
    container_name = request_data.get("container_name")
    tail = request_data.get("tail", 500)
    is_swarm = request_data.get("is_swarm", False)

    if not server_name or not container_name:
        return jsonify({"error": "Missing server_name or container_name"}), 400

    servers = discover_docker_clients()
    server = next(
        (s for s in servers if s["name"] == server_name and s["status"] == "active"),
        None,
    )

    if not server:
        return jsonify({"error": f"Server {server_name} not found or inactive"}), 404

    if is_swarm:
        result = get_service_logs(
            server["client"], container_name, tail=tail, timestamps=True, follow=False
        )
    else:
        result = get_container_logs(
            server["client"], container_name, tail=tail, timestamps=True, follow=False
        )

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 500


@main_bp.route("/stream-container-logs", methods=["POST"])
@conditional_login_required
def stream_logs():
    import time

    import gevent
    from gevent.queue import Empty, Queue

    request_data = request.get_json() or {}
    server_name = request_data.get("server_name")
    container_name = request_data.get("container_name")
    tail = request_data.get("tail", 100)
    is_swarm = request_data.get("is_swarm", False)

    if not server_name or not container_name:
        return jsonify({"error": "Missing server_name or container_name"}), 400

    servers = discover_docker_clients()
    server = next(
        (s for s in servers if s["name"] == server_name and s["status"] == "active"),
        None,
    )

    if not server:
        return jsonify({"error": f"Server {server_name} not found or inactive"}), 404

    stream_client = create_streaming_client(server["url"])
    logger = current_app.logger

    def generate():
        queue = Queue()
        stop_flag = [False]
        heartbeat_interval = 20
        last_yield = time.time()

        def log_reader():
            try:
                if is_swarm:
                    stream_func = stream_service_logs
                else:
                    stream_func = stream_container_logs

                for log_line in stream_func(stream_client, container_name, tail):
                    if stop_flag[0]:
                        break
                    queue.put(("log", log_line))

                queue.put(("end", None))
            except Exception as e:
                queue.put(("error", str(e)))

        reader_greenlet = gevent.spawn(log_reader)

        try:
            while True:
                try:
                    msg_type, data = queue.get(timeout=1)

                    if msg_type == "log":
                        last_yield = time.time()
                        yield json.dumps({"line": data}) + "\n"
                    elif msg_type == "end":
                        break
                    elif msg_type == "error":
                        logger.error(f"Stream error: {data}")
                        yield json.dumps({"error": data}) + "\n"
                        break

                except Empty:
                    current_time = time.time()
                    if current_time - last_yield >= heartbeat_interval:
                        last_yield = current_time
                        yield json.dumps({"heartbeat": True}) + "\n"

        except GeneratorExit:
            logger.debug(f"Stream closed for {container_name}")
            stop_flag[0] = True
            raise
        finally:
            stop_flag[0] = True
            reader_greenlet.kill()
            try:
                stream_client.close()
            except:
                pass

    response = Response(
        generate(),
        mimetype="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
    response.timeout = None
    return response


@main_bp.route("/export/json")
@conditional_login_required
def export_json():
    server_filter = request.args.get("server", "all")
    data = get_all_data()

    filtered_containers = data.get("containers", [])
    if server_filter != "all":
        filtered_containers = [
            c for c in filtered_containers if c.get("server") == server_filter
        ]

    export_data = {
        "export_info": {
            "timestamp": datetime.now().isoformat(),
            "dockpeek_version": current_app.config["APP_VERSION"],
            "server_filter": server_filter,
            "total_containers": len(filtered_containers),
        },
        "containers": [],
    }
    for c in filtered_containers:
        export_container = {
            k: v
            for k, v in c.items()
            if k
            in ["name", "server", "stack", "image", "status", "exit_code", "custom_url"]
        }
        if c.get("ports"):
            export_container["ports"] = c["ports"]
        if c.get("traefik_routes"):
            export_container["traefik_routes"] = [
                {"router": r["router"], "url": r["url"]} for r in c["traefik_routes"]
            ]
        export_data["containers"].append(export_container)

    formatted_json = json.dumps(export_data, indent=2, ensure_ascii=False)
    filename = f'dockpeek-export-{server_filter}-{datetime.now().strftime("%Y%m%d-%H%M%S")}.json'

    response = make_response(formatted_json)
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    response.headers["Content-Type"] = "application/json"
    return response


@main_bp.route("/status")
@conditional_login_required
def get_status():
    def get_swarm_task_container_ids(tasks):
        container_ids = set()
        for task in tasks:
            container_id = (
                task.get("Status", {}).get("ContainerStatus", {}).get("ContainerID")
            )
            if container_id:
                container_ids.add(container_id)
        return container_ids

    servers = discover_docker_clients()
    statuses = []

    for server in servers:
        if server["status"] != "active":
            continue

        try:
            client = server["client"]
            info = client.info()
            is_swarm = (
                info.get("Swarm", {}).get("LocalNodeState", "").lower() == "active"
            )

            if is_swarm:
                services = client.services.list()
                tasks = client.api.tasks()
                swarm_task_container_ids = get_swarm_task_container_ids(tasks)
                tasks_by_service = {}
                for t in tasks:
                    sid = t["ServiceID"]
                    tasks_by_service.setdefault(sid, []).append(t)

                for service in services:
                    service_tasks = tasks_by_service.get(service.id, [])
                    running = sum(
                        1 for t in service_tasks if t["Status"]["State"] == "running"
                    )
                    total = len(service_tasks)
                    status = f"running ({running}/{total})" if total else "no-tasks"

                    statuses.append(
                        {
                            "server": server["name"],
                            "name": service.name,
                            "status": status,
                            "exit_code": None,
                            "started_at": None,
                        }
                    )

                containers = client.containers.list(all=True)
                for container in containers:
                    if container.id in swarm_task_container_ids:
                        continue

                    container_status, exit_code = get_container_status_with_exit_code(
                        container
                    )
                    start_time = container.attrs.get("State", {}).get("StartedAt", "")

                    statuses.append(
                        {
                            "server": server["name"],
                            "name": container.name,
                            "status": container_status,
                            "exit_code": exit_code,
                            "started_at": start_time,
                        }
                    )
            else:
                containers = client.containers.list(all=True)
                for container in containers:
                    container_status, exit_code = get_container_status_with_exit_code(
                        container
                    )
                    start_time = container.attrs.get("State", {}).get("StartedAt", "")

                    statuses.append(
                        {
                            "server": server["name"],
                            "name": container.name,
                            "status": container_status,
                            "exit_code": exit_code,
                            "started_at": start_time,
                        }
                    )
        except Exception as e:
            current_app.logger.error(f"Error getting status from {server['name']}: {e}")

    return jsonify({"statuses": statuses})
