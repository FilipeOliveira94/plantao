# Art direction and asset sources

How the game looks and sounds, and where its art and sound may come from. P4 issues (unit cards, scene backdrops, small-town units, ambient sound) follow this file. The decision behind it is "Art for places" in `docs/ROADMAP.md`.

**Status: first draft, not a closed decision.** It is enough to start P4, but it is still basic. Later issues (P4-02, P4-03, P4-04 and any art work after them) should revisit and extend it, and may change it with Filipe's approval.

## Style

- **Flat low-poly isometric, drawn in code.** The scene is Canvas 2D in `src/render/iso.js`: boxes and polygons on a 64×32 tile grid, no textures, no bitmaps. New scene art uses the same `box()`/`poly()` primitives.
- **Flat color, light from one side.** Each surface is one solid color. Light comes from the upper right: `box()` darkens the left face to 72% and the right face to 86% and lightens the top. Use `shade()` for variations; no gradients except sky and light effects (sunlight patch, rain, dusk), and those stay subtle (alpha ≤ 0.3).
- **Thin dark edges** (`rgba(0,0,0,0.18)`), never black outlines.
- **Palette per unit.** Each unit in `src/data/catalog.js` has `floor`, `wall` and `accent`. Backdrop colors derive from those three plus a sky color, so every unit reads as one place. Keep saturation moderate; the triage colors (red, orange, yellow, green, blue) stay reserved for priority and must not dominate a backdrop.
- **People** stay the simple block figures already in the renderer. No faces with expressions, no caricature of patients or staff, no logos of real institutions or brands.
- **Readability first.** Backdrops sit behind the room and the patient. They are lower contrast than the furniture, and nothing in them animates faster than slow loops (rain, clouds, a blinking light).

## Backdrops (scene)

The room's window and, later, the area behind the room show where the unit is. A backdrop has three layers, back to front:

1. **Sky and weather:** a color for the time of day and a slow effect where the place calls for it (rain in Belém, cold grey light in Curitiba, strong sun in Recife).
2. **Skyline or landscape:** silhouettes in 2 or 3 flat tones: hills, trees, rooftops, a landmark reduced to its outline. A landmark must be recognizable from its shape, not from detail.
3. **The building's own context:** what is right outside the window: a street with low houses, a parking lot, other hospital wings.

Furniture and wear inside the room follow the unit type: a UBS has a wooden desk and a stretcher, a PICU has bed, monitors and pumps. Wear (faded paint, a taped poster) is allowed and expected in public units, but never as a joke.

## Building scale per unit type

A building is drawn at the scale it really has. A small health post is not a tower block.

| Unit type | Building | Floors | Surroundings |
| --- | --- | --- | --- |
| Rural health post (P4-04) | Single-storey house-like building, tiled or metal roof, small yard | 1 | Dirt or paved road, trees, few houses |
| UBS (`ubs`) | Single-storey or small two-storey public building, low wall and gate | 1–2 | Residential street, houses, small shops |
| UPA 24h (`upa`) | Wide single-storey block with an ambulance bay and a covered entrance | 1 | Avenue, parking lot, bus stop |
| Small-town hospital (P4-04) | Low hospital of 2–3 floors, one wing | 2–3 | Town center, church tower or square |
| Hospital (`hospital`) | Several wings, 4–8 floors, helipad optional | 4–8 | City block, other tall buildings |
| PICU (`picu`) | One floor inside a large (often university) hospital; seen from inside, high up | 6+ (view from above) | City seen from height |

## Unit cards (menu)

Menu cards show the city: a landmark, the landscape and the building at its scale. The default is the same flat code-drawn style as the scene. A stock photo is allowed on a card only, never in the scene, and only under the license rules below.

## Sound

Sounds are synthesized with WebAudio in `src/audio/` first. A recorded sound is used only when synthesis cannot get close, and then it follows the license rules below. Ambient sound stays quiet under the effects and has its own volume control.

## License rules

The game is under a restrictive, view-only license (`LICENSE`). Any third-party asset must allow use inside it.

| License | Allowed | Notes |
| --- | --- | --- |
| Made for this project (code, art, sound) | Yes | Preferred. No `CREDITS.md` entry needed. |
| CC0 / public domain | Yes | Preferred for external assets. |
| CC BY | Yes | Credit exactly as the license asks, in `CREDITS.md` and wherever the license says. |
| Unsplash / Pexels licenses | Menu cards only | Check the photo has no identifiable people or brands. |
| CC BY-SA, GPL, other copyleft | No | Share-alike conflicts with the project license. |
| CC BY-NC, CC BY-ND | No | Non-commercial or no-derivatives terms are not safe here. |
| No stated license, "free download", AI images of real places or people | No | |

Rules:

- **Every external asset gets a row in `CREDITS.md` in the same PR that adds it**: file path, title, author, source URL, license, and any change made to it.
- Keep the original file name or note the original name in `CREDITS.md`.
- No photos of identifiable patients, staff or real health units' interiors.
- No logos, names or uniforms of real hospitals, brands or government programs in art. Unit names must be invented, never a real service or neighborhood (P4-06).
- When unsure about a license, leave the asset out.
