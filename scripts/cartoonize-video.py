"""Convert a local video to an outlined cartoon look, retaining its audio.

Requires opencv-python-headless and imageio-ffmpeg (also found in .tools/video).
Usage: python scripts/cartoonize-video.py input.mp4 output.mp4 poster.jpg
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.tools' / 'video'))
import cv2
import imageio_ffmpeg
import numpy as np
cv2.setNumThreads(2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('poster', type=Path)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error('El destino debe ser distinto al video original.')
    capture = cv2.VideoCapture(str(args.source))
    if not capture.isOpened():
        raise RuntimeError('No se pudo abrir el video original.')
    fps = capture.get(cv2.CAP_PROP_FPS)
    width, height = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if not fps or not width or not height:
        raise RuntimeError('El video no tiene dimensiones o velocidad válidas.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.poster.parent.mkdir(parents=True, exist_ok=True)
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{width}x{height}',
        '-r', str(fps), '-i', 'pipe:0', '-i', str(args.source),
        '-map', '0:v:0', '-map', '1:a?', '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '19', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', str(args.output),
    ]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    gamma = np.array([round((v / 255) ** .9 * 255) for v in range(256)], dtype=np.uint8)
    processed = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            cartoon = cv2.stylization(frame, sigma_s=80, sigma_r=.35)
            cartoon = cv2.LUT(cartoon, gamma)
            hsv = cv2.cvtColor(cartoon, cv2.COLOR_BGR2HSV)
            hsv[:, :, 1] = np.minimum(hsv[:, :, 1].astype(np.float32) * 1.1, 255).astype(np.uint8)
            cartoon = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
            encoder.stdin.write(cartoon.tobytes())
            if processed == count // 2:
                if not cv2.imwrite(str(args.poster), cartoon, [cv2.IMWRITE_JPEG_QUALITY, 93]):
                    raise RuntimeError('No se pudo guardar la portada.')
            processed += 1
    finally:
        capture.release()
        encoder.stdin.close()
    error = encoder.stderr.read().decode(errors='replace')
    if encoder.wait() or not processed:
        raise RuntimeError(error or 'No se pudo convertir el video.')
    print(json.dumps({'frames': processed, 'seconds': round(processed / fps, 3), 'output': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
