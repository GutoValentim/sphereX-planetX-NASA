"""Gráfico de espectro em SVG, sem dependências além da biblioteca padrão.

SVG é nítido em qualquer tamanho, leve, pode ser servido como imagem
(``<img src>``) e não exige matplotlib no container de produção.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import ceil, floor, isfinite, log10
from typing import Any, Sequence
from xml.sax.saxutils import escape


THEMES = {
    "dark": {
        "background": "#070a16",
        "panel": "#0b1020",
        "text": "#e8ecf8",
        "muted": "#9ca8c7",
        "grid": "rgba(166,184,255,0.10)",
        "axis": "rgba(166,184,255,0.35)",
    },
    "light": {
        "background": "#ffffff",
        "panel": "#f8f9fc",
        "text": "#1b2233",
        "muted": "#5b6478",
        "grid": "#e6e9f0",
        "axis": "#a9b1c2",
    },
}


@dataclass(frozen=True)
class ChartSeries:
    """Uma banda: pontos medidos (λ, fluxo, erro) e a linha mediana por canal."""

    label: str
    color: tuple[int, int, int]
    # (λ, fluxo, erro[, outlier]): outliers são desenhados vazados e ficam fora da escala.
    points: Sequence[tuple[Any, ...]] = field(default_factory=tuple)
    line: Sequence[tuple[float, float]] = field(default_factory=tuple)


def render_spectrum_svg(
    series: Sequence[ChartSeries],
    *,
    title: str,
    subtitle: str = "",
    theme: str = "dark",
    x_range: tuple[float, float] | None = None,
    y_label: str = "Fluxo (mJy)",
    x_label: str = "Comprimento de onda (µm)",
    width: int = 880,
    height: int = 500,
) -> str:
    if theme not in THEMES:
        raise ValueError(f"Tema inválido. Use um de: {', '.join(THEMES)}.")
    colors = THEMES[theme]

    legend_rows = _legend_layout(series, width - 40)
    top = 64 + 22 * len(legend_rows)
    left, right, bottom = 78, 24, 60
    plot_w = width - left - right
    plot_h = height - top - bottom

    values = [
        (p[0], p[1], p[2])
        for item in series
        for p in item.points
        if isfinite(p[0]) and isfinite(p[1]) and not (len(p) > 3 and p[3])
    ]
    xs = [x for x, _, _ in values]
    ys = [y for _, y, _ in values]
    ys += [y + (e or 0) for _, y, e in values] + [y - (e or 0) for _, y, e in values]
    if x_range is None:
        x_range = (min(xs), max(xs)) if xs else (0.7, 5.1)
    x0, x1 = x_range
    if x1 <= x0:
        x0, x1 = x0 - 0.05, x0 + 0.05
    if ys:
        y0, y1 = _robust_range(ys)
    else:
        y0, y1 = 0.0, 1.0
    y_ticks = _nice_ticks(y0, y1, 6)
    y0, y1 = min(y0, y_ticks[0]), max(y1, y_ticks[-1])
    x_ticks = [tick for tick in _nice_ticks(x0, x1, 8) if x0 <= tick <= x1]

    def px(x: float) -> float:
        return left + (x - x0) / (x1 - x0) * plot_w

    def py(y: float) -> float:
        return top + (1 - (y - y0) / (y1 - y0)) * plot_h

    out: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{escape(title)}" '
        'font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif">',
        f'<rect width="{width}" height="{height}" rx="14" fill="{colors["background"]}"/>',
        f'<text x="20" y="30" font-size="17" font-weight="700" fill="{colors["text"]}">{escape(title)}</text>',
    ]
    if subtitle:
        out.append(
            f'<text x="20" y="50" font-size="12" fill="{colors["muted"]}">{escape(subtitle)}</text>'
        )
    for row_index, row in enumerate(legend_rows):
        y = 74 + 22 * row_index
        for x, item, text in row:
            rgb = _rgb(item.color)
            out.append(
                f'<line x1="{x}" y1="{y - 4}" x2="{x + 22}" y2="{y - 4}" stroke="{rgb}" '
                'stroke-width="3" stroke-linecap="round"/>'
                f'<circle cx="{x + 11}" cy="{y - 4}" r="3" fill="{rgb}"/>'
                f'<text x="{x + 30}" y="{y}" font-size="12" fill="{colors["text"]}">{escape(text)}</text>'
            )

    out.append(
        f'<rect x="{left}" y="{top}" width="{plot_w}" height="{plot_h}" fill="{colors["panel"]}"/>'
    )
    for tick in y_ticks:
        y = py(tick)
        out.append(
            f'<line x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}" stroke="{colors["grid"]}"/>'
            f'<text x="{left - 8}" y="{y + 4:.1f}" font-size="11" text-anchor="end" '
            f'fill="{colors["muted"]}">{_format(tick, y_ticks)}</text>'
        )
    for tick in x_ticks:
        x = px(tick)
        out.append(
            f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + plot_h}" stroke="{colors["grid"]}"/>'
            f'<text x="{x:.1f}" y="{top + plot_h + 18}" font-size="11" text-anchor="middle" '
            f'fill="{colors["muted"]}">{_format(tick, x_ticks)}</text>'
        )
    if y0 < 0 < y1:
        out.append(
            f'<line x1="{left}" y1="{py(0):.1f}" x2="{left + plot_w}" y2="{py(0):.1f}" '
            f'stroke="{colors["axis"]}" stroke-dasharray="4 4"/>'
        )
    out.append(
        f'<rect x="{left}" y="{top}" width="{plot_w}" height="{plot_h}" fill="none" stroke="{colors["axis"]}"/>'
        f'<text x="{left + plot_w / 2:.1f}" y="{height - 16}" font-size="12" text-anchor="middle" '
        f'fill="{colors["text"]}">{escape(x_label)}</text>'
        f'<text transform="translate(20 {top + plot_h / 2:.1f}) rotate(-90)" font-size="12" '
        f'text-anchor="middle" fill="{colors["text"]}">{escape(y_label)}</text>'
    )

    out.append(
        f'<clipPath id="plot"><rect x="{left}" y="{top}" width="{plot_w}" height="{plot_h}"/></clipPath>'
        '<g clip-path="url(#plot)">'
    )
    for item in series:
        rgb = _rgb(item.color)
        for point in item.points:
            x, y, error = point[0], point[1], point[2]
            if not (isfinite(x) and isfinite(y)):
                continue
            if len(point) > 3 and point[3]:
                out.append(
                    f'<circle cx="{px(x):.1f}" cy="{py(min(max(y, y0), y1)):.1f}" r="3.2" fill="none" '
                    f'stroke="{rgb}" stroke-opacity="0.7"><title>outlier</title></circle>'
                )
                continue
            if error and isfinite(error):
                out.append(
                    f'<line x1="{px(x):.1f}" y1="{py(y - error):.1f}" x2="{px(x):.1f}" '
                    f'y2="{py(y + error):.1f}" stroke="{rgb}" stroke-opacity="0.35"/>'
                )
            out.append(
                f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="2.6" fill="{rgb}" fill-opacity="0.55"/>'
            )
        if len(item.line) >= 2:
            path = " ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in item.line)
            out.append(
                f'<polyline points="{path}" fill="none" stroke="{rgb}" stroke-width="2.2" '
                'stroke-linejoin="round" stroke-linecap="round"/>'
            )
    out.append("</g>")
    if not values:
        out.append(
            f'<text x="{left + plot_w / 2:.1f}" y="{top + plot_h / 2:.1f}" font-size="14" '
            f'text-anchor="middle" fill="{colors["muted"]}">Sem medições válidas</text>'
        )
    out.append("</svg>")
    return "".join(out)


def _legend_layout(
    series: Sequence[ChartSeries], available: int
) -> list[list[tuple[int, ChartSeries, str]]]:
    rows: list[list[tuple[int, ChartSeries, str]]] = []
    row: list[tuple[int, ChartSeries, str]] = []
    x = 20
    for item in series:
        entry_width = 30 + 7 * len(item.label) + 22
        if row and x + entry_width > available:
            rows.append(row)
            row, x = [], 20
        row.append((x, item, item.label))
        x += entry_width
    if row:
        rows.append(row)
    return rows


def _robust_range(values: list[float]) -> tuple[float, float]:
    """Ignora o 1% mais extremo para um ponto ruim não achatar o gráfico."""

    ordered = sorted(values)
    cut = len(ordered) // 100
    low, high = ordered[cut], ordered[-1 - cut]
    if high <= low:
        low, high = low - 1, high + 1
    padding = 0.08 * (high - low)
    return low - padding, high + padding


def _nice_ticks(low: float, high: float, count: int) -> list[float]:
    span = high - low
    raw = span / max(1, count - 1)
    magnitude = 10 ** floor(log10(raw))
    step = next(m * magnitude for m in (1, 2, 2.5, 5, 10) if m * magnitude >= raw)
    start = floor(low / step) * step
    end = ceil(high / step) * step
    ticks = []
    value = start
    while value <= end + step / 2:
        ticks.append(round(value, 10))
        value += step
    return ticks


def _format(value: float, ticks: Sequence[float]) -> str:
    step = abs(ticks[1] - ticks[0]) if len(ticks) > 1 else 1
    digits = max(0, -floor(log10(step))) if step < 1 else 0
    if step < 1 and abs(step * 10 ** digits - round(step * 10 ** digits)) > 1e-9:
        digits += 1
    return f"{value:.{digits}f}".replace(".", ",").replace("-", "−")


def _rgb(color: tuple[int, int, int]) -> str:
    return f"rgb({color[0]},{color[1]},{color[2]})"
