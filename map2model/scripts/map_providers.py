"""Bounded, provenance-preserving OSM and World Imagery acquisition.

Only one Esri map export is requested; cached tiles/exportTiles are never used.
The private ``_open_url`` boundary may be replaced by an offline test transport.
References: https://overpass-api.de/api/interpreter
https://developers.arcgis.com/rest/services-reference/enterprise/export-map/
https://developers.arcgis.com/rest/services-reference/enterprise/identify-map-service/
"""
from datetime import datetime, timezone
import io
import json
import math
import re
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image
from shapely.geometry import LineString, MultiPolygon, Polygon, mapping
from shapely.ops import polygonize_full
from shapely.validation import explain_validity

OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
ESRI_ENDPOINT = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
MAX_RESPONSE_BYTES = 64 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4096
MAX_ATTEMPTS = 3
OSM_ATTRIBUTION = '© OpenStreetMap contributors; ODbL 1.0; https://www.openstreetmap.org/copyright'


class ProviderError(RuntimeError):
    """A safe provider failure: never includes upstream bodies or request URLs."""


def _same_origin(url, expected):
    parsed, reference = urlsplit(url), urlsplit(expected)
    return (parsed.scheme == 'https' and parsed.hostname == reference.hostname
            and parsed.port in (None, 443) and not parsed.username and not parsed.password)


class _SameHostRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        if not _same_origin(newurl, request.full_url):
            raise ProviderError('Provider redirect refused: HTTPS same-host required')
        return super().redirect_request(request, fp, code, message, headers, newurl)


_open_url = build_opener(_SameHostRedirect()).open


def _utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _bbox(values):
    if not isinstance(values, (list, tuple)) or len(values) != 4:
        raise ValueError('bbox must be [west, south, east, north] in WGS84')
    try:
        west, south, east, north = [float(x) for x in values]
    except (TypeError, ValueError):
        raise ValueError('bbox coordinates must be finite numbers') from None
    if not all(math.isfinite(x) for x in (west, south, east, north)):
        raise ValueError('bbox coordinates must be finite numbers')
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError('bbox must be ordered and within WGS84 bounds; split antimeridian areas')
    return west, south, east, north


