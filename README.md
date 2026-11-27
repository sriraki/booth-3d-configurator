# Booth 3D Configurator

Parametric 3D configurator for panel-based exhibition shell scheme stalls.

## Module system

Derived from a reference 3000 × 3000 mm stall. Everything is generated from it,
so no stall is modelled by hand.

| Element | Dimension |
|---|---|
| Bay pitch | 3000 mm (3 panels) |
| Panel leaf | 960 mm wide, 2200 mm panel zone |
| Upright | 40 mm |
| Overall height | 2500 mm (2200 + 300 fascia) |
| Fascia print area | 2970 × 260 mm per 3 m bay |
| Counter | 1000 × 500 × 1000 mm, 960 × 620 mm graphic face |

One panel per running metre.

## Configuration space

Footprint `W × D` where each ∈ {3, 4, 5, 6} m — **16 footprints**, 9–36 sqm,
rectangles included. Three open-side options give **48 buildable configurations**.

| Config | Panels | Fascia |
|---|---|---|
| 1 side open (inline) | `W + 2D` | `W` |
| 2 sides open (corner) | `W + D` | `W + D` |
| 3 sides open (peninsula) | `W` | `W + 2D` |

Opening sides trades wall panels for fascia — a 6×6 goes from 18 panels / 6 m
fascia to 6 panels / 18 m fascia. Both are cost drivers, so both are reported live.

## Features

### Artwork
- Drag a PNG or JPG from your desktop straight onto any wall panel, fascia,
  counter face or kiosk screen; the target highlights under the cursor before
  you let go
- Per-surface fit (cover / contain / stretch), scale, nudge and 90-degree rotation
- Safe-area overlay showing the 40 mm the frame covers, so you can see whether
  a logo is about to be clipped
- Effective-dpi readout against the real printed size, warning below 100 dpi
  and flagging anything under 72 dpi as too soft to print
- Work auto-saves to the browser, so a reload keeps your artwork

### Screens
- Drop a video onto a TV for live playback, or several images for a slideshow
- Play / pause / loop / mute per screen, plus a global play-all and pause-all
  so every screen runs together during a walkthrough
- Adjustable dwell time per slide
- Clips up to 25 MB are kept in browser storage; larger ones play for the
  session but are not saved, and the UI says so

### Layout
- Every furniture type is a count you control: counter, coffee table + chairs,
  cabinet, kiosk and bin can each be taken to zero and put back
- Auto-layout of counter, seating clusters, cabinet, kiosks and spotlights,
  scaled pro-rata from the 9 sqm reference package
- Exhibition hall surroundings: neighbouring stalls, aisle carpet and a truss
  ceiling, so the stall is seen in context rather than floating in a void
  (toggle off for clean product shots)
- Drag any floor item on a snapping grid to override
- Wall-mounted TVs (32"–86") that snap to panel boundaries and report how many
  panels they blank
- Fascia and counter artwork generated at true print dimensions, with the
  40 mm frame overlap drawn explicitly
- Live bill of quantities, print area in sq ft, and required 5 A power points
- Buildability checks: TV-vs-panel conflicts, floor density, power shortfall
- PNG render and plain-text specification export

## Run locally

```bash
npm install
npm run dev
```

## Assumptions to confirm with your fabricator

- Panel printable height taken as 2180 mm inside the 2200 mm panel zone
- TVs assumed bracket-mounted to the upright extrusion, 1400 mm to screen centre
