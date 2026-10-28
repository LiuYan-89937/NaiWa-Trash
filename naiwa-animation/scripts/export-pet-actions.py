"""Produce action previews using the pet skill's shared sprite extraction."""

import argparse
import base64
import html
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image


def sequence_for(action):
    timeline = []
    for segment in action['segments']:
        durations = segment.get('durations')
        if durations is None:
            durations = [segment['duration']] * len(segment['frames'])
        for _ in range(segment.get('repeat', 1)):
            timeline.extend(zip(segment['frames'], durations, strict=True))
    return timeline


def ffmpeg(*arguments):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, arguments)], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--frames-only', action='store_true')
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text())
    module_spec = importlib.util.spec_from_file_location('pet_extract', manifest['extractor'])
    extraction = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(extraction)
    previews = root / 'previews'
    previews.mkdir(exist_ok=True)
    canvas = manifest['canvas']
    results, cards = [], []
    for action in manifest['actions']:
        source_directory = Path(manifest['sourceDirectory'])
        if not source_directory.is_absolute():
            source_directory = root / source_directory
        source = source_directory / action['source']
        strip_path = root / 'decoded' / (action['id'] + '.png')
        shutil.copy2(source, strip_path)
        with Image.open(strip_path) as source_image:
            frames = extraction.extract_component_frames(source_image.convert('RGBA'), action['frames'])
        if frames is None or len(frames) != action['frames']:
            raise RuntimeError('Cannot extract complete pose groups: ' + action['id'])
        directory = root / 'frames' / action['id']
        directory.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(frames):
            frame.save(directory / f'{index:02d}.png')
        if calibration := action.get('calibration'):
            with Image.open(root / calibration['reference']) as reference:
                target = reference.convert('RGBA').getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            neutral = frames[calibration['neutralFrame']].getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
            scale = (target[3] - target[1]) / (neutral[3] - neutral[1])
            action['registration'] = {
                'scale': scale,
                'x': (target[0] + target[2]) / 2 - scale * (neutral[0] + neutral[2]) / 2,
                'y': target[3] - scale * neutral[3],
            }
        if args.frames_only:
            print(json.dumps({'id': action['id'], 'frames': len(frames),
                              'registration': action.get('registration')}, ensure_ascii=False), flush=True)
            continue
        sequence = sequence_for(action)
        duration = sum(seconds for _, seconds in sequence)
        concat_path = directory / 'timing.ffconcat'
        lines = ['ffconcat version 1.0']
        for index, seconds in sequence:
            lines.extend([f"file '{index:02d}.png'", 'option framerate 100', f'duration {seconds:.6f}'])
        lines.extend([f"file '{sequence[-1][0]:02d}.png'", 'option framerate 100'])
        concat_path.write_text('\n'.join(lines) + '\n')
        gif_path = previews / (action['id'] + '.gif')
        ffmpeg('-safe', '0', '-f', 'concat', '-i', concat_path,
               '-filter_complex', '[0:v]split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128',
               '-fps_mode', 'vfr', '-t', duration, '-loop', '0', gif_path)
        width = canvas['width'] * canvas['videoScale']
        height = canvas['height'] * canvas['videoScale']
        graph = (f"color=c=0x{canvas['background']}:s={width}x{height}:r={canvas['videoFps']}:d={duration}[bg];"
                 f"[0:v]scale={width}:{height}:flags=lanczos[pet];"
                 '[bg][pet]overlay=shortest=1:format=auto,format=yuv420p[v]')
        video_path = previews / (action['id'] + '.mp4')
        ffmpeg('-safe', '0', '-f', 'concat', '-i', concat_path, '-filter_complex', graph,
               '-map', '[v]', '-t', duration, '-an', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', video_path)
        info = {'id': action['id'], 'label': action['label'], 'sourcePoses': len(frames),
                'sequenceLength': len(sequence), 'durationSeconds': round(duration, 3)}
        results.append(info)
        print(json.dumps(info, ensure_ascii=False), flush=True)
        data = base64.b64encode(gif_path.read_bytes()).decode('ascii')
        label = html.escape(action['label'])
        cards.append(f'<article><div class="stage"><img src="data:image/gif;base64,{data}" alt="{label}" width="192" height="208"></div>'
                     f'<h2>{label}</h2><p>{len(frames)} 个关键姿态 · {duration:.2f} 秒一轮</p>'
                     f'<a href="previews/{action["id"]}.mp4">观看视频</a></article>')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    if args.frames_only:
        return
    (root / 'records' / 'exports.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    gallery = manifest['gallery']
    reference_cards = []
    for reference in gallery.get('references', []):
        source = root / reference['path']
        data = base64.b64encode(source.read_bytes()).decode('ascii')
        label = html.escape(reference['label'])
        reference_cards.append(f'<article><div class="stage"><img src="data:image/png;base64,{data}" alt="{label}" width="192" height="208"></div><h2>{label}</h2></article>')
    document = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title><style>
body{font-family:system-ui,sans-serif;background:#f3f0e8;color:#262d29;margin:0;padding:36px}main{max-width:1100px;margin:auto}h1{font-size:28px;margin:0 0 10px}.intro{color:#626963;line-height:1.7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;margin-top:26px}article{background:white;border:1px solid #e3e3da;border-radius:16px;overflow:hidden;padding-bottom:20px}article h2,article p,article a{margin-left:20px;margin-right:20px}h2{font-size:18px;margin-bottom:6px}article p{font-size:13px;color:#647066}a{color:#42632b}.stage{display:flex;align-items:center;justify-content:center;padding:18px;background-color:#faf9f5;background-image:linear-gradient(45deg,#eceee7 25%,transparent 25%),linear-gradient(-45deg,#eceee7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eceee7 75%),linear-gradient(-45deg,transparent 75%,#eceee7 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.stage img{object-fit:contain}
</style><main><h1>__TITLE__</h1><p class="intro">__DESCRIPTION__</p><div class="grid">'''
    document = document.replace('__TITLE__', html.escape(gallery['title'])).replace('__DESCRIPTION__', html.escape(gallery['description']))
    document += ''.join(cards) + '</div>'
    if reference_cards:
        document += '<h2>形象与动作参考</h2><div class="grid">' + ''.join(reference_cards) + '</div>'
    (root / 'preview.html').write_text(document + '</main></html>')


if __name__ == '__main__':
    main()
