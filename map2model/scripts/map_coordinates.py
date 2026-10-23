"""Read-only site import and bounded horizontal map coordinate preparation.

WGS84 is always longitude/latitude. Metric work uses a local WGS84 azimuthal
equidistant projection. Heights are reference information and never converted.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

from pyproj import CRS, Geod, Transformer
from pyproj.exceptions import CRSError, ProjError
from shapely import force_2d, transform as transform_geometry
from shapely.geometry import Point, mapping, shape
from shapely.validation import explain_validity


WGS84 = CRS.from_epsg(4326)
GEOD = Geod(ellps="WGS84")
MAX_SPAN_DEGREES = 2.0
MAX_LATITUDE = 80.0
MAX_BUFFER_M = 10_000.0


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _crs(value: str | CRS) -> CRS:
    text = str(value).lower().replace("_", "").replace("-", "").replace(" ", "")
    if text == "unknown" or any(token in text for token in ("gcj", "bd09", "baidu")):
        raise ValueError("Offset or unknown coordinate references (GCJ/BD) are unsupported; supply known WGS84 data.")
    try:
        result = CRS.from_user_input(value)
    except (CRSError, TypeError, ValueError) as exc:
        raise ValueError(f"Unknown coordinate reference: {value!s}") from exc
    if result.is_compound or not (result.is_geographic or result.is_projected):
        raise ValueError("Only a known horizontal geographic or projected CRS is supported; no vertical datum conversion.")
    return result.to_2d()


def _transformer(source: str | CRS, target: str | CRS) -> Transformer:
    try:
        return Transformer.from_crs(_crs(source), _crs(target), always_xy=True,
                                    allow_ballpark=False, only_best=True)
    except (CRSError, ProjError) as exc:
        raise ValueError("No reliable horizontal coordinate transformation is available.") from exc


def _positions(geometry: dict):
    if geometry.get("type") == "GeometryCollection":
        for child in geometry.get("geometries", []):
            yield from _positions(child)
        return

    def walk(value):
        if not isinstance(value, (list, tuple)) or not value:
            raise ValueError("Geometry coordinates must be nonempty arrays.")
        if isinstance(value[0], (int, float)):
            if len(value) not in (2, 3) or not all(_finite_number(item) for item in value):
                raise ValueError("Every coordinate must contain two or three finite numbers.")
            yield value
        else:
            for item in value:
                yield from walk(item)

    yield from walk(geometry.get("coordinates"))


def _geometry(geometry: dict):
    if not isinstance(geometry, dict):
        raise ValueError("A GeoJSON geometry object is required.")
    list(_positions(geometry))
    try:
        result = shape(geometry)
    except (TypeError, ValueError, KeyError, IndexError) as exc:
        raise ValueError("Malformed geometry.") from exc
    if result.is_empty or not result.is_valid:
        raise ValueError(f"Empty or invalid geometry: {explain_validity(result)}")
    return result


def _horizontal(geometry):
    return force_2d(geometry)


def _scope(geometry):
    minlon, minlat, maxlon, maxlat = geometry.bounds
    if not all(math.isfinite(item) for item in geometry.bounds):
        raise ValueError("Nonfinite WGS84 coordinates.")
    if minlon < -180 or maxlon > 180 or minlat < -MAX_LATITUDE or maxlat > MAX_LATITUDE:
        raise ValueError("Site must use longitude/latitude within +/-180 longitude and +/-80 latitude.")
    if maxlon - minlon > MAX_SPAN_DEGREES or maxlat - minlat > MAX_SPAN_DEGREES:
        raise ValueError("Only local sites up to two degrees across are supported; no dateline or global geometry.")


def project_geometry(geometry: dict, source_crs: str, target_crs: str) -> dict:
    """Return transformed 2D GeoJSON; deliberately discard unconverted heights."""
    original = _horizontal(_geometry(geometry))
    try:
        converter = _transformer(source_crs, target_crs)
        projected = transform_geometry(original, lambda x, y: converter.transform(x, y, errcheck=True), interleaved=False)
    except (ProjError, TypeError, ValueError) as exc:
        raise ValueError(f"Horizontal projection failed: {exc}") from exc
    result = mapping(projected)
    _geometry(result)
    return result


def _select(candidates: list[dict], placemark: str | None) -> dict:
    if placemark is not None:
        candidates = [candidate for candidate in candidates if placemark in candidate["labels"]]
    if len(candidates) != 1:
        raise ValueError("Select exactly one named placemark/feature; selection is missing, ambiguous, or contains multiple sites.")
    return candidates[0]


def _validate_rings(geometry: dict):
    if geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise ValueError("Site files must contain Polygon or MultiPolygon geometry.")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, (list, tuple)) or not coordinates:
        raise ValueError("Site polygons must be nonempty.")
    list(_positions(geometry))
    polygon_sets = [coordinates] if geometry["type"] == "Polygon" else coordinates
    for rings in polygon_sets:
        if not isinstance(rings, (list, tuple)) or not rings:
            raise ValueError("Polygon exterior is missing.")
        for ring in rings:
            if not isinstance(ring, (list, tuple)) or len(ring) < 4:
                raise ValueError("Polygon rings must have at least four positions and be explicitly closed.")
            if not all(isinstance(point, (list, tuple)) and len(point) in (2, 3)
                       and all(_finite_number(value) for value in point) for point in ring):
                raise ValueError("Polygon positions must contain two or three finite numbers.")
            if list(ring[0]) != list(ring[-1]):
                raise ValueError("Polygon rings must have at least four positions and be explicitly closed.")


def _geojson(data: bytes, placemark: str | None, source_crs: str | None):
    def invalid_constant(value):
        raise ValueError(f"Nonfinite JSON number: {value}")

    try:
        obj = json.loads(data.decode("utf-8-sig"), parse_constant=invalid_constant)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid UTF-8 GeoJSON.") from exc
    if not isinstance(obj, dict):
        raise ValueError("GeoJSON must be an object.")
    declared = obj.get("crs")
    if declared is not None:
        try:
            declared_name = declared["properties"]["name"]
        except (TypeError, KeyError) as exc:
            raise ValueError("Unrecognized GeoJSON CRS declaration.") from exc
        declared_crs = _crs(declared_name)
        if source_crs is None and not declared_crs.equals(WGS84, ignore_axis_order=True):
            raise ValueError("Legacy GeoJSON CRS requires an explicit matching source_crs.")
        if source_crs is not None and not declared_crs.equals(_crs(source_crs), ignore_axis_order=True):
            raise ValueError("Explicit source_crs conflicts with the GeoJSON CRS declaration.")
    items = obj.get("features", []) if obj.get("type") == "FeatureCollection" else [obj]
    candidates = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Malformed GeoJSON feature.")
        properties = item.get("properties") or {}
        if not isinstance(properties, dict):
            raise ValueError("Feature properties must be an object.")
        labels = [str(value) for value in (properties.get("name"), item.get("id")) if value is not None]
        geometry = item.get("geometry") if item.get("type") == "Feature" else item
        candidates.append({"labels": labels, "geometry": geometry})
    selected = _select(candidates, placemark)
    if not isinstance(selected["geometry"], dict):
        raise ValueError("Selected feature has no geometry.")
    _validate_rings(selected["geometry"])
    return selected["geometry"], {"selection": placemark or (selected["labels"] or [None])[0]}


def _kml(data: bytes, placemark: str | None):
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ValueError("Invalid KML XML.") from exc

    def local_name(tag):
        return tag.rsplit("}", 1)[-1]

    def descendants(element, name):
        return [node for node in element.iter() if local_name(node.tag) == name]

    def ring(boundary):
        coordinates = descendants(boundary, "coordinates")
        if len(coordinates) != 1 or not coordinates[0].text:
            raise ValueError("KML boundary requires one coordinate sequence.")
        try:
            points = [tuple(float(value) for value in part.split(","))
                      for part in coordinates[0].text.split()]
        except ValueError as exc:
            raise ValueError("Invalid KML coordinate.") from exc
        return points

    candidates = []
    for element in descendants(root, "Placemark"):
        polygons = descendants(element, "Polygon")
        if not polygons:
            continue
        names = [node.text.strip() for node in element if local_name(node.tag) == "name" and node.text]
        labels = names + ([element.attrib["id"]] if "id" in element.attrib else [])
        polygon_coordinates = []
        for polygon in polygons:
            exteriors = descendants(polygon, "outerBoundaryIs")
            if len(exteriors) != 1:
                raise ValueError("KML Polygon must have one exterior boundary.")
            polygon_coordinates.append([ring(exteriors[0])] +
                                       [ring(inner) for inner in descendants(polygon, "innerBoundaryIs")])
        geometry = ({"type": "Polygon", "coordinates": polygon_coordinates[0]} if len(polygons) == 1
                    else {"type": "MultiPolygon", "coordinates": polygon_coordinates})
        altitude_modes = sorted({node.text.strip() for node in descendants(element, "altitudeMode") if node.text})
        candidates.append({"labels": labels, "geometry": geometry, "altitude_modes": altitude_modes or ["clampToGround (default)"]})
    selected = _select(candidates, placemark)
    _validate_rings(selected["geometry"])
    return selected["geometry"], {"selection": placemark or (selected["labels"] or [None])[0],
                                  "altitude_modes": selected["altitude_modes"]}


def load_site(path: Path, source_crs: str | None = None, placemark: str | None = None) -> dict:
    """Import one Polygon/MultiPolygon from KML or GeoJSON without editing it."""
    path = Path(path).resolve()
    if path.suffix.lower() not in (".kml", ".geojson", ".json"):
        raise ValueError("Site input must be .kml, .geojson, or .json.")
    before = path.stat()
    if not path.is_file() or before.st_size > 50_000_000:
        raise ValueError("Site input must be a regular file no larger than 50 MB.")
    data = path.read_bytes()
    repeated = path.read_bytes()
    after = path.stat()
    if data != repeated or (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise ValueError("Source changed while being read; retry with a stable read-only reference.")
    input_crs = _crs(source_crs or "EPSG:4326")
    if path.suffix.lower() == ".kml":
        if not input_crs.equals(WGS84, ignore_axis_order=True):
            raise ValueError("KML coordinates are WGS84 longitude/latitude; projected overrides are invalid.")
        original, extra = _kml(data, placemark)
        format_name = "KML"
    else:
        original, extra = _geojson(data, placemark, source_crs)
        format_name = "GeoJSON"
    wgs84 = project_geometry(original, input_crs, WGS84)
    site_geometry = _geometry(wgs84)
    _scope(site_geometry)
    source = {"path": str(path), "sha256": hashlib.sha256(data).hexdigest(),
              "format": format_name, "crs": input_crs.to_string(), "crs_wkt": input_crs.to_wkt(),
              "coordinate_order": "x,y; WGS84 output is longitude,latitude",
              "height_converted": False, "height_handling": "Reference only; altitude discarded from horizontal geometry.",
              "read_only": True, **extra}
    return {"geometry": wgs84, "source": source,
            "checks": {"valid_geometry": True, "source_stable_during_read": True,
                       "wgs84_scope_checked": True}}


def site_from_center(lon: float, lat: float) -> dict:
    """Make a WGS84 point site; a positive context buffer is subsequently required."""
    if not _finite_number(lon) or not _finite_number(lat):
        raise ValueError("Centre longitude and latitude must be finite numbers.")
    geometry = Point(float(lon), float(lat))
    _scope(geometry)
    return {"geometry": mapping(geometry),
            "source": {"path": None, "sha256": None, "format": "centre", "crs": "EPSG:4326",
                       "coordinate_order": "longitude,latitude", "height_converted": False,
                       "height_handling": "No height supplied."},
            "checks": {"valid_geometry": True, "wgs84_scope_checked": True}}


def local_transform(context: dict) -> Transformer:
    """Return a WGS84 longitude/latitude -> local ground-metre transformer."""
    return _transformer(WGS84, context["local_crs_wkt"])


def build_context(site: dict, buffer_m: float = 500) -> dict:
    """Build a JSON-serializable site and context in WGS84 and local metres.

    Scope is deliberately local: +/-80 latitude, <=2 degrees across, no
    dateline crossing, and a finite buffer from 0 to 10,000 metres.
    """
    if not _finite_number(buffer_m) or not 0 <= buffer_m <= MAX_BUFFER_M:
        raise ValueError("buffer_m must be finite and between 0 and 10000 metres.")
    site_geometry = _horizontal(_geometry(site["geometry"]))
    if site_geometry.geom_type not in ("Polygon", "MultiPolygon", "Point"):
        raise ValueError("Site must be Polygon, MultiPolygon, or an explicit centre Point.")
    _scope(site_geometry)
    if site_geometry.geom_type == "Point" and buffer_m == 0:
        raise ValueError("A centre point requires a positive buffer.")
    origin = [float(site_geometry.centroid.x), float(site_geometry.centroid.y)]
    local_crs = CRS.from_proj4(f"+proj=aeqd +lat_0={origin[1]:.15g} +lon_0={origin[0]:.15g} +datum=WGS84 +units=m +no_defs")
    forward = _transformer(WGS84, local_crs)
    reverse = _transformer(local_crs, WGS84)
    local_site = transform_geometry(site_geometry, lambda x, y: forward.transform(x, y, errcheck=True), interleaved=False)
    local_context = local_site.buffer(float(buffer_m), quad_segs=64) if buffer_m else local_site
    wgs_context = transform_geometry(local_context, lambda x, y: reverse.transform(x, y, errcheck=True), interleaved=False)
    _geometry(mapping(local_context))
    _geometry(mapping(wgs_context))
    _scope(wgs_context)
    errors = []
    for lon, lat in _positions(mapping(site_geometry)):
        x, y = forward.transform(lon, lat, errcheck=True)
        restored_lon, restored_lat = reverse.transform(x, y, errcheck=True)
        errors.append(abs(GEOD.inv(lon, lat, restored_lon, restored_lat)[2]))
    max_error = max(errors, default=0.0)
    if not math.isfinite(max_error) or max_error > 0.01:
        raise ValueError("Local projection roundtrip exceeded the 1 cm tolerance.")
    return {"site_wgs84": mapping(site_geometry), "site_local": mapping(local_site),
            "context_wgs84": mapping(wgs_context), "context_local": mapping(local_context),
            "bbox_wgs84": list(wgs_context.bounds), "local_bounds": list(local_context.bounds),
            "origin": origin, "local_crs_wkt": local_crs.to_wkt(), "source": dict(site.get("source", {})),
            "checks": {**site.get("checks", {}), "valid_geometry": True,
                       "valid_context_geometry": True, "local_units": "metre", "buffer_m": float(buffer_m),
                       "height_converted": False, "roundtrip_max_error_m": max_error,
                       "site_area_m2": float(local_site.area), "context_area_m2": float(local_context.area),
                       "scope": "Local, nonpolar, no dateline crossing; maximum span 2 degrees."}}
