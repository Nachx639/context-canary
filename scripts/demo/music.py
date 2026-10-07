#!/usr/bin/env python3
"""Context Canary demo soundtrack v2: sparse and soft. One melody, a quiet bass, a light tick, a little echo.
Synced to video.py: death 10.0 s, compacting 11.4 s, revival 13.4 s, end chord 19.0 s."""
import numpy as np, wave
SR = 44100; DUR = 20.0
T_DIE, T_COMPACT, T_REVIVE, T_END = 10.0, 11.4, 13.4, 18.1
out = np.zeros(int(SR * DUR))
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
def hz(n): return 440 * 2 ** ((NAMES.index(n[:-1]) + 12 * (int(n[-1]) + 1) - 69) / 12)
def adsr(n, a=0.012, d=0.08, s=0.7, r=0.12):
    e = np.full(n, s); ai, di, ri = int(a * SR), int(d * SR), min(n, int(r * SR))
    e[:ai] = np.linspace(0, 1, ai); e[ai:ai + di] = np.linspace(1, s, len(e[ai:ai + di])); e[-ri:] *= np.linspace(1, 0, ri)
    return e
def voice(f, dur, vol, shape='soft', vib=0.003):
    t = np.arange(int(dur * SR)) / SR
    ph = np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 5 * t) * np.clip(t * 3, 0, 1)) / SR) % 1
    tri = 4 * np.abs(ph - 0.5) - 1
    if shape == 'soft':  # triangle with a hint of pulse: 8-bit, but round
        sig = 0.8 * tri + 0.2 * np.where(ph < 0.5, 1, -1)
    else:
        sig = tri
    return sig * vol * adsr(len(t))
def put(sig, at):
    i = int(at * SR); j = min(len(out), i + len(sig))
    if 0 <= i < len(out): out[i:j] += sig[:j - i]
def tick(at, vol=0.025):
    n = int(0.025 * SR); put(np.random.uniform(-1, 1, n) * vol * np.exp(-np.arange(n) / SR * 160), at)
def chirp(at, vol=0.035):
    for k in range(2):
        t = np.arange(int(0.06 * SR)) / SR
        put(np.sin(2 * np.pi * np.cumsum(2400 + 1800 * t / 0.06) / SR) * vol * adsr(len(t), 0.004, 0.01, 0.8, 0.03), at + k * 0.085)

BEAT = 0.5
def phrase(at, notes, vol=0.11):
    for n, d in notes:
        if n != '-': put(voice(hz(n), d * BEAT * 0.92, vol), at)
        at += d * BEAT
    return at
A = [('E5', 1), ('G5', 1), ('A5', 1), ('G5', 1), ('E5', 2), ('C5', 2)]           # 4 s
B = [('D5', 1), ('E5', 1), ('G5', 1), ('E5', 1), ('D5', 3), ('-', 1)]           # 4 s
C = [('E5', 1), ('G5', 1), ('C6', 2), ('B5', 1), ('A5', 1), ('G5', 2)]          # 4 s
def bass(at, roots, vol=0.09):
    for r in roots:
        put(voice(hz(r), 2 * BEAT * 0.95, vol, 'tri', 0), at); at += 2 * BEAT

# Intro: just the bird and a held note
chirp(0.5); chirp(1.7)
put(voice(hz('G4'), 2.4, 0.05, 'tri'), 0.4)
# 2.9–10.0: the tune, gently
t = 2.0
phrase(t + 0.9, A); phrase(t + 4.9, B, 0.1)
bass(2.9, ['C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'G2'])
for k in range(14): tick(2.9 + 0.5 + k * BEAT, 0.018 if k % 2 else 0.012)
out[int(T_DIE * SR):] = 0
# 10.0: the canary dies — two soft falling notes
put(voice(hz('E4'), 0.45, 0.12, 'tri', 0), T_DIE + 0.05)
put(voice(hz('C4'), 0.9, 0.12, 'tri', 0.012), T_DIE + 0.5)
# 11.4–13.4: compacting — a quiet clock and a low hum swelling in
for k in range(8): tick(T_COMPACT + k * 0.25, 0.012 + 0.012 * k / 7)
hum = voice(hz('G2'), 2.0, 0.07, 'tri', 0) * np.linspace(0.2, 1, int(2.0 * SR))
put(hum, T_COMPACT)
# 13.4: revival — a small sparkle, then the tune comes back
for i, n in enumerate(['C5', 'E5', 'G5', 'C6']): put(voice(hz(n), 0.12, 0.07), T_REVIVE + i * 0.07)
chirp(T_REVIVE + 0.35)
t = T_REVIVE + 0.6
phrase(t, C); bass(t, ['C3', 'F2', 'G2', 'C3'])
for k in range(10): tick(t + 0.5 + k * BEAT, 0.015)
out[int(T_END * SR):] = 0
# final chord rings out
for n, v in [('C4', 0.06), ('E4', 0.05), ('G4', 0.05), ('C5', 0.05)]:
    put(voice(hz(n), 1.85, v, "tri", 0) * np.exp(-np.arange(int(1.85 * SR)) / SR * 1.4), T_END)
chirp(T_END + 0.35, 0.03)

# warmth: low-pass (gentle FFT roll-off above ~4.5 kHz) and a soft echo
spec = np.fft.rfft(out); f = np.fft.rfftfreq(len(out), 1 / SR)
spec *= 1 / np.sqrt(1 + (f / 4500) ** 4); y = np.fft.irfft(spec, len(out))
d = int(0.18 * SR); echo = np.zeros_like(y); echo[d:] = y[:-d] * 0.22; y = y + echo
y /= np.max(np.abs(y)) / 0.8
y[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR)); y[-int(0.25 * SR):] *= np.linspace(1, 0, int(0.25 * SR))
with wave.open('music2.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype(np.int16).tobytes())
print('music2.wav written')