def _timeout(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not (1 <= value <= 180):
        raise ValueError('timeout must be between 1 and 180 seconds')
    return float(value)


def _request(url, *, data=None, timeout_s=60):
    timeout = _timeout(timeout_s)
    request = Request(url, data=data, headers={
        'User-Agent': 'map2model/0.9.12 (bounded map export)',
        'Accept': 'application/json,image/png,image/jpeg', 'Accept-Encoding': 'identity'})
    for attempt in range(MAX_ATTEMPTS):
        try:
            with _open_url(request, timeout=timeout) as response:
                declared = response.headers.get('Content-Length')
                if declared and int(declared) > MAX_RESPONSE_BYTES:
                    raise ProviderError('Provider response exceeds 64 MiB limit')
                payload = response.read(MAX_RESPONSE_BYTES + 1)
                if len(payload) > MAX_RESPONSE_BYTES:
                    raise ProviderError('Provider response exceeds 64 MiB limit')
                return payload
        except HTTPError as error:
            # Do not interpolate HTTPError: its URL may carry a credential.
            retry = error.code in (429, 502, 503, 504)
            safe_error = 'Provider HTTP error {}'.format(error.code)
        except (socket.timeout, TimeoutError):
            retry, safe_error = True, 'Provider request timed out'
        except URLError as error:
            retry = isinstance(error.reason, (socket.timeout, TimeoutError))
            safe_error = 'Provider connection failed'
        except (OSError, ValueError):
            retry, safe_error = False, 'Provider response could not be read'
        if not retry or attempt == MAX_ATTEMPTS - 1:
            raise ProviderError(safe_error) from None
        time.sleep(min(2 ** attempt, 4))
    raise ProviderError('Provider request failed')


def _json_request(url, *, data=None, timeout_s=60):
    try:
        payload = json.loads(_request(url, data=data, timeout_s=timeout_s))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ProviderError('Provider returned invalid JSON') from None
    if not isinstance(payload, dict):
        raise ProviderError('Provider returned an unexpected JSON structure')
    if payload.get('error'):
        raise ProviderError('Provider returned a service error')
    return payload


def build_overpass_query(bbox_wgs84: list, timeout_s=60) -> str:
    west, south, east, north = _bbox(bbox_wgs84)
    seconds = math.ceil(_timeout(timeout_s))
    box = ','.join(format(x, '.12g') for x in (south, west, north, east))
    selectors = ('["building"]', '["building:part"]', '["highway"]', '["railway"]', '["waterway"]',
                 '["natural"~"^(water|wood|grassland|wetland|scrub|heath)$"]',
                 '["water"]', '["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|orchard|reservoir|basin)$"]',
                 '["leisure"~"^(park|garden|nature_reserve|golf_course)$"]')
    selections = '\n'.join('{}{}({});'.format(kind, selector, box)
                           for kind in ('way', 'relation') for selector in selectors)
    # Recursion supplies untagged member ways and nodes, even beyond the bbox.
    return '[out:json][timeout:{}];\n(\n{}\n);\n(._;>;);\nout meta geom;'.format(seconds, selections)


def _category(tags):
    if tags.get('building') not in (None, 'no') or tags.get('building:part') not in (None, 'no'):
        return 'building'
    if tags.get('highway'):
        return 'road'
    if tags.get('railway'):
        return 'rail'
    if (tags.get('natural') in ('water', 'wetland') or tags.get('water') or tags.get('waterway')
            or tags.get('landuse') in ('reservoir', 'basin')):
        return 'water'
    if (tags.get('natural') in ('wood', 'grassland', 'scrub', 'heath')
            or tags.get('landuse') in ('forest', 'grass', 'meadow', 'recreation_ground', 'village_green', 'orchard')
            or tags.get('leisure') in ('park', 'garden', 'nature_reserve', 'golf_course')):
        return 'green'
    return None


def _coordinates(element, nodes):
    geometry = element.get('geometry')
    if geometry is None:
        geometry = [nodes.get(ref) for ref in element.get('nodes', [])]
    coordinates = []
    for point in geometry:
        if not isinstance(point, dict) or point.get('lon') is None or point.get('lat') is None:
            return None
        try:
            lon, lat = float(point['lon']), float(point['lat'])
        except (TypeError, ValueError):
            return None
        if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90):
            return None
        coordinates.append((lon, lat))
    return coordinates if len(coordinates) >= 2 else None


def _feature(element, geometry, category, tags=None):
    source_id = '{}/{}'.format(element['type'], element['id'])
    history = {key: element[key] for key in ('timestamp', 'version', 'changeset') if key in element}
    return {'type': 'Feature', 'id': source_id, 'geometry': mapping(geometry),
            'properties': {'source_id': source_id, 'osm_type': element['type'],
                           'tags': dict(element.get('tags', {}) if tags is None else tags),
                           'category': category, **history}}


