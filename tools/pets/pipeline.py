#!/usr/bin/env python3
"""Pet asset pipeline: generate sprite grids via an OpenAI-compatible image API and
slice them into per-stage idle animation frames.

Layouts:
  single: one species per image, three rows are evolution stages (columns are ignored copies).
  sheet:  three species per image, rows are species, columns are evolution stages.

Usage:
  python tools/pets/pipeline.py cat                    # single species (uses cached raw)
  python tools/pets/pipeline.py fox --force            # regenerate the raw, then slice
  python tools/pets/pipeline.py --sheet pets-b         # mixed sheet: 3 species x 3 stages
  python tools/pets/pipeline.py cat --raw some.png     # slice an existing raw image
  python tools/pets/pipeline.py --sheet pets-b --out tools/pets/processed

Requires: Pillow, numpy. No other third-party libraries.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate and slice pet sprite sheets.")
    parser.add_argument("species", nargs="?", help="species key for single-species mode")
    parser.add_argument("--sheet", help="sheet key from species.json for mixed mode (3 species x 3 stages)")
    parser.add_argument("--force", action="store_true", help="regenerate even if a cached raw image exists")
    parser.add_argument("--raw", type=Path, default=None, help="raw image path (default tools/pets/out/<name>-grid.png)")
    parser.add_argument("--out", type=Path, default=None, help="single mode: species output dir; sheet mode: output root")
    parser.add_argument("--target", type=int, default=128, help="target frame size in pixels")
    parser.add_argument("--colors", type=int, default=24, help="palette size per species")
    parser.add_argument("--fps", type=float, default=4, help="playback fps recorded in the manifest")
    parser.add_argument("--quality", default="medium", help="image quality (low, medium, high, xhigh, max, auto)")
    parser.add_argument("--size", default="1024x1024", help="generation size")
    parser.add_argument("--env", type=Path, default=Path(".env"), help="env file with credentials")
    parser.add_argument("--config", type=Path, default=TOOLS_DIR / "species.json", help="species/prompt config")
    parser.add_argument(
        "--no-loop-fix", dest="loop_fix", action="store_false", help="single mode: keep the generated last column"
    )
    parser.add_argument(
        "--frame-mode",
        choices=("squash", "generated"),
        default="squash",
        help="single mode: squash derives idle frames mechanically; generated uses the generated columns",
    )
    parser.add_argument("--bob", type=int, default=2, help="vertical squash in pixels for the mechanical idle frame")
    return parser.parse_args()


def load_env(path: Path) -> dict[str, str]:
    env = dict(os.environ)
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            env.setdefault(key.strip(), value)
    return env


def compose_prompt(species: dict, style: str, frame_mode: str = "squash") -> str:
    rows = "; ".join(f"row {index + 1} is {stage}" for index, stage in enumerate(species["stages"]))
    if frame_mode == "squash":
        columns = (
            "Columns: the three sprites in each row show the exact same stage in the exact same neutral standing "
            "pose, repeated three times as identical copies; no head tilt, no tail swing, no pose change and no "
            "expression change between columns."
        )
    else:
        columns = (
            "Columns: the three sprites in each row form a very subtle 3-frame idle breathing loop. Column 1 is the "
            "neutral standing pose. Column 2 is the exact same character in the exact same pose, only the body "
            "itself lowered by one or two pixels as a gentle breathing squash while the feet stay planted; the "
            "head, ears, eyes, paws, tail and all accessories stay in exactly the same positions and are not "
            "redrawn. Column 3 is identical to column 1. There is no head tilt, no tail swing, no limb movement, "
            "no expression change and no camera change between columns: the three sprites in a row must look "
            "almost identical at a glance, differing only by that tiny vertical bob."
        )
    return (
        "A 3x3 sprite sheet in one single image: 9 sprites arranged in three clear rows and three clear columns "
        "with generous, equal empty gaps between all sprites, each sprite centered inside its own cell with a clear "
        f"empty margin around it. All nine sprites show the SAME {species['identity']}, same aesthetic, front-facing, "
        "full body, feet aligned on the same baseline inside each cell, same limited 24-color palette, "
        f"{style}. "
        f"Rows: {rows}. Each row shows the same character evolving: it grows taller and gains only the described new "
        "features; the species, colors, face and art style never change. Do not add any other accessories. "
        f"{columns}"
    )


def compose_sheet_prompt(species_list: list[dict], style: str) -> str:
    row_count = len(species_list)
    sprite_count = row_count * 3
    rows = "; ".join(
        f"row {index + 1} is {species['identity']} (column 1 is {species['stages'][0]}; "
        f"column 2 is {species['stages'][1]}; column 3 is {species['stages'][2]})"
        for index, species in enumerate(species_list)
    )
    rows_phrase = "one clear row" if row_count == 1 else f"{row_count} clear rows"
    if row_count == 1:
        structure = (
            "The row contains one pet creature; its three columns are the three evolution stages of that creature."
        )
        growth = (
            "The three sprites show the same creature growing through its stages: it gets taller and gains only "
            "the described new features."
        )
    else:
        structure = (
            "Rows are different pet creatures; within each row the three columns are the three evolution stages "
            "of that creature."
        )
        growth = (
            "Each creature appears in exactly one row: the three sprites in that row are the same creature growing "
            "through its stages, getting taller and gaining only the described new features; features never mix "
            "between rows."
        )
    return (
        f"A {row_count}x3 sprite grid in one single image: {sprite_count} sprites arranged in {rows_phrase} and "
        "three clear columns with generous, equal empty gaps between all sprites, each sprite centered inside its "
        f"own cell with a clear empty margin around it. {structure} "
        f"Rows: {rows}. "
        f"{growth} All sprites are front-facing, full body, feet aligned on the same baseline, rendered in one "
        f"consistent style, {style}."
    )


def generate_image(prompt: str, env: dict[str, str], size: str, quality: str, dest: Path) -> dict:
    base_url = env.get("OPENAI_IMAGE_BASEURL", "").rstrip("/")
    api_key = env.get("OPENAI_IMAGE_API_KEY", "")
    model = env.get("OPENAI_IMAGE_MODEL_NAME") or "gpt-image-2.5"
    if not base_url or not api_key:
        raise SystemExit("Missing OPENAI_IMAGE_BASEURL or OPENAI_IMAGE_API_KEY (see .env.example)")

    print(f"POST {base_url}/images/generations model={model} size={size} quality={quality}")
    payload = json.dumps(
        {"model": model, "prompt": prompt, "size": size, "quality": quality, "n": 1, "background": "transparent"}
    ).encode()
    request = urllib.request.Request(
        f"{base_url}/images/generations",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise SystemExit(f"HTTP {error.code}: {error.read().decode(errors='replace')}")

    item = (body.get("data") or [{}])[0]
    dest.parent.mkdir(parents=True, exist_ok=True)
    if item.get("b64_json"):
        dest.write_bytes(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        with urllib.request.urlopen(item["url"], timeout=120) as download:
            dest.write_bytes(download.read())
    else:
        raise SystemExit(f"Unexpected response: {json.dumps(body)[:500]}")
    print(f"saved {dest}")
    return {"model": model, "quality": quality, "size": size, "prompt": prompt, "createdAt": int(time.time())}


def content_mask(arr: np.ndarray) -> np.ndarray:
    """Boolean mask of content pixels. Prefers the alpha channel."""
    alpha = arr[:, :, 3]
    if (alpha < 250).mean() > 0.01:
        return alpha > 8
    rgb = arr[:, :, :3].astype(np.int16)
    corners = np.stack([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    bg = np.array(Counter(map(tuple, corners)).most_common(1)[0][0])
    print(f"  no alpha channel, keying background {tuple(int(v) for v in bg)}")
    return np.abs(rgb - bg).sum(axis=2) > 48


def runs_of(filled: np.ndarray, expected: int, merge_gap: int, min_size: int) -> list[tuple[int, int]]:
    """Find content runs along one axis, merging small gaps and filtering noise."""
    runs: list[tuple[int, int]] = []
    start = None
    for index, on in enumerate(filled):
        if on and start is None:
            start = index
        elif not on and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, len(filled)))
    merged: list[tuple[int, int]] = []
    for run in runs:
        if merged and run[0] - merged[-1][1] < merge_gap:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)
    merged = [run for run in merged if run[1] - run[0] >= min_size]
    if len(merged) == expected:
        return merged
    print(f"  WARNING: expected {expected} run(s), detected {len(merged)}; falling back to equal bands")
    spots = np.flatnonzero(filled)
    if not len(spots):
        raise SystemExit("no content found in image")
    lo, hi = int(spots[0]), int(spots[-1]) + 1
    step = (hi - lo) / expected
    return [(round(lo + i * step), round(lo + (i + 1) * step)) for i in range(expected)]


def collect_cells(
    arr: np.ndarray, mask: np.ndarray, rows: int, cols: int, merge_gap: int, min_size: int
) -> dict[tuple[int, int], tuple[np.ndarray, tuple[int, int]]]:
    """Crop each grid cell to its content bounding box."""
    row_bands = runs_of(mask.any(axis=1), rows, merge_gap, min_size)
    col_bands = runs_of(mask.any(axis=0), cols, merge_gap, min_size)
    cells: dict[tuple[int, int], tuple[np.ndarray, tuple[int, int]]] = {}
    for row, (y0, y1) in enumerate(row_bands, start=1):
        for col, (x0, x1) in enumerate(col_bands, start=1):
            sub_mask = mask[y0:y1, x0:x1]
            col_any = np.flatnonzero(sub_mask.any(axis=0))
            row_any = np.flatnonzero(sub_mask.any(axis=1))
            if not len(col_any) or not len(row_any):
                print(f"  WARNING: cell ({row},{col}) is empty, skipping")
                continue
            cell = arr[
                y0 + int(row_any[0]) : y0 + int(row_any[-1]) + 1,
                x0 + int(col_any[0]) : x0 + int(col_any[-1]) + 1,
            ]
            cells[(row, col)] = (cell, (int(cell.shape[1]), int(cell.shape[0])))
    return cells


def premultiplied_resize(cell: np.ndarray, target: int) -> tuple[np.ndarray, np.ndarray]:
    """Downscale an RGBA cell with premultiplied alpha and area averaging."""
    height, width = cell.shape[:2]
    scale = min(1.0, target / max(width, height))
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    rgba = cell.astype(np.float32)
    alpha = rgba[:, :, 3:4] / 255.0
    premult = np.concatenate([rgba[:, :, :3] * alpha, rgba[:, :, 3:4]], axis=2)
    premult_image = Image.fromarray(np.clip(premult, 0, 255).astype(np.uint8), "RGBA")
    small = np.array(premult_image.resize(size, Image.BOX)).astype(np.float32)
    small_alpha = small[:, :, 3:4] / 255.0
    rgb = small[:, :, :3] / np.maximum(small_alpha, 1.0 / 255.0)
    return np.clip(rgb, 0, 255).astype(np.uint8), small[:, :, 3]


def build_sprite(rgb: np.ndarray, alpha: np.ndarray, palette: Image.Image, target: int) -> Image.Image:
    """Quantize to the shared palette, harden alpha and compose onto a bottom-anchored canvas."""
    quantized = Image.fromarray(rgb, "RGB").quantize(palette=palette, dither=Image.NONE).convert("RGBA")
    quantized.putalpha(Image.fromarray(((alpha > 127).astype(np.uint8)) * 255, "L"))
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    canvas.alpha_composite(quantized, ((target - quantized.width) // 2, target - quantized.height))
    return canvas


def derive_idle(first: Image.Image, target: int, bob: int) -> tuple[Image.Image, Image.Image]:
    """Breathing idle from a neutral frame: squashed middle frame, then the neutral frame again."""
    squashed = first.resize((target, max(1, target - bob)), Image.NEAREST)
    middle = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    middle.alpha_composite(squashed, (0, bob))
    return middle, first.copy()


def palette_of(arts: list[tuple[int, np.ndarray, np.ndarray]], colors: int) -> Image.Image:
    opaque = np.concatenate([rgb[alpha > 127].reshape(-1, 3) for _, rgb, alpha in arts if (alpha > 127).any()])
    return Image.fromarray(opaque.reshape(1, -1, 3), "RGB").quantize(colors=colors, method=Image.MEDIANCUT)


def print_frame_diff(frames: dict[tuple[int, int], Image.Image]) -> None:
    for stage in sorted({stage for stage, _ in frames}):
        if (stage, 1) in frames and (stage, 2) in frames:
            first = np.array(frames[(stage, 1)], dtype=np.int16)
            second = np.array(frames[(stage, 2)], dtype=np.int16)
            visible = (first[:, :, 3] > 127) | (second[:, :, 3] > 127)
            changed = (np.abs(first[:, :, :3] - second[:, :, :3]).sum(axis=2) > 12) & visible
            total = int(visible.sum())
            print(f"  stage {stage}: f1 vs f2 changed {int(changed.sum())}/{total} px ({changed.sum() / max(total, 1):.1%})")


def write_species(
    directory: Path,
    species: str,
    frames: dict[tuple[int, int], Image.Image],
    natives_by_stage: dict[int, tuple[int, int]],
    *,
    target: int,
    colors: int,
    fps: float,
    source_name: str,
) -> None:
    """Save frames, stage GIFs, a contact sheet and the manifest for one species."""
    directory.mkdir(parents=True, exist_ok=True)
    scale = 4
    stages = sorted({stage for stage, _ in frames})
    for key in sorted(frames):
        frames[key].save(directory / f"s{key[0]}-f{key[1]}.png")

    sheet = Image.new("RGB", (target * 3 * scale, target * len(stages) * scale), (40, 44, 52))
    for stage_order, stage in enumerate(stages):
        stage_keys = sorted(key for key in frames if key[0] == stage)
        for frame_order, (_, frame) in enumerate(stage_keys):
            big = frames[(stage, frame)].resize((target * scale, target * scale), Image.NEAREST)
            sheet.paste(big, (frame_order * target * scale, stage_order * target * scale), big)
    sheet.save(directory / "sheet-4x.png")

    manifest_stages = []
    for stage in stages:
        stage_keys = sorted(key for key in frames if key[0] == stage)
        gif_frames = [frames[key].resize((target * scale, target * scale), Image.NEAREST) for key in stage_keys]
        gif_frames[0].save(
            directory / f"s{stage}.gif", save_all=True, append_images=gif_frames[1:], duration=round(1000 / fps), loop=0, disposal=2
        )
        manifest_stages.append(
            {
                "stage": stage,
                "frames": [
                    {
                        "file": f"s{stage}-f{frame}.png",
                        "native": list(natives_by_stage.get(stage, (target, target))),
                    }
                    for _, frame in stage_keys
                ],
            }
        )

    manifest = {
        "species": species,
        "grid": {"rows": len(stages), "cols": 3},
        "frameSize": {"width": target, "height": target},
        "fps": fps,
        "paletteSize": colors,
        "source": source_name,
        "stages": manifest_stages,
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"done: {len(frames)} frames in {directory}")


def process_single(
    source: Path,
    *,
    species: str,
    frame_mode: str,
    bob: int,
    loop_fix: bool,
    target: int,
    colors: int,
    fps: float,
    out: Path,
    merge_gap: int = 12,
    min_size: int = 24,
) -> None:
    image = Image.open(source).convert("RGBA")
    arr = np.array(image)
    print(f"source {source} {image.width}x{image.height} layout=single")
    mask = content_mask(arr)
    rows, cols = 3, 3
    cells = collect_cells(arr, mask, rows, cols, merge_gap, min_size)
    for (stage, frame), (_, native) in sorted(cells.items()):
        print(f"  stage {stage} frame {frame}: native={native[0]}x{native[1]}")

    selected = [(stage, 1) for stage in range(1, rows + 1) if (stage, 1) in cells] if frame_mode == "squash" else sorted(cells)
    arts = [(key, *premultiplied_resize(cells[key][0], target)) for key in selected]
    if loop_fix and frame_mode == "generated":
        first_by_stage = {stage: (rgb, alpha) for (stage, frame), rgb, alpha in arts if frame == 1}
        arts = [
            ((stage, frame), *first_by_stage[stage]) if frame == cols and stage in first_by_stage else ((stage, frame), rgb, alpha)
            for (stage, frame), rgb, alpha in arts
        ]

    palette = palette_of(arts, colors)
    print(f"  palette locked to {colors} colours")
    frames = {key: build_sprite(rgb, alpha, palette, target) for key, rgb, alpha in arts}
    if frame_mode == "squash":
        for stage in sorted({stage for stage, _ in frames}):
            middle, last = derive_idle(frames[(stage, 1)], target, bob)
            frames[(stage, 2)] = middle
            frames[(stage, 3)] = last
    print_frame_diff(frames)

    natives_by_stage = {stage: cells[(stage, 1)][1] for stage in range(1, rows + 1) if (stage, 1) in cells}
    write_species(out, species, frames, natives_by_stage, target=target, colors=colors, fps=fps, source_name=source.name)


def process_sheet(
    source: Path,
    *,
    species_keys: list[str],
    bob: int,
    target: int,
    colors: int,
    fps: float,
    out_root: Path,
    merge_gap: int = 12,
    min_size: int = 24,
) -> None:
    image = Image.open(source).convert("RGBA")
    arr = np.array(image)
    rows, cols = len(species_keys), 3
    print(f"source {source} {image.width}x{image.height} layout=sheet rows={rows} cols={cols}")
    mask = content_mask(arr)
    cells = collect_cells(arr, mask, rows, cols, merge_gap, min_size)

    for row, species in enumerate(species_keys, start=1):
        arts = []
        natives_by_stage = {}
        for stage in range(1, cols + 1):
            if (row, stage) not in cells:
                print(f"  WARNING: {species} stage {stage} missing")
                continue
            cell, native = cells[(row, stage)]
            arts.append((stage, *premultiplied_resize(cell, target)))
            natives_by_stage[stage] = native
            print(f"  {species} stage {stage}: native={native[0]}x{native[1]}")
        if not arts:
            continue
        palette = palette_of(arts, colors)
        frames: dict[tuple[int, int], Image.Image] = {}
        for stage, rgb, alpha in arts:
            first = build_sprite(rgb, alpha, palette, target)
            middle, last = derive_idle(first, target, bob)
            frames[(stage, 1)] = first
            frames[(stage, 2)] = middle
            frames[(stage, 3)] = last
        write_species(out_root / species, species, frames, natives_by_stage, target=target, colors=colors, fps=fps, source_name=source.name)


def main() -> int:
    args = parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    if bool(args.species) == bool(args.sheet):
        raise SystemExit("provide either a species key or --sheet")

    if args.sheet:
        sheets = config.get("sheets", {})
        if args.sheet not in sheets:
            raise SystemExit(f"unknown sheet '{args.sheet}'; known: {', '.join(sheets) or '(none)'}")
        species_keys = sheets[args.sheet]
        missing = [key for key in species_keys if key not in config["species"]]
        if missing:
            raise SystemExit(f"sheet references unknown species: {', '.join(missing)}")
        raw_path = args.raw or (TOOLS_DIR / "out" / f"sheet-{args.sheet}-grid.png")
        out_root = args.out or (TOOLS_DIR / "processed")
        if raw_path.exists() and not args.force:
            print(f"using cached raw image {raw_path} (pass --force to regenerate)")
        else:
            env = load_env(args.env)
            prompt = compose_sheet_prompt([config["species"][key] for key in species_keys], config["style"])
            meta = generate_image(prompt, env, args.size, args.quality, raw_path)
            raw_path.with_suffix(".json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        process_sheet(
            raw_path, species_keys=species_keys, bob=args.bob, target=args.target, colors=args.colors, fps=args.fps, out_root=out_root
        )
        return 0

    if args.species not in config["species"]:
        raise SystemExit(f"unknown species '{args.species}'; known: {', '.join(config['species'])}")
    raw_path = args.raw or (TOOLS_DIR / "out" / f"{args.species}-grid.png")
    out_dir = args.out or (TOOLS_DIR / "processed" / args.species)
    if raw_path.exists() and not args.force:
        print(f"using cached raw image {raw_path} (pass --force to regenerate)")
    else:
        env = load_env(args.env)
        prompt = compose_prompt(config["species"][args.species], config["style"], args.frame_mode)
        meta = generate_image(prompt, env, args.size, args.quality, raw_path)
        raw_path.with_suffix(".json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    process_single(
        raw_path,
        species=args.species,
        frame_mode=args.frame_mode,
        bob=args.bob,
        loop_fix=args.loop_fix,
        target=args.target,
        colors=args.colors,
        fps=args.fps,
        out=out_dir,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
