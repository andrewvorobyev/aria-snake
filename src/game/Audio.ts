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
     * Start melodic background music
     * Creates a gentle arpeggio pattern with evolving harmonies
     */
    public async startBackgroundMusic() {
        await this.init();
        if (!this.audioContext || !this.bgGain || this.isPlaying) return;

        this.isPlaying = true;

        // Start the melodic sequence only (no pad layer to avoid buzzing)
        this.playMelodicSequence();
    }

    private playMelodicSequence() {
        if (!this.audioContext || !this.bgGain) return;

        // Extended scale: C major pentatonic across 2 octaves
        const notes = [
            196.00, 220.00, 261.63, 293.66, 329.63,  // G3, A3, C4, D4, E4
            392.00, 440.00, 523.25, 587.33, 659.25,  // G4, A4, C5, D5, E5
            783.99, 880.00                            // G5, A5
        ];

        // More varied arpeggio patterns (indices into notes array)
        const patterns = [
            [2, 4, 6, 7],     // C4, E4, A4, C5
            [3, 5, 7, 9],     // D4, G4, C5, E5
            [0, 2, 5, 7],     // G3, C4, G4, C5
            [4, 6, 8, 10],    // E4, A4, D5, G5
            [1, 4, 6, 8],     // A3, E4, A4, D5
            [2, 5, 7, 10],    // C4, G4, C5, G5
            [3, 6, 8, 9],     // D4, A4, D5, E5
            [0, 4, 7, 9],     // G3, E4, C5, E5
        ];

        // Bass notes that complement the patterns
        const bassNotes = [65.41, 73.42, 82.41, 98.00]; // C2, D2, E2, G2

        // Start from random pattern for variety
        let patternIndex = Math.floor(Math.random() * patterns.length);
        let noteIndex = 0;
        let measureCount = 0;

        const playNote = () => {
            if (!this.audioContext || !this.bgGain || !this.isPlaying) return;

            const pattern = patterns[patternIndex];
            let freq = notes[pattern[noteIndex]];

            // Occasional random variation (10% chance to pick nearby note)
            if (Math.random() < 0.1) {
                const variation = Math.random() < 0.5 ? -1 : 1;
                const newIndex = Math.max(0, Math.min(notes.length - 1, pattern[noteIndex] + variation));
                freq = notes[newIndex];
            }

            // Fast energetic tempo
            const baseInterval = 0.15 + Math.random() * 0.05;
            const noteDuration = 0.25 + Math.random() * 0.1;

            // Create oscillator for the note
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.detune.value = (Math.random() - 0.5) * 6;

            // Envelope 
            const envelope = this.audioContext.createGain();
            const now = this.audioContext.currentTime;
            const volume = 0.08 + Math.random() * 0.04; // Slight volume variation
            envelope.gain.setValueAtTime(0, now);
            envelope.gain.linearRampToValueAtTime(volume, now + 0.04);
            envelope.gain.exponentialRampToValueAtTime(volume * 0.5, now + noteDuration * 0.6);
            envelope.gain.exponentialRampToValueAtTime(0.001, now + noteDuration);

            // Filter
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1800 + Math.random() * 400;

            osc.connect(filter);
            filter.connect(envelope);
            envelope.connect(this.bgGain);

            osc.start(now);
            osc.stop(now + noteDuration);

            // Play bass note on first beat of pattern
            if (noteIndex === 0) {
                this.playBassNote(bassNotes[patternIndex % bassNotes.length], now);
            }

            // Advance to next note
            noteIndex++;
            if (noteIndex >= pattern.length) {
                noteIndex = 0;
                measureCount++;

                // Change pattern - sometimes random, sometimes sequential
                if (measureCount % 4 === 0 && Math.random() < 0.3) {
                    patternIndex = Math.floor(Math.random() * patterns.length);
                } else {
                    patternIndex = (patternIndex + 1) % patterns.length;
                }
            }

            // Schedule next note
            if (this.isPlaying) {
                setTimeout(playNote, baseInterval * 1000);
            }
        };

        playNote();
    }

    private playBassNote(freq: number, startTime: number) {
        if (!this.audioContext || !this.bgGain) return;

        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const envelope = this.audioContext.createGain();
        envelope.gain.setValueAtTime(0, startTime);
        envelope.gain.linearRampToValueAtTime(0.08, startTime + 0.03);
        envelope.gain.exponentialRampToValueAtTime(0.03, startTime + 0.3);
        envelope.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        osc.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.bgGain);

        osc.start(startTime);
        osc.stop(startTime + 0.6);
    }

    private addPadLayer() {
        if (!this.audioContext || !this.bgGain) return;

        // Soft pad chord: C major with added 9th for dreamy feel
        const padFreqs = [130.81, 164.81, 196.00, 293.66]; // C3, E3, G3, D4

        padFreqs.forEach((freq, i) => {
            const osc = this.audioContext!.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.detune.value = (Math.random() - 0.5) * 6;

            const gain = this.audioContext!.createGain();
            gain.gain.value = 0.03; // Very soft

            // Slow volume modulation for movement
            const lfo = this.audioContext!.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.15 + i * 0.05;

            const lfoGain = this.audioContext!.createGain();
            lfoGain.gain.value = 0.015;

            lfo.connect(lfoGain);
            lfoGain.connect(gain.gain);

            // Low-pass for softness
            const filter = this.audioContext!.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.bgGain!);

            osc.start();
            lfo.start();
            this.bgOscillators.push(osc);
        });
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