def parse_overpass(payload: dict) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get('elements'), list):
        raise ProviderError('Overpass payload has no elements array')
    if payload.get('remark'):
        raise ProviderError('Overpass reported an incomplete response; acquisition rejected')
    elements = payload['elements']
    nodes = {x['id']: x for x in elements if x.get('type') == 'node' and 'id' in x}
    ways = {x['id']: x for x in elements if x.get('type') == 'way' and 'id' in x}
    issues, features, consumed = [], [], set()

    def issue(code, element, **details):
        issues.append({'code': code, 'source_id': '{}/{}'.format(element.get('type'), element.get('id')), **details})

    for relation in (x for x in elements if x.get('type') == 'relation'):
        tags = relation.get('tags', {})
        if tags.get('type') != 'multipolygon':
            continue
        category = _category(tags)
        if category is None:
            continue
        grouped, member_ids, broken = {'outer': [], 'inner': []}, [], False
        for member in relation.get('members', []):
            role = member.get('role') or 'outer'
            if role not in grouped:
                continue
            if member.get('type') != 'way':
                issue('unsupported_relation_member', relation, member_ref=member.get('ref'))
                broken = True
                continue
            element = member if member.get('geometry') is not None else ways.get(member.get('ref'))
            coordinates = _coordinates(element, nodes) if element is not None else None
            if coordinates is None:
                issue('missing_member', relation, member_ref=member.get('ref'))
                broken = True
                continue
            grouped[role].append(LineString(coordinates))
            member_ids.append(member.get('ref'))
        if broken:
            continue
        rings = {}
        for role, lines in grouped.items():
            polygons, cuts, dangles, invalid = polygonize_full(lines)
            rings[role] = list(polygons.geoms)
            if not cuts.is_empty or not dangles.is_empty or not invalid.is_empty:
                issue('unclosed_or_invalid_rings', relation, role=role)
                broken = True
        if not rings['outer']:
            issue('missing_outer_ring', relation)
            broken = True
        if broken:
            continue
        shells = [Polygon(x.exterior.coords) for x in rings['outer']]
        assigned = [[] for _ in shells]
        for inner in rings['inner']:
            owners = [index for index, shell in enumerate(shells) if shell.contains(inner)]
            if len(owners) != 1:
                issue('unassigned_inner_ring', relation)
                broken = True
            else:
                assigned[owners[0]].append(inner.exterior.coords)
        polygons = [Polygon(shell.exterior.coords, holes) for shell, holes in zip(shells, assigned)]
        geometry = polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)
        if broken or not geometry.is_valid or geometry.is_empty or geometry.area <= 0:
            issue('invalid_geometry', relation, reason=explain_validity(geometry))
            continue
        features.append(_feature(relation, geometry, category))
        for ident in member_ids:
            member_way = ways.get(ident)
            if member_way is None:
                continue
            member_tags = member_way.get('tags', {})
            # Suppress only structural/same-feature members. An independently
            # tagged highway or other class survives a landuse/building relation.
            if _category(member_tags) == category and all(
                    key in ('type', 'source', 'source:geometry', 'note', 'fixme') or tags.get(key) == value
                    for key, value in member_tags.items()):
                consumed.add(ident)

    for ident, element in ways.items():
        category = _category(element.get('tags', {}))
        if category is None or ident in consumed:
            continue
        coordinates = _coordinates(element, nodes)
        if coordinates is None:
            issue('missing_way_geometry', element)
            continue
        tags = element.get('tags', {})
        is_area = category in ('building', 'green') or (category == 'water' and not tags.get('waterway'))
        if is_area:
            if len(coordinates) < 4 or coordinates[0] != coordinates[-1]:
                issue('unclosed_area', element)
                continue
            geometry = Polygon(coordinates)
        else:
            geometry = LineString(coordinates)
        if not geometry.is_valid or geometry.is_empty or (is_area and geometry.area <= 0):
            issue('invalid_geometry', element, reason=explain_validity(geometry))
            continue
        features.append(_feature(element, geometry, category))
    return {'type': 'FeatureCollection', 'features': features,
            'qa': {'status': 'partial' if issues else 'complete', 'issues': issues,
                   'feature_count': len(features), 'suppressed_member_ways': len(consumed),
                   'coordinate_reference': 'EPSG:4326', 'heights_widths': 'raw OSM tags only; no inferred geometry'}}


def fetch_osm(bbox_wgs84, timeout_s=60) -> dict:
    query = build_overpass_query(bbox_wgs84, timeout_s=timeout_s)
    payload = _json_request(OVERPASS_ENDPOINT, data=urlencode({'data': query}).encode('utf-8'), timeout_s=timeout_s)
    return {'raw': payload, 'geojson': parse_overpass(payload), 'query': query,
            'endpoint': OVERPASS_ENDPOINT, 'attribution': OSM_ATTRIBUTION, 'fetched_at': _utc_now()}


