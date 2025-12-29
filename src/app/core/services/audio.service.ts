import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  private soundBuffers = new Map<string, AudioBuffer>();

  /**
   * Loads a .wav file from assets and decodes it into a buffer for instant playback.
   */
  async preloadSound(name: string, path: string): Promise<void> {
    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.soundBuffers.set(name, audioBuffer);
    } catch (error) {
      console.error(`Failed to load sound: ${name} at ${path}`, error);
    }
  }

  /**
   * Plays a pre-loaded sound.
   */
  playSound(name: string): void {
    const buffer = this.soundBuffers.get(name);
    if (!buffer) return;

    // WebKit on Linux often requires the context to be resumed during a user gesture
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    source.start(0);
  }
}