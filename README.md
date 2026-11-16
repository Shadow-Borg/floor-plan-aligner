# Site Plan Adjuster

**Open the tool: https://shadow-borg.github.io/floor-plan-aligner/**

A single-page tool that opens a DXF floor plan, turns it into walls, doors and windows you can correct by touch, and adjusts the plan to the sizes you measure on site.

There is nothing to download or install. The link above runs the tool in the browser on a phone, tablet or computer. Drawings you open stay on your device.

## How to use

1. **Open** a DXF (in AutoCAD: Save As → DXF).
2. **Edit**: check the items marked `?`, tap any wall, opening or line to correct it.
3. **Measure**: tap a room, opening, column or stair and type the size measured on site.
4. **Drawing** (top bar): see the finished plan in Technical or Presentation style, set paper and scale, and export PDF, image, DXF or CSV.
5. **Add**: draw a wall, add a note at a spot, or place a symbol (furniture, tree, car).

In Edit, the **Snap** button makes dragged ends and new walls catch wall ends, faces, middles and centre lines. Tap a door or window to set its sill height and opening height; in Measure, tap it to record the heights found on site.

On iPhone, use Share → Add to Home Screen, and save a project file before leaving site.

## Source

`index.html` is built from the files in `src/` with `node src/build.js`. Logic tests: `node src/test.js <sample.dxf>`.

## Older versions

Kept as they were, in case you want to compare or go back:

- First version uploaded here: https://shadow-borg.github.io/floor-plan-aligner/old/v1-first.html
- Last version before the rebuild around wall objects: https://shadow-borg.github.io/floor-plan-aligner/old/v1-last.html
- Version 2 before snapping, heights, notes and the new drawing outputs: https://shadow-borg.github.io/floor-plan-aligner/old/v2.html

Project files saved by the current version do not open in these older ones.
