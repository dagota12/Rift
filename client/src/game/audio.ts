// Web Audio API Procedural Sound Engine for Rift Arena
// Zero external files, zero latency, 100% synthesized procedural audio.

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // AudioContext will initialize on first user gesture
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.ensureContext();
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('keydown', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.generateNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private generateNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 sec noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Plasma Laser Shot (Rapid pitch-down sweep)
  public playLaser(isLocal = true) {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const startTime = ctx.currentTime;
    const duration = 0.085;

    const startFreq = isLocal ? 840 : 680;
    const endFreq = isLocal ? 140 : 110;
    const volume = isLocal ? 0.35 : 0.18;

    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    // Lowpass filter for punchier electronic tone
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, startTime);
    filter.frequency.exponentialRampToValueAtTime(800, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // Bullet Impact / Shield Deflect (Sharp metallic impact ping)
  public playHit() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted || !this.masterGain) return;

    const startTime = ctx.currentTime;
    const duration = 0.07;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(380, startTime);
    osc.frequency.exponentialRampToValueAtTime(60, startTime + duration);

    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // Elimination Explosion (White noise filter sweep + deep sub rumble)
  public playExplosion() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted || !this.masterGain) return;

    const startTime = ctx.currentTime;
    const duration = 0.45;

    // 1. Noise boom
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, startTime);
      filter.frequency.exponentialRampToValueAtTime(60, startTime + duration);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(startTime);
      noise.stop(startTime + duration);
    }

    // 2. Sub-bass thump
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();

    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, startTime);
    sub.frequency.exponentialRampToValueAtTime(25, startTime + duration);

    subGain.gain.setValueAtTime(0.5, startTime);
    subGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    sub.connect(subGain);
    subGain.connect(this.masterGain);

    sub.start(startTime);
    sub.stop(startTime + duration);
  }

  // Match Found / Game Start (Dual sci-fi ascending chime)
  public playMatchFound() {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted || !this.masterGain) return;

    const notes = [440, 660, 880];
    notes.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.28, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  // Game Over (Victory fanfare or defeat toll)
  public playGameOver(isWinner: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || this.isMuted || !this.masterGain) return;

    const notes = isWinner ? [523.25, 659.25, 783.99, 1046.5] : [440, 392, 349.23, 293.66];
    notes.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.14;
      const duration = 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isWinner ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }
}

export const soundManager = new SoundManager();
