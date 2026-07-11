#!/usr/bin/env python3
"""day-planner — 予定・メモをフォルダ内 data.json に保存するローカルサーバー。"""

import base64
import json
import os
import re
import socket
import threading
import uuid
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote, urlparse

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(APP_DIR, "data.json")
NOTIFICATION_IMAGES_DIR = os.path.join(APP_DIR, "notification-images")
NOTIFICATION_MANIFEST_FILE = os.path.join(NOTIFICATION_IMAGES_DIR, "manifest.json")
PORT = 8781


def default_data() -> dict:
    return {
        "version": 1,
        "schedule": {"events": [], "memo": ""},
        "routines": [],
        "settings": {
            "startHour": 8,
            "endHour": 19,
            "sidebarCollapsed": False,
            "tagAutoComplete": {
                "task": False,
                "schedule": True,
                "break": True,
            },
            "tagFillMovable": {
                "task": True,
                "schedule": False,
                "break": True,
            },
            "tagNotify": {
                "task": True,
                "schedule": False,
                "break": True,
            },
        },
    }


def ensure_notification_images_dir() -> None:
    os.makedirs(NOTIFICATION_IMAGES_DIR, exist_ok=True)
    if not os.path.isfile(NOTIFICATION_MANIFEST_FILE):
        write_notification_manifest({"images": []})


