#!/usr/bin/env python3
"""Context Canary demo: 20 s, 1920x1080, 30 fps, simulated Claude Code session (macOS fonts).
Writes frames to ffmpeg on stdin. Sprites come from design/sprites.json.
Usage: python3 video.py silent.mp4 && python3 music.py && ffmpeg -i silent.mp4 -i music2.wav -c:v copy -c:a aac -shortest demo.mp4"""
import json, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 1920, 1080, 30, 20.0
OUT = sys.argv[1] if len(sys.argv) > 1 else 'silent.mp4'
import os
SPR = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'design', 'sprites.json')))
PAL = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in SPR['palette'].items()}

MONO = '/System/Library/Fonts/SFNSMono.ttf'
SANS = '/System/Library/Fonts/SFNS.ttf'
EMOJI = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', 160)

def sans(size, weight='Bold'):
    f = ImageFont.truetype(SANS, size)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f

def mono(size, weight='Regular'):
    f = ImageFont.truetype(MONO, size)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f

F_TERM = mono(27); F_TERM_B = mono(27, 'Bold'); F_SMALL = mono(22)
F_CAP = sans(52, 'Bold'); F_TITLE = sans(120, 'Heavy'); F_SUB = sans(44, 'Medium'); F_CODE = mono(34, 'Medium')

BG = (14, 15, 20); TERM_BG = (24, 25, 32); CHROME = (36, 38, 48); FG = (222, 224, 230); DIM = (128, 132, 146)
USER_BG = (44, 46, 58); ACCENT = (217, 119, 87); RED = (235, 90, 90); GREEN = (110, 210, 140); YELLOW = (247, 204, 50)

