import argparse
import hashlib
import hmac
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env.local"
DEFAULT_PORT = 3055

BASE_REQUIRED_KEYS = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "TELEGRAM_BOT_TOKEN",
]

AI_REQUIRED_KEYS = [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_CHAT_MODEL",
    "OPENAI_EMBED_MODEL",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run local API smoke checks")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port for local dev server")
    parser.add_argument(
        "--base-url",
        type=str,
        default="",
        help="Existing base URL (when provided, script does not spawn next dev)",
    )
    parser.add_argument(
        "--reuse-server",
        action="store_true",
        help="Use already running server on --port instead of starting next dev",
    )
    parser.add_argument(
        "--skip-ai",
        action="store_true",
        help="Skip /api/ai/embed and /api/ai/complete checks",
    )
    return parser.parse_args()


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise RuntimeError(".env.local not found")

    values: dict[str, str] = {}

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    return values


def make_init_data(bot_token: str) -> str:
    user_payload = {
        "id": 123456789,
        "first_name": "Local",
        "username": "local_dev",
    }
    params = {
        "auth_date": str(int(time.time())),
        "user": json.dumps(user_payload, separators=(",", ":"), ensure_ascii=False),
    }

    data_check_string = "\n".join(f"{key}={params[key]}" for key in sorted(params.keys()))

    secret = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    return urllib.parse.urlencode(params)


def post_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload}
        return error.code, parsed


def delete_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="DELETE",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload}
        return error.code, parsed


def get_json(url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload}
        return error.code, parsed


def post_stream(url: str, body: dict[str, Any], headers: dict[str, str]) -> tuple[int, list[dict[str, Any]]]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = response.read().decode("utf-8")
            lines = [line.strip() for line in payload.split("\n") if line.strip()]
            chunks = [json.loads(line) for line in lines]
            return response.status, chunks
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        try:
            parsed = [json.loads(payload)]
        except json.JSONDecodeError:
            parsed = [{"raw": payload}]
        return error.code, parsed


def wait_for_server(base_url: str, timeout_seconds: int = 180) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/", timeout=5):
                return
        except Exception:
            time.sleep(1)

    raise RuntimeError("Dev server did not become ready in time")


def stop_process(proc: subprocess.Popen[bytes] | subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return

    proc.terminate()
    try:
        proc.wait(timeout=8)
        return
    except subprocess.TimeoutExpired:
        pass

    proc.kill()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        pass


def load_runtime_env(skip_ai: bool) -> dict[str, str]:
    env_values = load_env_file(ENV_FILE)
    runtime_env = dict(env_values)

    required_keys = list(BASE_REQUIRED_KEYS)
    if not skip_ai:
        required_keys.extend(AI_REQUIRED_KEYS)

    for key in required_keys:
        if runtime_env.get(key):
            continue

        process_value = os.environ.get(key, "").strip()
        if process_value:
            runtime_env[key] = process_value

    missing = [key for key in required_keys if not runtime_env.get(key)]
    if missing:
        raise RuntimeError(f"Missing env keys: {', '.join(missing)}")

    return runtime_env


def run_checks(base_url: str, runtime_env: dict[str, str], skip_ai: bool) -> int:
    init_data = make_init_data(runtime_env["TELEGRAM_BOT_TOKEN"])
    auth_header = {"Authorization": f"tma {init_data}"}
    json_headers = {**auth_header, "Content-Type": "application/json"}

    checks: list[tuple[str, int, Any]] = []

    validate_code, validate_payload = post_json(f"{base_url}/api/telegram/validate", {}, auth_header)
    checks.append(("/api/telegram/validate", validate_code, validate_payload))

    embedded_document_id = None

    if not skip_ai:
        embed_code, embed_payload = post_json(
            f"{base_url}/api/ai/embed",
            {"content": "local smoke note", "metadata": {"source": "smoke-script"}},
            json_headers,
        )
        checks.append(("/api/ai/embed", embed_code, embed_payload))

        if embed_code < 400:
            embedded_document_id = embed_payload.get("documentId")

        complete_code, complete_chunks = post_stream(
            f"{base_url}/api/ai/complete",
            {"prompt": "Что я только что сохранил?"},
            json_headers,
        )
        checks.append(("/api/ai/complete", complete_code, complete_chunks))

    memory_code, memory_payload = get_json(f"{base_url}/api/ai/memory", auth_header)
    checks.append(("/api/ai/memory", memory_code, memory_payload))

    if embedded_document_id:
        delete_code, delete_payload = delete_json(
            f"{base_url}/api/ai/memory",
            {"id": embedded_document_id},
            json_headers,
        )
        checks.append(("/api/ai/memory (delete)", delete_code, delete_payload))

    upload_code, upload_payload = post_json(
        f"{base_url}/api/storage/upload-url",
        {"fileName": "smoke.txt"},
        json_headers,
    )
    checks.append(("/api/storage/upload-url", upload_code, upload_payload))

    if upload_code < 400 and upload_payload.get("path"):
        verify_code, verify_payload = post_json(
            f"{base_url}/api/storage/verify-upload",
            {"path": upload_payload["path"]},
            json_headers,
        )
        checks.append(("/api/storage/verify-upload", verify_code, verify_payload))

    failed = False

    for route, code, payload in checks:
        print(f"{route} -> HTTP {code}")
        print(json.dumps(payload, ensure_ascii=False)[:900])
        print("-" * 60)

        if code >= 400:
            failed = True
            continue

        if route == "/api/telegram/validate" and "supabaseAccessToken" in payload:
            print("Contract failure: /api/telegram/validate must not expose supabaseAccessToken")
            failed = True

        if route == "/api/ai/complete":
            if not isinstance(payload, list):
                print("Contract failure: /api/ai/complete must return NDJSON stream chunks")
                failed = True
                continue

            chunk_types = [chunk.get("type") for chunk in payload if isinstance(chunk, dict)]
            if "meta" not in chunk_types or "done" not in chunk_types:
                print("Contract failure: /api/ai/complete stream must include meta and done chunks")
                failed = True

    return 1 if failed else 0


def main() -> int:
    args = parse_args()
    runtime_env = load_runtime_env(skip_ai=args.skip_ai)

    base_url = args.base_url.strip() or f"http://localhost:{args.port}"
    dev_process: subprocess.Popen[str] | None = None

    if not args.reuse_server and not args.base_url:
        process_env = os.environ.copy()
        process_env.update(runtime_env)

        npm_executable = "npm.cmd" if os.name == "nt" else "npm"
        dev_process = subprocess.Popen(
            [npm_executable, "run", "dev", "--", "--port", str(args.port)],
            cwd=str(PROJECT_ROOT),
            env=process_env,
        )

    try:
        wait_for_server(base_url)
        return run_checks(base_url, runtime_env, skip_ai=args.skip_ai)
    finally:
        stop_process(dev_process)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1)