def read_notification_manifest() -> dict:
    ensure_notification_images_dir()
    try:
        with open(NOTIFICATION_MANIFEST_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("images"), list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {"images": []}


def write_notification_manifest(manifest: dict) -> None:
    ensure_notification_images_dir()
    with open(NOTIFICATION_MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def notification_image_url(filename: str) -> str:
    return f"/notification-images/{filename}"


def list_notification_images() -> list[dict]:
    manifest = read_notification_manifest()
    images = []
    changed = False
    kept = []
    for item in manifest.get("images", []):
        if not isinstance(item, dict):
            changed = True
            continue
        image_id = item.get("id")
        filename = item.get("file")
        if not image_id or not filename:
            changed = True
            continue
        path = os.path.join(NOTIFICATION_IMAGES_DIR, filename)
        if not os.path.isfile(path):
            changed = True
            continue
        kept.append(item)
        images.append({
            "id": image_id,
            "file": filename,
            "url": notification_image_url(filename),
        })
    if changed:
        write_notification_manifest({"images": kept})
    return images


def parse_data_url(data_url: str) -> tuple[bytes, str]:
    match = re.match(r"^data:image/(?P<fmt>[^;]+);base64,(?P<data>.+)$", data_url)
    if not match:
        raise ValueError("invalid data url")
    fmt = match.group("fmt").lower()
    ext = "jpg" if fmt in ("jpeg", "jpg") else fmt
    raw = base64.b64decode(match.group("data"))
    return raw, ext


def save_notification_image(data_url: str) -> dict:
    ensure_notification_images_dir()
    raw, ext = parse_data_url(data_url)
    image_id = f"img_{uuid.uuid4().hex[:12]}"
    filename = f"{image_id}.{ext}"
    path = os.path.join(NOTIFICATION_IMAGES_DIR, filename)
    with open(path, "wb") as f:
        f.write(raw)
    manifest = read_notification_manifest()
    entry = {"id": image_id, "file": filename}
    manifest.setdefault("images", []).append(entry)
    write_notification_manifest(manifest)
    return {
        "id": image_id,
        "file": filename,
        "url": notification_image_url(filename),
    }


def delete_notification_image(image_id: str) -> bool:
    manifest = read_notification_manifest()
    images = manifest.get("images", [])
    kept = []
    deleted = False
    for item in images:
        if not isinstance(item, dict) or item.get("id") != image_id:
            kept.append(item)
            continue
        filename = item.get("file")
        if filename:
            path = os.path.join(NOTIFICATION_IMAGES_DIR, filename)
            if os.path.isfile(path):
                os.remove(path)
        deleted = True
    if deleted:
        write_notification_manifest({"images": kept})
    return deleted


def clear_notification_images() -> None:
    manifest = read_notification_manifest()
    for item in manifest.get("images", []):
        if not isinstance(item, dict):
            continue
        filename = item.get("file")
        if not filename:
            continue
        path = os.path.join(NOTIFICATION_IMAGES_DIR, filename)
        if os.path.isfile(path):
            os.remove(path)
    write_notification_manifest({"images": []})


def migrate_embedded_notification_images(settings: dict) -> bool:
    if not isinstance(settings, dict):
        return False
    payloads = []
    images = settings.pop("notificationImages", None)
    legacy = settings.pop("notificationImageData", None)
    if isinstance(images, list):
        for item in images:
            if isinstance(item, dict) and isinstance(item.get("data"), str):
                payloads.append(item["data"])
    if isinstance(legacy, str) and legacy:
        payloads.append(legacy)
    if not payloads:
        return bool(images is not None or legacy)
    for data_url in payloads:
        try:
            save_notification_image(data_url)
        except (ValueError, OSError):
            continue
    return True


def read_data() -> dict:
    if not os.path.isfile(DATA_FILE):
        return default_data()
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return default_data()
        base = default_data()
        base["schedule"] = {
            "events": data.get("schedule", {}).get("events", [])
            if isinstance(data.get("schedule"), dict)
            else [],
            "memo": data.get("schedule", {}).get("memo", "")
            if isinstance(data.get("schedule"), dict)
            else "",
        }
        routines = data.get("routines")
        base["routines"] = routines if isinstance(routines, list) else []
        settings = data.get("settings")
        if isinstance(settings, dict):
            base["settings"].update(settings)
        return base
    except (OSError, json.JSONDecodeError):
        return default_data()


def write_data(data: dict) -> None:
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def log_message(self, fmt, *args):
        path = str(args[0]) if args else ""
        if path.startswith("GET /api/") or path.startswith("PUT /api/") or path.startswith("POST /api/") or path.startswith("DELETE /api/"):
            return
        super().log_message(fmt, *args)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return None
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/data":
            self.send_json(read_data())
            return
        if path == "/api/notification-images":
            data = read_data()
            settings = data.get("settings")
            migrated = False
            if isinstance(settings, dict) and migrate_embedded_notification_images(settings):
                write_data(data)
                migrated = True
            images = list_notification_images()
            self.send_json({"images": images, "migrated": migrated})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/notification-images":
            try:
                body = self.read_json_body()
                data_url = body.get("data") if isinstance(body, dict) else None
                if not isinstance(data_url, str):
                    self.send_json({"error": "invalid body"}, 400)
                    return
                image = save_notification_image(data_url)
                self.send_json(image, 201)
            except ValueError:
                self.send_json({"error": "invalid image"}, 400)
            except (OSError, json.JSONDecodeError):
                self.send_json({"error": "save failed"}, 500)
            return
        self.send_error(404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == "/api/data":
            try:
                data = self.read_json_body()
                if not isinstance(data, dict):
                    self.send_json({"error": "invalid body"}, 400)
                    return
                write_data(data)
                self.send_json({"ok": True})
            except json.JSONDecodeError:
                self.send_json({"error": "invalid json"}, 400)
            return
        self.send_error(404)

    def do_DELETE(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/notification-images":
            try:
                clear_notification_images()
                self.send_json({"ok": True})
            except OSError:
                self.send_json({"error": "delete failed"}, 500)
            return
        prefix = "/api/notification-images/"
        if path.startswith(prefix):
            image_id = path[len(prefix):]
            if not image_id:
                self.send_json({"error": "missing id"}, 400)
                return
            try:
                if not delete_notification_image(image_id):
                    self.send_json({"error": "not found"}, 404)
                    return
                self.send_json({"ok": True})
            except OSError:
                self.send_json({"error": "delete failed"}, 500)
            return
        self.send_error(404)


def find_port(start: int) -> int:
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start


def main():
    ensure_notification_images_dir()
    port = find_port(PORT)
    server = HTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"day-planner: {url}")
    print(f"data: {DATA_FILE}")
    print(f"notification images: {NOTIFICATION_IMAGES_DIR}")
    threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました")


if __name__ == "__main__":
    main()
