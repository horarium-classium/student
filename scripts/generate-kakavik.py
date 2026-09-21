"""Synthesize Komitas's Kakavik opening as a short notification chime.

Source: Depi Hayk Songbook (2005), printed p.33 (PDF p.38):
https://www.duduk.msk.ru/info/duduk/Songbookall.pdf
First six melody notes: C5 A4 A4 A4 D5 A4.
Durations in quarter notes: 1/2, 1/2, 1, 1/2, 1/2, 1.
Original synthesized audio; no sampled recording. Python standard library only.
"""
import math
from pathlib import Path
import struct
import wave

RATE = 22050
BPM = 180
NOTES = [(72, .5), (69, .5), (69, 1), (69, .5), (74, .5), (69, 1)]

def generate(output):
    samples = [0.0] * (RATE * 2)
    start = 0.0
    for note_index, (pitch, beats) in enumerate(NOTES):
        duration = beats * 60 / BPM
        frequency = 440 * 2 ** ((pitch - 69) / 12)
        # Separate repeated notes with a gentle decay; leave a longer final ring.
        tail = duration + (0.5 if note_index == len(NOTES) - 1 else 0.07)
        for index in range(int(tail * RATE)):
            at = round(start * RATE) + index
            if at >= len(samples):
                break
            elapsed = index / RATE
            attack = min(1.0, elapsed / .008)
            release = min(1.0, (tail - elapsed) / .06)
            envelope = attack * release * math.exp(-5.5 * elapsed)
            tone = (math.sin(math.tau * frequency * elapsed)
                    + .22 * math.exp(-3 * elapsed) * math.sin(math.tau * 2 * frequency * elapsed)
                    + .06 * math.exp(-8 * elapsed) * math.sin(math.tau * 3 * frequency * elapsed))
            samples[at] += envelope * tone
        start += duration
    scale = .42 / max(abs(value) for value in samples)
    pcm = [round(value * scale * 32767) for value in samples]
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), 'wb') as audio:
        audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        audio.writeframes(struct.pack('<' + 'h' * len(pcm), *pcm))
    with wave.open(str(output), 'rb') as audio:
        assert audio.getparams()[:3] == (1, 2, RATE)
        assert audio.getnframes() == RATE * 2
    assert 3000 < max(abs(value) for value in pcm) < 20000
    assert all(value == 0 for value in pcm[-100:])
    print(f'{output}: 6 notes, 2 seconds, mono PCM 16-bit / {RATE} Hz')

if __name__ == '__main__':
    import sys
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'src-tauri/assets/kakavik.wav'
    generate(output)
