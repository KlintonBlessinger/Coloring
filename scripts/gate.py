"""Fail the build when a vector picture misses the quality bar.

Checks, per picture: mean CIE76 deltaE of the finished fills versus the source
(ink pixels left out) at most 6, at most 3% of regions with a label radius under
3px, regions covering the canvas, every border pixel inside a region, and at
most 40 colors. Tonal pictures also stay between 250 and 700 regions. Elephant
and panda are allowed under that floor. Writes a source | blank | finished
contact sheet under artifacts/review.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pbn import contact_sheet, gate_reasons, score_document

ROOT = Path(__file__).resolve().parents[1]
PUZZLES = ROOT / 'public' / 'puzzles'
SOURCES = ROOT / 'content' / 'sources'
SHEETS = ROOT / 'artifacts' / 'review'
REPORT = ROOT / 'content' / 'reports' / 'vector-scores.json'


def main() -> None:
    files = sorted(PUZZLES.glob('*.json'))
    if len(files) < 99:
        print(f'expected 99 puzzles, found {len(files)}', file=sys.stderr)
        sys.exit(1)
    scores = []
    failed = []
    SHEETS.mkdir(parents=True, exist_ok=True)
    for file in files:
        document = json.loads(file.read_text())
        source = SOURCES / f"{document['id']}.jpg"
        score = score_document(document, str(source))
        reasons = gate_reasons(score)
        score['ok'] = not reasons
        score['reasons'] = reasons
        scores.append(score)
        contact_sheet(str(source), document, str(SHEETS / f"{document['id']}.jpg"))
        status = 'ok' if not reasons else 'FAIL ' + '; '.join(reasons)
        print(
            f"{score['id']}: dE {score['meanDE76']:.2f}  regions {score['regions']}  "
            f"colors {score['colors']}  cover {score['coverage']:.1%}  "
            f"border {score['borderOpen']}  "
            f"r<3 {score['smallRadiusFraction']:.1%}  {status}",
            flush=True,
        )
        if reasons:
            failed.append(score['id'])
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(scores, indent=2) + '\n')
    if failed:
        print('gate failed: ' + ', '.join(failed), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
