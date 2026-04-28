"""FFmpeg-based reel renderer (Phase 8).

Two output styles, both 1280x720 / 30 fps / H.264 + AAC mp4:

- "punchy": 1.5 s per photo, 2.5 s max per video clip, hard cuts.
- "classic": 3.0 s per photo, 5.0 s max per video clip, 0.5 s crossfade transitions.

The function `render_reel` takes a list of input clip specs plus an optional
music track path and writes an mp4 to `output_path`. All inputs are normalized
to the target resolution / fps via a per-input filter chain, then either
concatenated (punchy) or chained through `xfade` (classic).
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from typing import Literal

log = logging.getLogger(__name__)

OUT_W = 1280
OUT_H = 720
OUT_FPS = 30

Style = Literal["classic", "punchy"]


@dataclass
class ClipSpec:
    """A single clip to include in the reel."""

    path: str
    kind: Literal["photo", "video"]


# Per-style timing parameters.
STYLE_PARAMS: dict[Style, dict[str, float]] = {
    "classic": {"photo_dur": 3.0, "video_max": 5.0, "xfade": 0.5},
    "punchy": {"photo_dur": 1.5, "video_max": 2.5, "xfade": 0.0},
}


def ensure_ffmpeg() -> str:
    """Locate ffmpeg or raise a clear RuntimeError."""
    binary = shutil.which("ffmpeg")
    if binary is None:
        raise RuntimeError(
            "FFmpeg not found on PATH. Install FFmpeg and ensure `ffmpeg` is "
            "available in your shell (e.g. `winget install ffmpeg` on Windows)."
        )
    return binary


def render_reel(
    *,
    clips: list[ClipSpec],
    music_path: str | None,
    style: Style,
    output_path: str,
) -> float:
    """Render `clips` into an mp4 at `output_path`. Returns output duration in seconds."""
    if not clips:
        raise ValueError("At least one clip is required")
    params = STYLE_PARAMS[style]
    photo_dur = params["photo_dur"]
    video_max = params["video_max"]
    xfade_dur = params["xfade"]

    ffmpeg = ensure_ffmpeg()

    # Compute per-clip duration and build input args.
    durations: list[float] = []
    input_args: list[str] = []
    for clip in clips:
        if clip.kind == "photo":
            durations.append(photo_dur)
            input_args += ["-loop", "1", "-t", f"{photo_dur:.3f}", "-i", clip.path]
        else:
            durations.append(video_max)
            input_args += ["-t", f"{video_max:.3f}", "-i", clip.path]

    # Build per-input normalization filters. Each input becomes [v0], [v1], ... .
    norm_filter = (
        f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease,"
        f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"setsar=1,fps={OUT_FPS},format=yuv420p"
    )
    parts: list[str] = []
    for i in range(len(clips)):
        parts.append(f"[{i}:v]{norm_filter}[v{i}]")

    # Combine: punchy = concat, classic = xfade chain.
    if xfade_dur > 0 and len(clips) > 1:
        # xfade chain. Each xfade overlaps two clips by `xfade_dur` seconds, so
        # the cumulative timeline length grows by (dur[i] - xfade_dur) per step.
        prev_label = "v0"
        cum = durations[0]
        for i in range(1, len(clips)):
            offset = cum - xfade_dur
            out_label = f"x{i}" if i < len(clips) - 1 else "outv"
            parts.append(
                f"[{prev_label}][v{i}]xfade=transition=fade:"
                f"duration={xfade_dur:.3f}:offset={offset:.3f}[{out_label}]"
            )
            prev_label = out_label
            cum += durations[i] - xfade_dur
        total_duration = cum
    else:
        # Hard concat.
        concat_inputs = "".join(f"[v{i}]" for i in range(len(clips)))
        parts.append(f"{concat_inputs}concat=n={len(clips)}:v=1:a=0[outv]")
        total_duration = sum(durations)

    filter_complex = ";".join(parts)

    cmd: list[str] = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error"]
    cmd += input_args

    if music_path:
        cmd += ["-i", music_path]

    cmd += [
        "-filter_complex",
        filter_complex,
        "-map",
        "[outv]",
    ]

    if music_path:
        # Music is the LAST input. Map its audio, fade it out at the tail,
        # and use -shortest so the output is exactly the video length.
        music_idx = len(clips)
        # Apply a 1.5s audio fade-out at the end of the reel.
        fade_start = max(0.0, total_duration - 1.5)
        cmd += [
            "-map",
            f"{music_idx}:a:0",
            "-af",
            f"afade=t=out:st={fade_start:.3f}:d=1.5",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
        ]

    cmd += [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-r",
        str(OUT_FPS),
        output_path,
    ]

    log.info("Running ffmpeg: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        log.error("ffmpeg failed (rc=%s): %s", proc.returncode, proc.stderr)
        raise RuntimeError(
            f"FFmpeg failed: {proc.stderr.strip().splitlines()[-1] if proc.stderr else 'unknown error'}"
        )
    return total_duration
