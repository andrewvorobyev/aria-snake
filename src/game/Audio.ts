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

        // Start the melodic sequence
        this.playMelodicSequence();

        // Add a soft pad for harmonic bed
        this.addPadLayer();
    }

    private playMelodicSequence() {
        if (!this.audioContext || !this.bgGain) return;

        // Musical scale: C major pentatonic for pleasant sound
        // C4, D4, E4, G4, A4, C5, D5, E5
        const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

        // Arpeggio patterns (indices into notes array)
        const patterns = [
            [0, 2, 4, 5],  // C, E, A, C5
            [1, 3, 5, 7],  // D, G, C5, E5
            [0, 3, 4, 6],  // C, G, A, D5
            [2, 4, 5, 7],  // E, A, C5, E5
        ];

        let patternIndex = 0;
        let noteIndex = 0;
        const noteInterval = 0.4; // seconds between notes
        const noteDuration = 0.6; // note length

        const playNote = () => {
            if (!this.audioContext || !this.bgGain || !this.isPlaying) return;

            const pattern = patterns[patternIndex];
            const freq = notes[pattern[noteIndex]];

            // Create oscillator for the note
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            // Add slight detune for warmth
            osc.detune.value = (Math.random() - 0.5) * 8;

            // Envelope for smooth attack/release
            const envelope = this.audioContext.createGain();
            const now = this.audioContext.currentTime;
            envelope.gain.setValueAtTime(0, now);
            envelope.gain.linearRampToValueAtTime(0.12, now + 0.05);
            envelope.gain.exponentialRampToValueAtTime(0.06, now + noteDuration * 0.5);
            envelope.gain.exponentialRampToValueAtTime(0.001, now + noteDuration);

            // Soft low-pass filter
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 2000;
            filter.Q.value = 0.5;

            osc.connect(filter);
            filter.connect(envelope);
            envelope.connect(this.bgGain);

            osc.start(now);
            osc.stop(now + noteDuration);

            // Advance to next note
            noteIndex++;
            if (noteIndex >= pattern.length) {
                noteIndex = 0;
                patternIndex = (patternIndex + 1) % patterns.length;
            }

            // Schedule next note
            if (this.isPlaying) {
                setTimeout(playNote, noteInterval * 1000);
            }
        };

        // Start the sequence
        playNote();
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
