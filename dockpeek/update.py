import os
import logging
from datetime import datetime, timedelta
from threading import Lock
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

logger = logging.getLogger(__name__)


class CancellationToken:
    def __init__(self):
        self._cancelled = False
        self._lock = Lock()
    
    def cancel(self):
        with self._lock:
            self._cancelled = True
    
    def reset(self):
        with self._lock:
            self._cancelled = False
    
    def is_cancelled(self):
        with self._lock:
            return self._cancelled


class UpdateCache:
    def __init__(self, duration_seconds=120):
        self._cache = {}
        self._lock = Lock()
        self._duration = duration_seconds
    
    def get(self, key):
        with self._lock:
            if key in self._cache:
                result, timestamp = self._cache[key]
                if datetime.now() - timestamp < timedelta(seconds=self._duration):
                    return result, True
            return None, False
    
    def set(self, key, value):
        with self._lock:
            self._cache[key] = (value, datetime.now())
    
    def clear(self):
        with self._lock:
            self._cache.clear()
    
    def prune_expired(self):
        with self._lock:
            now = datetime.now()
            expired_keys = [
                key for key, (_, timestamp) in self._cache.items()
                if now - timestamp >= timedelta(seconds=self._duration)
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)
    
    def get_stats(self):
        with self._lock:
            total = len(self._cache)
            now = datetime.now()
            valid = sum(
                1 for _, timestamp in self._cache.values()
                if now - timestamp < timedelta(seconds=self._duration)
            )
            return {
                "total_entries": total,
                "valid_entries": valid,
                "expired_entries": total - valid,
                "cache_duration_seconds": self._duration
            }


