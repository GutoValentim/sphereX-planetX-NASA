"""Serviços de acesso e processamento dos dados científicos."""

from .fits_processor import inspect_fits
from .frame_generator import GeneratedFrame, generate_frame
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
    "inspect_fits",
]
