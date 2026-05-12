import os


def get_config() -> dict:
    return {
        'gemini_api_key': os.environ.get('GEMINI_API_KEY', ''),
        'elevenlabs_api_key': os.environ.get('ELEVENLABS_API_KEY', ''),
        'supabase_url': os.environ.get('SUPABASE_URL', 'PLACEHOLDER'),
        'supabase_anon_key': os.environ.get('SUPABASE_ANON_KEY', 'PLACEHOLDER'),
    }
