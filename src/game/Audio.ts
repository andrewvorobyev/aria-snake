/**
 * Procedural Audio System
 * Generates background music and sound effects using Web Audio API
 */

import { CONFIG } from '../constants';

export class Audio {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private bgGain: GainNode | null = null;
    private sfxGain: GainNode | null = null;

    private bgOscillators: OscillatorNode[] = [];
    private isPlaying: boolean = false;

    constructor() {
        // Audio context is created on first user interaction
    }

    private async init() {
        if (this.audioContext) {
            // Resume if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            return;
        }

        this.audioContext = new AudioContext();

        // Master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = CONFIG.AUDIO.MASTER_VOLUME;
        this.masterGain.connect(this.audioContext.destination);

        // Background music gain
        this.bgGain = this.audioContext.createGain();
        this.bgGain.gain.value = CONFIG.AUDIO.MUSIC_VOLUME;
        this.bgGain.connect(this.masterGain);

        // SFX gain
        this.sfxGain = this.audioContext.createGain();
        this.sfxGain.gain.value = CONFIG.AUDIO.SFX_VOLUME;
        this.sfxGain.connect(this.masterGain);

        // Resume the context (required after user gesture)
        await this.audioContext.resume();
    }

    /**
     * Start ambient background music
     * Creates a layered drone with subtle modulation
     */
    public async startBackgroundMusic() {
        await this.init();
        if (!this.audioContext || !this.bgGain || this.isPlaying) return;

        this.isPlaying = true;

        // Base frequencies for ambient drone (C minor chord spread across octaves)
        const frequencies = [65.41, 130.81, 155.56, 196.00, 261.63]; // C2, C3, Eb3, G3, C4

        frequencies.forEach((freq, i) => {
            // Main oscillator
            const osc = this.audioContext!.createOscillator();
            osc.type = i === 0 ? 'sine' : 'triangle';
            osc.frequency.value = freq;

            // Subtle detuning for richness
            osc.detune.value = (Math.random() - 0.5) * 10;

            // Individual gain for layering
            const gain = this.audioContext!.createGain();
            gain.gain.value = 0.1 / (i + 1); // Higher notes are quieter

            // Low-pass filter for warmth
            const filter = this.audioContext!.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800 + i * 200;
            filter.Q.value = 0.5;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.bgGain!);

            osc.start();
            this.bgOscillators.push(osc);

            // Slow LFO modulation for movement
            const lfo = this.audioContext!.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.1 + Math.random() * 0.1;

            const lfoGain = this.audioContext!.createGain();
            lfoGain.gain.value = 5; // Subtle pitch wobble

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start();
        });

        // Add subtle noise layer for texture
        this.addNoiseLayer();
    }

    private addNoiseLayer() {
        if (!this.audioContext || !this.bgGain) return;

        // Create noise buffer
        const bufferSize = this.audioContext.sampleRate * 2;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        // Heavy filtering for subtle ambience
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400;
        filter.Q.value = 0.3;

        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = 0.02; // Very quiet

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.bgGain);

        noise.start();
    }

    /**
     * Play fruit eating sound effect
     * A satisfying "blip/pop" sound with harmonic overtones
     */
    public async playEatSound() {
        await this.init();
        if (!this.audioContext || !this.sfxGain) return;

        const now = this.audioContext.currentTime;

        // Main tone - rising pitch "blip"
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(300, now);
        osc1.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        osc1.frequency.exponentialRampToValueAtTime(800, now + 0.12);

        // Harmonic overtone
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(600, now);
        osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

        // Envelope
        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(0.4, now + 0.02);
        envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        // Second envelope for overtone (faster decay)
        const envelope2 = this.audioContext.createGain();
        envelope2.gain.setValueAtTime(0, now);
        envelope2.gain.linearRampToValueAtTime(0.15, now + 0.01);
        envelope2.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc1.connect(envelope);
        osc2.connect(envelope2);
        envelope.connect(this.sfxGain);
        envelope2.connect(this.sfxGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.25);
        osc2.stop(now + 0.15);

        // Add a subtle "pop" noise burst
        this.playNoiseBurst(now, 0.05, 2000);
    }

    private playNoiseBurst(startTime: number, duration: number, filterFreq: number) {
        if (!this.audioContext || !this.sfxGain) return;

        const bufferSize = Math.ceil(this.audioContext.sampleRate * duration * 2);
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = filterFreq;

        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(0.15, startTime);
        envelope.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        noise.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.sfxGain);

        noise.start(startTime);
        noise.stop(startTime + duration);
    }

    /**
     * Stop all audio
     */
    public stop() {
        this.bgOscillators.forEach(osc => {
            try { osc.stop(); } catch (e) { /* Already stopped */ }
        });
        this.bgOscillators = [];
        this.isPlaying = false;
    }

    /**
     * Set master volume (0-1)
     */
    public setVolume(value: number) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, value));
        }
    }
}
