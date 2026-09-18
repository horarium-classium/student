"""Generate the bundled original bell; uses only the Python standard library."""
import math
from pathlib import Path
import struct
import wave

rate = 22050
samples = []
for index in range(rate * 2):
    time = index / rate
    value = 0.0
    for start, frequency in [(0.0, 880.0), (0.35, 660.0)]:
        elapsed = time - start
        if 0 <= elapsed < 1.5:
            envelope = min(elapsed / 0.01, 1) * min((1.5 - elapsed) / 0.05, 1) * math.exp(-4 * elapsed)
            value += 0.22 * envelope * (math.sin(math.tau * frequency * elapsed) + 0.25 * math.sin(math.tau * 2 * frequency * elapsed))
    samples.append(struct.pack('<h', round(value * 32767)))
with wave.open(str(Path(__file__).resolve().parents[1] / 'src-tauri/assets/bell.wav'), 'wb') as output:
    output.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    output.writeframes(b''.join(samples))
