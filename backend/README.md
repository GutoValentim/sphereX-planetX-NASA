# Scientific backend — CosmoSPHERE

Python services query and process SPHEREx data, exposed to the Node API through FastAPI in `app/main.py`; see the [API contract](../docs/api.md). The public Node/Express entry path is `app/api/server.ts` → `app/api/resultados.ts`. Python remains on the internal network in production.

```sh
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8000 --reload   # Node API: PYTHON_API_URL=http://localhost:8000
python -m unittest discover -s tests -p 'test_*.py'
```

## Current dependencies

- `astroquery`: NASA/IPAC IRSA SIA2 queries.
- `astropy`: coordinates, time, tables, FITS, WCS.
- `pyvo`: Virtual Observatory protocols and errors.
- `numpy`: normalization and array transformations of IMAGE.
- `Pillow`: PNG, WebP, JPEG frame encoding.
- `requests`: HTTPS file and FITS-cutout downloads.
- `reproject`: reprojection of each FITS onto a common celestial WCS grid.
- `scipy`: filters, saturated-core filling, image operations.
- `FastAPI`, `Pydantic`, `uvicorn`: internal HTTP, validation, ASGI server.

Supported versions are in [`requirements.txt`](requirements.txt).

## Implemented services

- `IrsaClient.query_table`: preserves the scientific table returned by SIA2.
- `IrsaClient.search`: converts rows into serializable models.
- `IrsaClient.download`: downloads a full FITS file or cutout.
- `inspect_fits`: lists HDUs/metadata and checks whether a target is inside the image.
- `generate_frame`: converts scientific IMAGE into an 8-bit frame using percentile normalization and asinh stretch.
- `build_common_sky_grid`: creates a square, north-up TAN grid with the requested RA/Dec exactly at the central pixel.
- `align_fits_image`: reprojects each observation's WCS/SIP to the common grid and measures coverage. When `WCS-WAVE` is present, the calibrated per-pixel wavelength map is reprojected too.
- `spectral_color`: describes D1–D6 and maps 0.744–5.002 µm logarithmically into the visible display range 420–640 nm.
- `SpherexImageService.create_preview`: accepts RA, Dec, FOV, selects a compatible observation, downloads a cutout, and returns an image with metadata.
- `SpherexTemporalSequenceService.create_sequence`: accepts RA/Dec, queries SIA2, selects up to 100 D3 observations whose footprints fully contain the 45 arcmin source cutout, downloads those cutouts in parallel, and produces a WebP sequence with a time-sorted JSON manifest. The outer margin preserves the smaller viewing window under any rotation angle.
- `SpherexTemporalSequenceService.discover_dataset`: metadata-only discovery, reusing `dataset.json` to avoid repeated IRSA calls.
- `SpherexTemporalSequenceService.select_indices`: fast (up to 4), balanced (up to 12), complete (up to 100) modes.
- `SpherexTemporalSequenceService.materialize_frame`: downloads and converts only the requested index.
- `SpherexTemporalSequenceService.clear_cache`: removes a validated dataset or all regenerable artifacts in the dedicated cache root.
- `SequenceJobManager`: manages background multiband sequences, selects anchor-band epochs (D3 by default), pairs other bands to the nearest observation in time, and publishes layers as ready.

The temporal engine reprojects every frame onto the same TAN grid and returns `aligned: true`. It uses each FITS file's complete WCS, including SIP distortion when present, instead of assuming uniform RA/Dec or pixel shifts. Sequences use a fixed scale of 6.15 arcseconds per pixel so D1–D6 can be overlaid without subsequent resizing. FITS files are cached by coordinates, band, collections, and period. Preview caching has its own version; older unaligned images are regenerated automatically.

Temporal frames are false-color RGBA WebPs. Intensity still comes from the monochrome scientific extension; only the web representation receives color and 0.82 opacity. Color is calculated per pixel from `WCS-WAVE`; when absent, the selected band's geometric center is used. The logarithmic transformation preserves fractional spacing `Δλ/λ`; the 640 nm display limit prevents D5 and D6 from collapsing into the same red in sRGB. This color is not visible light measured by SPHEREx.

### Rendering profiles (`frame_generator.RENDER_PROFILES`)

Display choices applied equally to all epochs and bands; FITS and aligned arrays are unchanged:

| Profile | Background | Black point | Stretch | Extra |
|---|---|---|---|---|
| `original` | None | Percentile 1 | asinh a=0.1 | Previous behavior |
| `limpa` | Local, mesh ~1/6 of image, sigma clipping | 0.5σ noise | asinh a=0.2 | Saturated cores filled |
| `suave` | Local | 0.5σ | asinh a=0.2 | Gaussian 0.8 px |
| `difusa` | Global level only | Median | asinh a=0.15 | Gaussian 0.5 px; preserves nebulosity |
| `pontual` | Local | 2.5σ | Square root | Primarily compact sources |

Local background removal subtracts zodiacal light (not subtracted in IMAGE) and smooth gradients; sigma clipping rejects compact sources. `limpa`/`pontual` therefore attenuate extended emission larger than approximately one-sixth of the field; use `difusa` for nebulae. Saturated cores (NaN surrounded by valid pixels, up to 64 pixels) receive the largest neighboring value in the display image only. The first frame's display interval is reused for all epochs in each `profile-color` variant, preserving a common temporal display scale.

### Spectrum (`spectrum_service`, `spectrum_chart`)

`SpherexSpectrumService.spectrum(ra_deg, dec_deg, bandpasses, output_directory)` measures the target in all observations of the requested bands using aperture photometry, local background, target-pixel `WCS-WAVE` λ, and `VARIANCE` uncertainties. It writes content-hashed SVGs through `spectrum_chart.render_spectrum_svg`, without matplotlib. `IrsaClient.download_hdus` downloads cutouts only through the requested extension.

In FastAPI, `POST /receber-dados` with `elemento: "espectro"` starts a job (`spectrum_jobs.SpectrumJobManager`, shared with the laboratory, which uses `output: "spectrum"`). Poll `GET /espectros/<id>` and retrieve charts through `GET /espectros/arquivos/...svg`. See [docs/api.md](../docs/api.md).

Photometry processes only the aperture/background-annulus window. λ is interpolated from four neighboring pixels with the same precision as a full map. All observations are still measured. To compare performance and experiment with visit limits using local FITS only, see [`dev/benchmarks/README.md`](../dev/benchmarks/README.md).

Limitations: no proper-motion propagation (fast targets leave the aperture), no aperture correction (absolute flux a few percent low; shape preserved), and FLAGS unused until official bit definitions are available in code.

FITS remains the scientific source. Frames are display derivatives. When comparing epochs, use the same `display_min`/`display_max`; independent normalization can create an artificial impression of brightness variation.

Downloads accept only HTTPS URLs from `irsa.ipac.caltech.edu`. For experiments, prefer cutouts and limit downloaded file counts.

## References

- [Overview, configuration, team](../README.md).
- [Public API contract](../docs/api.md), [architecture](../docs/architecture.md), [complete English technical PDF](../docs/cosmosphere-technical-documentation-en.pdf).
