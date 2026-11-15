"""Serviços de acesso e processamento dos dados científicos."""

from .fits_processor import inspect_fits
from .frame_generator import GeneratedFrame, generate_frame, generate_frame_from_array
from .image_aligner import (
    AlignedImage,
    CommonSkyGrid,
    align_fits_image,
    build_common_sky_grid,
)
from .image_service import PreviewImageResult, SpherexImageService
from .irsa_client import IrsaClient
from .spectral_color import (
    FALSE_COLOR_OPACITY,
    SPHEREX_BANDS,
    SpherexBand,
    get_spherex_band,
    infrared_to_rgb,
    infrared_to_visible_nm,
)
from .temporal_sequence_service import (
    LazyFrameResult,
    SequenceLimitExceeded,
    SpherexTemporalSequenceService,
    TemporalDataset,
    TemporalFrame,
    TemporalSequenceResult,
)

__all__ = [
    "GeneratedFrame",
    "AlignedImage",
    "CommonSkyGrid",
    "IrsaClient",
    "LazyFrameResult",
    "PreviewImageResult",
    "SpherexBand",
    "SpherexImageService",
    "SequenceLimitExceeded",
    "SpherexTemporalSequenceService",
    "TemporalDataset",
    "TemporalFrame",
    "TemporalSequenceResult",
    "FALSE_COLOR_OPACITY",
    "SPHEREX_BANDS",
    "generate_frame",
    "generate_frame_from_array",
    "get_spherex_band",
    "infrared_to_rgb",
    "infrared_to_visible_nm",
    "align_fits_image",
    "build_common_sky_grid",
    "inspect_fits",
]
