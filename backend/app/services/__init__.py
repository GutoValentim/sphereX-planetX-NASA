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
    "SpherexImageService",
    "SequenceLimitExceeded",
    "SpherexTemporalSequenceService",
    "TemporalDataset",
    "TemporalFrame",
    "TemporalSequenceResult",
    "generate_frame",
    "generate_frame_from_array",
    "align_fits_image",
    "build_common_sky_grid",
    "inspect_fits",
]