_emoji_cache = {}
def emoji(size):
    if size not in _emoji_cache:
        im = Image.new('RGBA', (180, 180), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((0, 0), '🐤', font=EMOJI, embedded_color=True)
        im = im.crop(im.getbbox())
        _emoji_cache[size] = im.resize((size, int(size * im.height / im.width)), Image.LANCZOS)
    return _emoji_cache[size]

def rich(img, xy, text, font, fill, anchor_center=False, alpha=1.0):
    """Text with inline 🐤 emoji. Returns width."""
    d = ImageDraw.Draw(img)
    parts = text.split('🐤')
    asc, desc = font.getmetrics()
    esz = int((asc + desc) * 0.92)
    width = sum(d.textlength(p, font=font) for p in parts) + (len(parts) - 1) * (esz + 4)
    x, y = xy
    if anchor_center: x -= width / 2
    col = tuple(int(c * alpha + BG[i] * (1 - alpha)) for i, c in enumerate(fill)) if alpha < 1 else fill
    for i, p in enumerate(parts):
        d.text((x, y), p, font=font, fill=col)
        x += d.textlength(p, font=font)
        if i < len(parts) - 1:
            e = emoji(esz)
            if alpha < 1:
                e = e.copy(); e.putalpha(e.getchannel('A').point(lambda a: int(a * alpha)))
            img.paste(e, (int(x + 2), int(y + (asc + desc - e.height) / 2 + 2)), e)
            x += esz + 4
    return width

def sprite(img, size, frame, x, y, px, alpha=1.0):
    rows = SPR['sizes'][size]['frames'][frame]
    d = ImageDraw.Draw(img)
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == '.': continue
            col = PAL[ch]
            if alpha < 1: col = tuple(int(v * alpha + BG[i] * (1 - alpha)) for i, v in enumerate(col))
            d.rectangle([x + c * px, y + r * px, x + (c + 1) * px - 1, y + (r + 1) * px - 1], fill=col)

def pose(t, base=0.0):
    """Same rhythm as the mod: an 8-beat loop, blink on 2, chirp on 4, hop on 5 (sped up 2x for video)."""
    beat = int((t - base) * 2) % 8
    return {2: 'blink', 4: 'chirp', 5: 'hop'}.get(beat, 'idle')

def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

# ---- Terminal script -------------------------------------------------------
T_DIE, T_COMPACT, T_REVIVE = 10.0, 11.4, 13.4
EVENTS = [  # (start, kind, text, duration)
    (3.0, 'type', 'refactor the auth module', 0.9),
    (4.3, 'say', '🐤 Done. Auth is split into 3 files and all 48 tests pass.', 0.9),
    (5.6, 'type', 'add rate limiting to /login', 0.8),
    (6.8, 'say', '🐤 Added a token-bucket limiter (5 req/min) with tests.', 0.9),
    (8.3, 'type', 'update the docs too', 0.6),
    (9.1, 'say', "Sure! I've updated the README and the API reference.", 0.8),
    (14.3, 'type', 'thanks!', 0.4),
    (15.0, 'say', '🐤 Anytime!', 0.3),
]
CAPTIONS = [
    (2.7, 8.1, 'Your CLAUDE.md says: start every answer with 🐤'),
    (8.1, 9.95, 'Deep in a long session…'),
    (9.95, T_COMPACT, 'No 🐤? Claude lost your instructions. The canary dies.'),
    (T_COMPACT, T_REVIVE, 'So it compacts automatically, keeping your rules…'),
    (T_REVIVE, 16.6, '…and the canary comes back to life.'),
]

def transcript(t):
    lines = []  # (kind, text)
    for start, kind, text, dur in EVENTS:
        if kind == 'type' and t >= start + dur + 0.15:
            lines.append(('user', text))
        elif kind == 'say' and t >= start:
            n = len(text) if t >= start + dur else int(len(text) * (t - start) / dur)
            lines.append(('claude', text[:n]))
    if t >= T_COMPACT and t < T_REVIVE:
        lines.append(('spin', 'Compacting conversation… preserving your instructions'))
    if t >= T_REVIVE:
        # The conversation is now a summary: older turns collapse into one marker line.
        lines = [('mark', 'Conversation compacted · your instructions kept')]
        for start, kind, text, dur in EVENTS:
            if start >= 14.0:
                if kind == 'type' and t >= start + dur + 0.15: lines.append(('user', text))
                elif kind == 'say' and t >= start:
                    n = len(text) if t >= start + dur else int(len(text) * (t - start) / dur)
                    lines.append(('claude', text[:n]))
    return lines

def composer_text(t):
    for start, kind, text, dur in EVENTS:
        if kind == 'type' and start <= t < start + dur + 0.15:
            return text[:int(len(text) * min(1, (t - start) / dur))]
    return ''

def canary_state(t):
    if t < T_DIE: return 'alive'
    if t < T_REVIVE: return 'dead'
    return 'alive'

def draw_terminal(img, t, alpha):
    wx, wy, ww, wh = 200, 175, 1520, 800
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([wx, wy, wx + ww, wy + wh], 18, fill=TERM_BG)
    d.rounded_rectangle([wx, wy, wx + ww, wy + 48], 18, fill=CHROME)
    d.rectangle([wx, wy + 30, wx + ww, wy + 48], fill=CHROME)
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([wx + 22 + i * 30, wy + 16, wx + 38 + i * 30, wy + 32], fill=c)
    d.text((wx + ww / 2, wy + 24), 'claude — ~/my-app', font=F_SMALL, fill=DIM, anchor='mm')
    # transcript
    x0, y = wx + 40, wy + 80
    LH = 46
    for kind, text in transcript(t)[-9:]:
        if kind == 'user':
            d.rounded_rectangle([x0 - 12, y - 6, x0 + 30 + d.textlength(text, font=F_TERM) + 24, y + 36], 8, fill=USER_BG)
            d.text((x0, y), '>', font=F_TERM, fill=DIM); d.text((x0 + 30, y), text, font=F_TERM, fill=FG)
        elif kind == 'claude':
            d.ellipse([x0 + 4, y + 13, x0 + 18, y + 27], fill=FG); rich(img, (x0 + 34, y), text, F_TERM, FG)
        elif kind == 'spin':
            # Claude Code's spinning asterisk, drawn: three rotating strokes
            cxs, cys, r = x0 + 11, y + 20, 10
            for k in range(3):
                ang = t * 4 + k * math.pi / 3
                d.line([cxs - r * math.cos(ang), cys - r * math.sin(ang), cxs + r * math.cos(ang), cys + r * math.sin(ang)], fill=ACCENT, width=3)
            d.text((x0 + 34, y), text, font=F_TERM, fill=ACCENT)
        elif kind == 'mark':
            d.text((x0, y), '── ' + text + ' ──', font=F_TERM, fill=DIM)
        y += LH + 10
    # band above the composer: the canary, one column from the left edge
    PX = 17
    cx, cy = wx + 40 + 16, wy + wh - 130 - 8 * PX - 22
    if T_DIE <= t < T_DIE + 0.45:  # the cage shakes as the bird drops
        cx += int(9 * math.sin((t - T_DIE) * 70) * (1 - (t - T_DIE) / 0.45))
    state = canary_state(t)
    frame = 'dead' if state == 'dead' else ('hop' if T_REVIVE <= t < T_REVIVE + 0.5 else pose(t))
    sprite(img, 'small', frame, cx, cy, PX)
    # composer
    by = wy + wh - 130
    d.rounded_rectangle([wx + 30, by, wx + ww - 30, by + 64], 10, outline=(80, 84, 100), width=2)
    txt = composer_text(t)
    d.text((wx + 54, by + 16), '>', font=F_TERM, fill=DIM)
    d.text((wx + 84, by + 16), txt, font=F_TERM, fill=FG)
    if int(t * 2) % 2 == 0 or txt:
        cxp = wx + 84 + d.textlength(txt, font=F_TERM) + 2
        d.rectangle([cxp, by + 16, cxp + 14, by + 48], fill=(200, 200, 210))
    d.text((wx + 40, by + 78), '? for shortcuts', font=F_SMALL, fill=DIM)
    # toasts
    def toast(text, color, t0, t1):
        if not (t0 <= t < t1): return
        a = ease((t - t0) / 0.25) * ease((t1 - t) / 0.25)
        tw = rich(Image.new('RGB', (1, 1)), (0, 0), text, F_SMALL, FG) + 60
        tx = wx + ww - 30 - tw + (1 - a) * 40; ty = wy + 70
        d.rounded_rectangle([tx, ty, tx + tw, ty + 58], 12, fill=(34, 36, 46), outline=color, width=2)
        rich(img, (tx + 30, ty + 15), text, F_SMALL, color)
    toast('The canary died: the final reply did not start with 🐤', RED, T_DIE + 0.1, T_COMPACT + 0.8)
    toast('Revived after compaction', GREEN, T_REVIVE + 0.1, 16.4)

def frame_at(t):
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    if t < 2.9:  # intro
        a = ease(t / 0.5) * ease((2.9 - t) / 0.3)
        sprite(img, 'large', pose(t + 1.0), W / 2 - 24 * 14 / 2, 200, 14, a)
        d.text((W / 2, 520), 'Context Canary', font=F_TITLE, fill=tuple(int(c * a + BG[i] * (1 - a)) for i, c in enumerate(FG)), anchor='mt')
        rich(img, (W / 2, 680), 'A canary for Claude Code 🐤', F_SUB, YELLOW, anchor_center=True, alpha=a)
        return img
    if t < 16.9:  # terminal
        a = ease((t - 2.9) / 0.35) * ease((16.9 - t) / 0.3)
        draw_terminal(img, t, a)
        for c0, c1, text in CAPTIONS:
            if c0 <= t < c1:
                ca = ease((t - c0) / 0.2) * ease((c1 - t) / 0.2)
                col = RED if 'dies' in text else (GREEN if 'back to life' in text else FG)
                rich(img, (W / 2, 70), text, F_CAP, col, anchor_center=True, alpha=ca)
        if a < 1:
            img = Image.blend(Image.new('RGB', (W, H), BG), img, a)
        return img
    # outro
    a = ease((t - 16.9) / 0.4)
    sprite(img, 'large', pose(t), W / 2 - 24 * 12 / 2, 120, 12, a)
    d.text((W / 2, 340), 'Context Canary', font=F_TITLE, fill=tuple(int(c * a + BG[i] * (1 - a)) for i, c in enumerate(FG)), anchor='mt')
    rich(img, (W / 2, 495), 'Knows when Claude forgets your instructions.', F_SUB, DIM, anchor_center=True, alpha=a)
    box = [W / 2 - 640, 600, W / 2 + 640, 790]
    d.rounded_rectangle(box, 16, fill=TERM_BG)
    d.text((W / 2 - 600, 628), 'claude plugin marketplace add Nachx639/context-canary', font=F_CODE, fill=FG)
    d.text((W / 2 - 600, 700), 'claude plugin install context-canary@context-canary', font=F_CODE, fill=FG)
    d.text((W / 2, 860), 'github.com/Nachx639/context-canary', font=F_SUB, fill=YELLOW, anchor='mt')
    d.text((W / 2, 935), 'Free · MIT · a Claude Code mod', font=sans(32, 'Medium'), fill=DIM, anchor='mt')
    if a < 1:
        img = Image.blend(Image.new('RGB', (W, H), BG), img, a)
    return img

if __name__ == '__main__':
    if len(sys.argv) > 2:  # preview stills: video.py x.mp4 t1 t2 ...
        for s in sys.argv[2:]:
            frame_at(float(s)).save(f'still-{s}.png')
        sys.exit()
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', OUT], stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        p.stdin.write(frame_at(i / FPS).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', OUT)
