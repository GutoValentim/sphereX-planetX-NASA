# Sky Sphere prototype

Concept validation: navigate the SPHEREx all-sky map (PIA26600) as though the observer were inside a sphere.

```sh
node prototypes/sky-sphere/serve.mjs   # http://localhost:5180
```

- Drag to look around; scroll/pinch to zoom, anchored to the cursor.
- Click to mark a target: the box displays RA/Dec (ICRS, J2000), Galactic l/b, and current FOV.
- Buttons switch between two images and toggle a 30° Galactic grid.

## How it works

Images use Mollweide projection and Galactic coordinates. There is no preprocessing: a WebGL fragment shader converts each screen pixel from camera direction → (l, b) → Mollweide coordinates → texture UV. Automatic ellipse detection lets higher-resolution JPGs replace the images without adjustments.

RA/Dec use the Galactic-to-equatorial rotation matrix (Hipparcos/ICRS). Verified Galactic center: RA 266.405°, Dec −28.936°.

## Limitations

- 2000 px images (~0.18°/px) blur at high zoom.
- No dependencies or build; separate from the React frontend and CI.
