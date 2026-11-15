# Site Plan Adjuster

**Open the tool: https://shadow-borg.github.io/floor-plan-aligner/**

A single-page tool that opens a DXF floor plan, turns it into walls, doors and windows you can correct by touch, and adjusts the plan to the sizes you measure on site.

There is nothing to download or install. The link above runs the tool in the browser on a phone, tablet or computer. Drawings you open stay on your device.

## How to use

1. **Open** a DXF (in AutoCAD: Save As → DXF).
2. **Edit**: check the items marked `?`, tap any wall, opening or line to correct it.
3. **Measure**: tap a room, opening, column or stair and type the size measured on site.
4. **Menu**: save the project file, export the as-built DXF, PDF report or CSV.

On iPhone, use Share → Add to Home Screen, and save a project file before leaving site.

## Source

`index.html` is built from the files in `src/` with `node src/build.js`. Logic tests: `node src/test.js <sample.dxf>`.
