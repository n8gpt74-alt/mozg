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

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env.local"
PORT = 3055
BASE_URL = f"http://localhost:{PORT}"

REQUIRED_KEYS = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "TELEGRAM_BOT_TOKEN",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_CHAT_MODEL",
    "OPENAI_EMBED_MODEL",
]


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


def post_json(url: str, body: dict, headers: dict[str, str]) -> tuple[int, dict]:
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


def wait_for_server(timeout_seconds: int = 180) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/", timeout=5):
                return
        except Exception:
            time.sleep(1)

    raise RuntimeError("Dev server did not become ready in time")


def stop_process(proc: subprocess.Popen[bytes] | subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
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


def main() -> int:
    env_values = load_env_file(ENV_FILE)
    runtime_env = dict(env_values)

    for key in REQUIRED_KEYS:
        if runtime_env.get(key):
            continue

        process_value = os.environ.get(key, "").strip()
        if process_value:
            runtime_env[key] = process_value

    missing = [key for key in REQUIRED_KEYS if not runtime_env.get(key)]
    if missing:
        raise RuntimeError(f"Missing env keys: {', '.join(missing)}")

    process_env = os.environ.copy()
    process_env.update(runtime_env)

    npm_executable = "npm.cmd" if os.name == "nt" else "npm"
    dev_process = subprocess.Popen(
        [npm_executable, "run", "dev", "--", "--port", str(PORT)],
        cwd=str(PROJECT_ROOT),
        env=process_env,
    )

    try:
        wait_for_server()

        init_data = make_init_data(runtime_env["TELEGRAM_BOT_TOKEN"])
        auth_header = {"Authorization": f"tma {init_data}"}
        json_headers = {**auth_header, "Content-Type": "application/json"}

        checks: list[tuple[str, int, dict]] = []

        checks.append(
            (
                "/api/telegram/validate",
                *post_json(f"{BASE_URL}/api/telegram/validate", {}, auth_header),
            )
        )
        checks.append(
            (
                "/api/ai/embed",
                *post_json(
                    f"{BASE_URL}/api/ai/embed",
                    {"content": "local smoke note", "metadata": {"source": "smoke-script"}},
                    json_headers,
                ),
            )
        )
        checks.append(
            (
                "/api/ai/complete",
                *post_json(
                    f"{BASE_URL}/api/ai/complete",
                    {"prompt": "Что я только что сохранил?"},
                    json_headers,
                ),
            )
        )
        checks.append(
            (
                "/api/storage/upload-url",
                *post_json(
                    f"{BASE_URL}/api/storage/upload-url",
                    {"fileName": "smoke.txt"},
                    json_headers,
                ),
            )
        )

        failed = False
        for route, code, payload in checks:
            print(f"{route} -> HTTP {code}")
            print(json.dumps(payload, ensure_ascii=False)[:700])
            print("-" * 60)
            if code >= 400:
                failed = True

        return 1 if failed else 0
    finally:
        stop_process(dev_process)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1)
