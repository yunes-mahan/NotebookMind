import os
from pathlib import Path


def _load_env_file() -> None:
    """Load KEY=VALUE pairs from a local .env so users can enable the AI/backend
    without exporting shell variables. Real environment variables win.

    Looked up in the current working directory and the repo root (one level
    above this package). Values already set in the environment are kept.
    """
    candidates = [Path.cwd() / '.env', Path(__file__).resolve().parent.parent / '.env']
    seen: set = set()
    for env_path in candidates:
        key = str(env_path)
        if key in seen or not env_path.exists():
            continue
        seen.add(key)
        try:
            for raw in env_path.read_text(encoding='utf-8').splitlines():
                line = raw.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                name, value = line.split('=', 1)
                name = name.strip()
                value = value.strip().strip('"').strip("'")
                if name and name not in os.environ:
                    os.environ[name] = value
        except Exception:
            # A malformed .env should never crash the server.
            pass


_load_env_file()


def get_config() -> dict:
    return {
        'gemini_api_key': os.environ.get('GEMINI_API_KEY', ''),
        'elevenlabs_api_key': os.environ.get('ELEVENLABS_API_KEY', ''),
        'supabase_url': os.environ.get('SUPABASE_URL', 'PLACEHOLDER'),
        'supabase_anon_key': os.environ.get('SUPABASE_ANON_KEY', 'PLACEHOLDER'),
    }