def _redact(value, token=None):
    if isinstance(value, dict):
        return {key: ('[REDACTED]' if str(key).lower() in (
            'token', 'access_token', 'apikey', 'api_key', 'authorization', 'password', 'secret')
            else _redact(item, token)) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(item, token) for item in value]
    if isinstance(value, str):
        if token:
            for secret in {token, quote(token, safe=''), urlencode({'v': token})[2:]}:
                value = value.replace(secret, '[REDACTED]')
        return re.sub(r'(?i)(\b(?:token|access_token|api_key|apikey|secret|password)=)[^&\s\"\'<>]+',
                      r'\1[REDACTED]', value)
    return value


def _service_url(path, parameters, token):
    values = dict(parameters)
    if token:
        values['token'] = token
    return ESRI_ENDPOINT + path + '?' + urlencode(values)


def fetch_esri(bbox_wgs84, width=1536, height=1536, token=None) -> dict:
    west, south, east, north = _bbox(bbox_wgs84)
    if south < -85.05112878 or north > 85.05112878:
        raise ValueError('World Imagery export requires Web Mercator latitude bounds')
    for size in (width, height):
        if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_IMAGE_DIMENSION:
            raise ValueError('Image dimensions must be integers from 1 to 4096')
    if token is not None and (not isinstance(token, str) or not token.strip()):
        raise ValueError('Esri token must be a nonempty string when supplied')
    try:
        metadata = _json_request(_service_url('', {'f': 'json'}, token))
    except ProviderError as error:
        raise ProviderError('Esri service metadata acquisition failed: {}'.format(error)) from None
    metadata['status'] = 'complete'
    metadata['scope'] = 'service_metadata; no area-specific imagery date inferred'
    try:
        max_width = int(metadata.get('maxImageWidth', 4096))
        max_height = int(metadata.get('maxImageHeight', 4096))
    except (TypeError, ValueError):
        raise ProviderError('Esri service has invalid image limits') from None
    if width > max_width or height > max_height:
        raise ProviderError('Requested image dimensions exceed Esri service limits')
    try:
        from pyproj import Transformer
    except ImportError:
        raise ProviderError('pyproj is required for Esri Web Mercator projection') from None
    transformer = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
    xmin, ymin = transformer.transform(west, south)
    xmax, ymax = transformer.transform(east, north)
    export = _json_request(_service_url('/export', {
        'f': 'json', 'bbox': ','.join(format(x, '.12g') for x in (xmin, ymin, xmax, ymax)),
        'bboxSR': '3857', 'imageSR': '3857', 'size': '{},{}'.format(width, height),
        'format': 'png32', 'transparent': 'false'}, token))
    href = export.get('href')
    if not isinstance(href, str) or not _same_origin(href, ESRI_ENDPOINT):
        raise ProviderError('Esri image URL refused: HTTPS same-host required')
    try:
        actual_width, actual_height = export['width'], export['height']
        if any(isinstance(size, bool) or not isinstance(size, int) or size < 1 or size > MAX_IMAGE_DIMENSION
               for size in (actual_width, actual_height)):
            raise ValueError
        extent = export['extent']
        axmin, aymin, axmax, aymax = [float(extent[key]) for key in ('xmin', 'ymin', 'xmax', 'ymax')]
        if not all(math.isfinite(x) for x in (axmin, aymin, axmax, aymax)) or axmax <= axmin or aymax <= aymin:
            raise ValueError
        sr = extent['spatialReference']
        if sr.get('latestWkid', sr.get('wkid')) not in (3857, 102100, 102113):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise ProviderError('Esri export has invalid actual dimensions, extent or spatial reference') from None
    coverage_tolerance_m = 0.05
    if (axmin > xmin + coverage_tolerance_m or aymin > ymin + coverage_tolerance_m
            or axmax < xmax - coverage_tolerance_m or aymax < ymax - coverage_tolerance_m):
        raise ProviderError('Esri actual export extent does not cover the requested area')
    image_bytes = _request(href)
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.size != (actual_width, actual_height) or image.format not in ('PNG', 'JPEG'):
                raise ValueError
            image_format = image.format
            image.verify()
    except Exception:
        raise ProviderError('Esri image bytes do not match the returned export dimensions or format') from None
    pixel_x, pixel_y = (axmax - axmin) / actual_width, -(aymax - aymin) / actual_height
    affine = [pixel_x, 0.0, 0.0, pixel_y, axmin + pixel_x / 2, aymax + pixel_y / 2]
    export.update({'status': 'complete', 'pixel_world_affine': affine,
                   'image_format': image_format, 'image_extension': '.png' if image_format == 'PNG' else '.jpg',
                   'world_file_order': ['A', 'D', 'B', 'E', 'C', 'F'],
                   'world_file_lines': '\n'.join(format(x, '.15g') for x in affine) + '\n',
                   'pixel_origin': 'center of upper-left pixel; columns right, rows down',
                   'crs': 'EPSG:3857', 'requested_bbox_wgs84': [west, south, east, north],
                   'acquisition_mode': 'single_map_export', 'bulk_tiles_requested': False})
    try:
        identify = _json_request(_service_url('/identify', {
            'f': 'json', 'geometry': '{},{}'.format((axmin + axmax) / 2, (aymin + aymax) / 2),
            'geometryType': 'esriGeometryPoint', 'sr': '3857', 'tolerance': 1,
            'mapExtent': ','.join(format(x, '.12g') for x in (axmin, aymin, axmax, aymax)),
            'imageDisplay': '{},{},96'.format(actual_width, actual_height),
            'returnGeometry': 'false', 'layers': 'all'}, token))
        if not isinstance(identify.get('results'), list):
            raise ProviderError('Esri identify has no results array')
        field_groups = {'source': [], 'date': [], 'resolution': [], 'accuracy': []}
        for result in identify['results']:
            for key, value in result.get('attributes', {}).items():
                if value is None or str(value).strip().lower() in ('', 'null', 'none', 'nodata', 'n/a'):
                    continue
                normalized = re.sub(r'[^a-z0-9]', '', key.lower())
                group = None
                if 'date' in normalized:
                    group = 'date'
                elif 'resolution' in normalized or normalized in ('srcres', 'srcresol'):
                    group = 'resolution'
                elif 'accuracy' in normalized or normalized == 'srcacc':
                    group = 'accuracy'
                elif normalized in ('source', 'srcdesc', 'srcname', 'sourcedescription', 'sourcename', 'sensorname'):
                    group = 'source'
                if group:
                    field_groups[group].append({'layer_id': result.get('layerId'), 'field': key, 'value': value})
        missing_fields = [group for group, fields in field_groups.items() if not fields]
        identify['source_metadata_fields'] = field_groups
        identify['missing_source_fields'] = missing_fields
        identify['status'] = 'partial' if missing_fields else 'complete'
        identify['scope'] = 'center_point_only; source dates/resolution/accuracy apply only as returned'
        if not identify['results']:
            identify['error'] = 'No source metadata returned at center; date/resolution/accuracy remain unknown'
        elif missing_fields:
            identify['error'] = 'Center identify does not supply all source/date/resolution/accuracy fields'
    except ProviderError as error:
        identify = {'status': 'partial', 'results': [], 'error': str(error),
                    'scope': 'center_point_metadata_unavailable; image export succeeded'}
    attribution = metadata.get('copyrightText') or 'Esri World Imagery; source attribution unavailable'
    return _redact({'image_bytes': image_bytes, 'metadata': metadata, 'export': export,
                    'identify': identify, 'endpoint': ESRI_ENDPOINT, 'attribution': attribution,
                    'fetched_at': _utc_now()}, token)
