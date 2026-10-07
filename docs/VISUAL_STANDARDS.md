# Project Vanguard — Visual & Technical Standards
**Stage 1: Visual Architecture & Asset Pipeline**
*Commercial Tactical FPS Engine Specification*

---

## 1. Core Architecture & Scale Rules

| Parameter | Standard Value | Description / Rule |
| :--- | :--- | :--- |
| **World Unit Scale** | `1 unit = 1.0 meter` | Standard metric system across all 3D meshes, physics, and gameplay logic. |
| **Coordinate System** | `Y-Up, Right-Handed` | `+X` = East / Right, `+Y` = Altitude / Up, `+Z` = South / Forward. |
| **Character Metric** | Eye Height: `1.65m`, Player Height: `1.80m`, Radius: `0.40m` | Authoritative bounding cylinders / AABBs defined in engine. |
| **Door / Passage Dimensions** | Standard Width: `1.2m - 1.8m`, Standard Height: `2.4m - 2.8m` | Prevents camera clipping and movement jamming. |
| **Crate / Cover Heights** | Low Cover: `0.9m - 1.05m`, High Cover: `1.9m - 2.2m` | Tuned specifically for crouch-peek and stand-cover tactical fire. |

---

## 2. Separation of Visuals & Authoritative Physics

1. **Zero Collision Interference**:
   - Visual layers (`src/maps/visual-layer.ts`) are strictly visual-only.
   - Meshes loaded through the visual layer must **NEVER** be registered in the authoritative physics world, raycast occlusion buffers, or server collision geometry unless explicitly converted to authoritative colliders.
2. **Deterministic Gameplay Guarantee**:
   - Hit registration, bullet penetration, player movement, and bomb planting zones remain 100% server-authoritative.
   - Visual LODs, cosmetic props, and decorative detail never alter line-of-sight raycasts or hitboxes.

---

## 3. Directory & Asset Hierarchy

All visual package assets are organized into modular, categorized hierarchies under `public/assets/`:

```
public/assets/
├── maps/
│   ├── industrial_zone/
│   │   ├── visual/
│   │   │   ├── core/         # Critical structural visuals (buildings, floors, silos)
│   │   │   ├── detail/       # Secondary tactical props (pallets, light fixtures, catwalks)
│   │   │   └── optional/     # Atmospheric visuals (particles, dust, minor clutter)
│   │   └── collision/        # Authoritative collision reference models / bounds
│   └── shipyard/
│       ├── visual/
│       │   ├── core/
│       │   ├── detail/
│       │   └── optional/
│       └── collision/
└── props/
    ├── containers/           # Standard 20ft / 40ft shipping containers & variants
    ├── machines/             # Generators, turbines, electrical sub-stations
    ├── pipes/                # Modular pipe joints, valves, overhead conduits
    └── industrial/           # Drums, wooden pallets, concrete barriers, fencing
```

### Layer Classification

* **Core Layer (`visual/core/`)**:
  - Foundational environment meshes, ground terrain, primary architectural shells.
  - Rendered at maximum distance, essential for map silhouette and spatial recognition.
* **Detail Layer (`visual/detail/`)**:
  - Tactically relevant non-blocking visual props, railings, consoles, overhead gantries.
  - Supports frustum culling and distance LOD switching.
* **Optional Layer (`visual/optional/`)**:
  - Cosmetic decals, ambient micro-props, ground debris, decorative foliage.
  - Can be dynamically toggled off for low-end graphics presets.

---

## 4. Performance & Budget Guidelines

* **Target Framerate**: 60–144+ FPS in WebGL / Three.js.
* **Draw Call Budget**: Under 150 draw calls per frame per map scene (using instancing and texture atlasing where possible).
* **Texture Standards**:
  - Power-of-two resolutions (256×256, 512×512, 1024×1024; maximum 2048×2048 for master atlases).
  - PBR Workflow: Roughness / Metalness / Normal maps.
* **Mesh Optimization**:
  - Low-to-mid poly budgets per prop (Props: 100–1,500 tris; Major structures: 2,000–8,000 tris).
  - All normals smoothly unified, non-manifold geometry removed.

---

## 5. Lighting & Material Discipline

* **Consistent Albedo**: Base color values clamped between 30 and 230 RGB (prevents pure black/pure white blowout under HDR tone mapping).
* **Tactical Visibility**: High contrast between background architectural surfaces and player silhouettes (Alpha: Red accents / Omega: Blue-Cyan accents).
* **Shadow Discipline**: Shadow casters enabled primarily for Core structures and primary sunlight/directional lights; contact shadows handled via baked ambient occlusion or lightweight decals.