class UpdateChecker:
    def __init__(self):
        self._cache = UpdateCache(duration_seconds=120)
        self._cancellation = CancellationToken()
        self._pull_timeout = 300
        self._executor = ThreadPoolExecutor(max_workers=2)
        self._floating_tag_mode = os.getenv('UPDATE_FLOATING_TAGS', 'disabled').lower()
    
    def _resolve_floating_tag(self, current_tag: str, labels: dict = None) -> str:
        if labels and 'dockpeek.update-tag' in labels:
            return labels['dockpeek.update-tag'] or 'latest'

        if self._floating_tag_mode == 'disabled' or current_tag == 'latest':
            return current_tag

        if self._floating_tag_mode == 'latest':
            return 'latest'

        version_part = current_tag.split('-')[0]
        suffix = '-' + '-'.join(current_tag.split('-')[1:]) if '-' in current_tag else ''

        if self._floating_tag_mode == 'major':
            parts = version_part.split('.')
            if len(parts) >= 1 and parts[0].isdigit():
                return f"{parts[0]}{suffix}"
            return current_tag

        if self._floating_tag_mode == 'minor':
            parts = version_part.split('.')
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                return f"{parts[0]}.{parts[1]}{suffix}"
            return current_tag

        return current_tag
        
    @property
    def is_cancelled(self):
        return self._cancellation.is_cancelled()
    
    @property
    def cache_duration(self):
        return self._cache._duration
        
    def start_check(self):
        self._cancellation.reset()
        logger.debug("Update check started")

    def cancel_check(self):
        self._cancellation.cancel()
        logger.info("Update check cancellation requested")

    def get_cache_key(self, server_name, container_name, image_name):
        return f"{server_name}:{container_name}:{image_name}"
    
    def get_cached_result(self, cache_key):
        return self._cache.get(cache_key)
    
    def set_cache_result(self, cache_key, result):
        self._cache.set(cache_key, result)

    def clear_cache(self):
        self._cache.clear()
        logger.info("Update checker cache cleared")
    
    def get_cache_stats(self):
        return self._cache.get_stats()

    def check_local_image_updates(self, client, container, server_name):
        if self._cancellation.is_cancelled():
            return {"available": False, "version": None}
            
        try:
            container_image_id = container.attrs.get('Image', '')
            if not container_image_id: 
                return {"available": False, "version": None}
                
            image_name = container.attrs.get('Config', {}).get('Image', '')
            if not image_name: 
                return {"available": False, "version": None}

            labels = container.attrs.get('Config', {}).get('Labels', {}) or {}
                
            base_name, current_tag = self._parse_image_name(image_name)
            resolved_tag = self._resolve_floating_tag(current_tag, labels)
                
            try:
                local_image = client.images.get(f"{base_name}:{resolved_tag}")
                available = container_image_id != local_image.id
                update_version = self._extract_image_version(local_image, resolved_tag) if available else None
                return {"available": available, "version": update_version}
            except Exception: 
                return {"available": False, "version": None}
        except Exception as e:
            logger.error(f"Error checking local image updates for container '{container.name}': {e}")
            return {"available": False, "version": None}
    
    def check_image_updates(self, client, container, server_name):
        if self._cancellation.is_cancelled():
            logger.debug(f"Update check cancelled before starting for {container.name}")
            return {"available": False, "version": None}
            
        try:
            container_image_id = container.attrs.get('Image', '')
            if not container_image_id: 
                return {"available": False, "version": None}
                
            image_name = container.attrs.get('Config', {}).get('Image', '')
            if not image_name: 
                return {"available": False, "version": None}
                
            cache_key = self.get_cache_key(server_name, container.name, image_name)
            cached_result, is_valid = self.get_cached_result(cache_key)
            if is_valid:
                logger.info(f"Using cached update result for {server_name}:{container.name}")
                return cached_result
            
            labels = container.attrs.get('Config', {}).get('Labels', {}) or {}

            base_name, current_tag = self._parse_image_name(image_name)
            resolved_tag = self._resolve_floating_tag(current_tag, labels)

            if resolved_tag != current_tag:
                logger.info(f"[{server_name}] Checking floating tag: {current_tag} → {resolved_tag}")
            
            if self._cancellation.is_cancelled():
                logger.info(f"Update check cancelled before pulling {base_name}:{current_tag} on {server_name}")
                return {"available": False, "version": None}
            
            result = self._pull_and_compare(client, container_image_id, base_name, resolved_tag, server_name)
            self.set_cache_result(cache_key, result)
            return result
                
        except Exception as e:
            if not self._cancellation.is_cancelled():
                logger.error(f"Error checking image updates for '{container.name}' on {server_name}: {e}")
            return {"available": False, "version": None}

    def _extract_image_version(self, image_obj, default_tag):
        labels = image_obj.labels or {}
        for key in ['org.opencontainers.image.version', 'version', 'build_version']:
            if key in labels and labels[key]:
                # In some images like linuxserver, build_version might be verbose:
                # 'Linuxserver.io version:- 4.0.19.2979-ls320 Build-date:- 2026-07-18T00:16:13+00:00'
                # Let's just return the label value directly unless it's too long, but org.opencontainers.image.version is clean.
                # Prioritize 'org.opencontainers.image.version'
                if key == 'org.opencontainers.image.version':
                    return labels[key]
                elif 'version:-' in labels[key]:
                    return labels[key].split('version:-')[1].strip().split(' ')[0].strip()
                return labels[key]

        for env in image_obj.attrs.get('Config', {}).get('Env', []):
            if '=' in env:
                k, v = env.split('=', 1)
                if 'VERSION' in k and v:
                    return v

        return default_tag

    def _parse_image_name(self, image_name):
        if ':' in image_name: 
            base_name, current_tag = image_name.rsplit(':', 1)
        else: 
            base_name, current_tag = image_name, 'latest'
        return base_name, current_tag
    
    def _pull_and_compare(self, client, container_image_id, base_name, current_tag, server_name):
        try:
            logger.debug(f"Pulling {base_name}:{current_tag} on {server_name}")
            start_time = time.time()
            
            future = self._executor.submit(self._pull_image, client, base_name, current_tag)
            
            try:
                future.result(timeout=self._pull_timeout)
            except FuturesTimeoutError:
                logger.warning(f"Pull timeout ({self._pull_timeout}s) for {base_name}:{current_tag} on {server_name}")
                return False
            
            if self._cancellation.is_cancelled():
                logger.info(f"Update check cancelled after pulling {base_name}:{current_tag} on {server_name}")
                return False
            
            pull_time = time.time() - start_time
            logger.debug(f"Pull completed in {pull_time:.2f}s for {base_name}:{current_tag}")
            
            updated_image = client.images.get(f"{base_name}:{current_tag}")
            result = container_image_id != updated_image.id
            
            update_version = self._extract_image_version(updated_image, current_tag) if result else None

            if result:
                logger.info(
                    f"\033[96m[{server_name}]\033[0m "
                    f"\033[93mUpdate available\033[0m  "
                    f"\033[0m{base_name}:\033[96m{update_version}\033[0m "
                )
            else:
                logger.info(
                    f"\033[96m[{server_name}]\033[0m "
                    f"\033[92mImage up to date\033[0m  "
                    f"{base_name}:{current_tag}"
                )
            
            return {"available": result, "version": update_version}
            
        except Exception as pull_error:
                if self._cancellation.is_cancelled():
                    logger.info(
                        f"\033[96m[{server_name}]\033[0m "
                        f"\033[90mUpdate check cancelled during pull error handling for\033[0m "
                        f"{base_name}:{current_tag}"
                    )
                    return False
            
                logger.warning(
                    f"\033[96m[{server_name}]\033[0m "
                    f"\033[91mCannot pull\033[0m "
                    f"{base_name}:{current_tag}"
                    f"\033[90m– built locally or private repository\033[0m"
                )
                return False

    
    def _pull_image(self, client, base_name, tag):
        client.images.pull(base_name, tag=tag)


update_checker = UpdateChecker()