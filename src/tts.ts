// ElevenLabs TTS placeholder — replace with real API calls when ELEVENLABS_API_KEY is set

export class TTSEngine {
  private _apiKey = '';

  setApiKey(key: string): void {
    this._apiKey = key;
  }

  async speak(text: string): Promise<void> {
    console.log('[NotebookMind TTS] speak():', text.substring(0, 80));
    console.log('[NotebookMind TTS] ElevenLabs pending. Key present:', !!this._apiKey);
  }

  stop(): void {
    console.log('[NotebookMind TTS] stop()');
  }
}

export const ttsEngine = new TTSEngine();
