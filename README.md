# Fullscreen Interactive Avatar & Cursor Tracking (135 Frames)

A pure fullscreen interactive avatar experience with full 360-degree clockwise head rotation and center smile interaction.

## Frame Mapping (Clockwise Head Rotation)

| Clock Time | Direction | Frame Range | Anchor Frame |
|---|---|---|---|
| **12:00 PM** | **UP** | `frame_001` to `frame_019` | `frame_010` |
| **1:30 PM** | **UP RIGHT** | `frame_020` to `frame_029` | `frame_025` |
| **3:00 PM** | **RIGHT** | `frame_030` to `frame_055` | `frame_042` |
| **4:30 PM** | **RIGHT DOWN** | `frame_056` to `frame_065` | `frame_060` |
| **6:00 PM** | **DOWN** | `frame_066` to `frame_075` | `frame_070` |
| **7:30 PM** | **LEFT DOWN** | `frame_076` to `frame_085` | `frame_080` |
| **9:00 PM** | **LEFT** | `frame_086` to `frame_105` | `frame_095` |
| **10:30 PM** | **LEFT UP** | `frame_106` to `frame_115` | `frame_110` |
| **12:00 AM** | **UP** | `frame_116` to `frame_125` | `frame_120` |
| **CENTER** | **Center Neutral** | `frame_126` to `frame_128` | `frame_128` |
| **SMILE** | **Warm Smiling** | `frame_129` to `frame_135` | `frame_135` |

## Seamless Continuity & Transitions
- Frames `001` through `125` form a complete circular rotation.
- Frame `125` wraps seamlessly back into Frame `001` (both looking straight UP at 12 o'clock).
- When the cursor moves around the circle, the engine automatically selects the shortest path (clockwise or counter-clockwise) to avoid unnecessary spinning.
- The center branch (`126` to `135`) connects directly to `125` / `001`. Resting at the center smoothly transitions from neutral forward gaze into a warm smile.

## Styling & Responsiveness
- **Background Tone:** `#ebe7e0` (matched exactly to the frame borders for seamless ultrawide displays).
- **Responsive Viewport:** Auto-adjusts for MacBooks (16:10 / Retina), standard laptops (16:9), 4K monitors, ultra-wides (21:9 & 32:9), and mobile touch screens.
- **Cursor Follower:** Contrast-tuned dark indicator with glowing cyan accent and warm golden halo when smiling.

## Running Locally

```bash
npm start
# or
node server.js
```
Open **http://localhost:3000** in your browser.
