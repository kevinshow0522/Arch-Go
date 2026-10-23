"""Offline provider contract tests; HTTP is the only replaced boundary."""
import importlib.util
import io
import json
from pathlib import Path
import socket
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from PIL import Image
from shapely.geometry import shape

MODULE = Path(__file__).resolve().parents[1] / 'scripts' / 'map_providers.py'


def way(ident, coordinates, tags=None):
    return {'type': 'way', 'id': ident, 'tags': tags or {},
            'geometry': [{'lon': x, 'lat': y} for x, y in coordinates]}


class Response(io.BytesIO):
    headers = {}


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE.exists(), 'provider implementation is missing')
        spec = importlib.util.spec_from_file_location('providers_under_test', MODULE)
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)

    def test_query_converts_lon_lat_bbox_and_recurses_members(self):
        query = self.m.build_overpass_query([116.2, 39.8, 116.3, 39.9])
        self.assertIn('(39.8,116.2,39.9,116.3)', query)
        self.assertIn('relation', query)
        self.assertIn('building', query)
        self.assertIn('highway', query)
        self.assertIn('["building:part"]', query)
        self.assertIn('out meta geom', query)
        with self.assertRaises(ValueError):
            self.m.build_overpass_query([116.3, 39.8, 116.2, 39.9])

    def test_roads_remain_lines_and_height_is_only_raw_tag(self):
        result = self.m.parse_overpass({'elements': [
            way(1, [(0, 0), (1, 0), (1, 1), (0, 0)], {'highway': 'residential'}),
            way(2, [(2, 0), (3, 0), (3, 1), (2, 0)], {'building': 'yes', 'height': '12 m'})]})
        self.assertEqual(result['features'][0]['geometry']['type'], 'LineString')
        props = result['features'][1]['properties']
        self.assertEqual(props['tags']['height'], '12 m')
        self.assertNotIn('height', props)
        self.assertNotIn('width', result['features'][0]['properties'])

    def test_osm_preserves_returned_object_timestamp_and_version(self):
        element = way(2, [(2, 0), (3, 0), (3, 1), (2, 0)], {'building': 'yes'})
        element.update({'timestamp': '2025-01-01T00:00:00Z', 'version': 7})
        props = self.m.parse_overpass({'elements': [element]})['features'][0]['properties']
        self.assertEqual(props.get('timestamp'), '2025-01-01T00:00:00Z')
        self.assertEqual(props.get('version'), 7)

    def test_split_outer_relation_keeps_hole_and_deduplicates_members(self):
        elements = [way(1, [(0, 0), (4, 0), (4, 4)]),
                    way(2, [(0, 0), (0, 4), (4, 4)]),
                    way(3, [(1, 1), (2, 1), (2, 2), (1, 2), (1, 1)], {'building': 'yes'}),
                    {'type': 'relation', 'id': 10, 'tags': {'type': 'multipolygon', 'building': 'yes'},
                     'members': [{'type': 'way', 'ref': 1, 'role': 'outer'},
                                 {'type': 'way', 'ref': 2, 'role': 'outer'},
                                 {'type': 'way', 'ref': 3, 'role': 'inner'}]}]
        result = self.m.parse_overpass({'elements': elements})
        self.assertEqual(len(result['features']), 1)
        feature = result['features'][0]
        self.assertEqual(feature['id'], 'relation/10')
        polygon = shape(feature['geometry'])
        self.assertEqual(polygon.area, 15)
        self.assertEqual(len(polygon.interiors), 1)
        self.assertEqual(result['qa']['status'], 'complete')

    def test_missing_relation_member_does_not_create_filled_polygon(self):
        result = self.m.parse_overpass({'elements': [
            way(1, [(0, 0), (4, 0), (4, 4)]),
            {'type': 'relation', 'id': 10, 'tags': {'type': 'multipolygon', 'building': 'yes'},
             'members': [{'type': 'way', 'ref': 1, 'role': 'outer'},
                         {'type': 'way', 'ref': 99, 'role': 'outer'}]}]})
        self.assertEqual(result['features'], [])
        self.assertEqual(result['qa']['status'], 'partial')
        self.assertTrue(any(x['code'] == 'missing_member' for x in result['qa']['issues']))

    def test_relation_dedup_preserves_independently_tagged_road(self):
        coordinates = [(0, 0), (4, 0), (4, 4), (0, 4), (0, 0)]
        result = self.m.parse_overpass({'elements': [way(1, coordinates, {'highway': 'service'}),
            {'type': 'relation', 'id': 2, 'tags': {'type': 'multipolygon', 'landuse': 'grass'},
             'members': [{'type': 'way', 'ref': 1, 'role': 'outer'}]}]})
        self.assertEqual({f['properties']['category'] for f in result['features']}, {'road', 'green'})

    def test_invalid_building_is_reported_without_repair_invention(self):
        result = self.m.parse_overpass({'elements': [
            way(1, [(0, 0), (2, 2), (0, 2), (2, 0), (0, 0)], {'building': 'yes'})]})
        self.assertEqual(result['features'], [])
        self.assertEqual(result['qa']['status'], 'partial')

    def test_remark_rejects_overpass_partial_response(self):
        with self.assertRaises(self.m.ProviderError):
            self.m.parse_overpass({'elements': [], 'remark': 'runtime error: Query timed out'})

    def test_node_references_support_geometry_and_other_categories(self):
        payload = {'elements': [
            {'type': 'node', 'id': 1, 'lon': 0, 'lat': 0},
            {'type': 'node', 'id': 2, 'lon': 1, 'lat': 0},
            {'type': 'way', 'id': 4, 'nodes': [1, 2], 'tags': {'railway': 'rail'}},
            way(5, [(2, 0), (3, 0)], {'waterway': 'stream'})]}
        result = self.m.parse_overpass(payload)
        self.assertEqual([x['properties']['category'] for x in result['features']], ['rail', 'water'])

    def test_osm_retries_transient_errors_without_changing_endpoint(self):
        calls = []
        def fake(request, timeout):
            calls.append(request.full_url)
            if len(calls) < 3:
                raise HTTPError(request.full_url, 503, 'unavailable', {}, None)
            return Response(b'{"elements": []}')
        with patch.object(self.m, '_open_url', fake), patch.object(self.m.time, 'sleep'):
            result = self.m.fetch_osm([116.2, 39.8, 116.3, 39.9])
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(set(calls)), 1)
        self.assertEqual(result['geojson']['qa']['status'], 'complete')

    def test_timeout_retries_stop_after_three_attempts(self):
        calls = []
        def fake(request, timeout):
            calls.append(request.full_url)
            raise socket.timeout('sensitive upstream text')
        with patch.object(self.m, '_open_url', fake), patch.object(self.m.time, 'sleep'):
            with self.assertRaises(self.m.ProviderError):
                self.m.fetch_osm([116.2, 39.8, 116.3, 39.9])
        self.assertEqual(len(calls), 3)

    def test_osm_retries_bad_gateway_then_returns_response(self):
        calls = []
        def fake(request, timeout):
            calls.append(request.full_url)
            if len(calls) == 1:
                raise HTTPError(request.full_url, 502, 'Bad Gateway', {}, None)
            return Response(b'{"elements": []}')
        with patch.object(self.m, '_open_url', fake), patch.object(self.m.time, 'sleep'):
            result = self.m.fetch_osm([116.2, 39.8, 116.3, 39.9])
        self.assertEqual(result['geojson']['qa']['status'], 'complete')
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(set(calls)), 1)

    def esri_transport(self, *, identify_error=False, export_error=False, hostile_href=False):
        calls = []
        image = io.BytesIO()
        Image.new('RGB', (10, 5), 'green').save(image, format='PNG')
        def fake(request, timeout):
            url = request.full_url
            calls.append(url)
            path = urlsplit(url).path
            if path.endswith('/export'):
                if export_error:
                    return Response(b'{"error":{"code":403,"message":"No export token=TOPSECRET"}}')
                return Response(json.dumps({'href': ('https://evil.test/image.png' if hostile_href else
                    'https://services.arcgisonline.com/image.png?token=TOPSECRET'),
                    'width': 10, 'height': 5, 'extent': {'xmin': -10, 'ymin': -20, 'xmax': 190,
                     'ymax': 80, 'spatialReference': {'wkid': 102100, 'latestWkid': 3857}},
                    'scale': 1500}).encode())
            if path.endswith('/identify'):
                if identify_error:
                    return Response(b'{"error":{"code":403,"message":"bad token TOPSECRET"}}')
                return Response(json.dumps({'results': [{'layerId': 4, 'layerName': 'Imagery Metadata',
                    'attributes': {'Source': 'Maxar', 'AcquisitionDate': '2024-03-06',
                                   'Resolution': '0.3', 'Accuracy': '5 m', 'Token': 'TOPSECRET'}}]}).encode())
            if path.endswith('/image.png'):
                return Response(image.getvalue())
            return Response(json.dumps({'currentVersion': 11.1, 'maxImageWidth': 2048,
                'maxImageHeight': 2048, 'exportTilesAllowed': False,
                'copyrightText': 'Esri, Maxar', 'serviceDescription': 'token=TOPSECRET'}).encode())
        return fake, calls

    def test_esri_uses_actual_extent_dimensions_and_source_date(self):
        fake, calls = self.esri_transport()
        with patch.object(self.m, '_open_url', fake):
            result = self.m.fetch_esri([0, 0, 0.001, 0.0005], token='TOPSECRET')
        self.assertEqual(result['export']['pixel_world_affine'], [20.0, 0.0, 0.0, -20.0, 0.0, 70.0])
        self.assertEqual(result['export']['width'], 10)
        self.assertEqual(result['export']['height'], 5)
        self.assertEqual(result['identify']['results'][0]['attributes']['AcquisitionDate'], '2024-03-06')
        exported = next(u for u in calls if urlsplit(u).path.endswith('/export'))
        query = parse_qs(urlsplit(exported).query)
        self.assertEqual(query['bboxSR'], ['3857'])
        self.assertEqual(query['imageSR'], ['3857'])
        self.assertAlmostEqual(float(query['bbox'][0].split(',')[2]), 111.319490793, places=5)
        self.assertEqual(sum('/export?' in u for u in calls), 1)
        self.assertFalse(any('/tile/' in u or '/exportTiles' in u for u in calls))

    def test_esri_exposes_verified_image_format_for_safe_filename(self):
        fake, _ = self.esri_transport()
        with patch.object(self.m, '_open_url', fake):
            result = self.m.fetch_esri([0, 0, 0.001, 0.0005])
        self.assertEqual(result['export'].get('image_extension'), '.png')
        self.assertEqual(result['export'].get('image_format'), 'PNG')

    def test_esri_metadata_failure_names_scope_without_upstream_text(self):
        def fake(request, timeout):
            return Response(b'{"error":{"message":"token=TOPSECRET"}}')
        with patch.object(self.m, '_open_url', fake):
            with self.assertRaises(self.m.ProviderError) as context:
                self.m.fetch_esri([0, 0, 0.001, 0.0005], token='TOPSECRET')
        self.assertIn('metadata', str(context.exception).lower())
        self.assertNotIn('TOPSECRET', str(context.exception))

    def test_esri_source_metadata_missing_date_marks_identify_partial(self):
        fake, _ = self.esri_transport()
        def without_date(request, timeout):
            response = fake(request, timeout)
            if urlsplit(request.full_url).path.endswith('/identify'):
                data = json.loads(response.getvalue())
                del data['results'][0]['attributes']['AcquisitionDate']
                return Response(json.dumps(data).encode())
            return response
        with patch.object(self.m, '_open_url', without_date):
            result = self.m.fetch_esri([0, 0, 0.001, 0.0005])
        self.assertEqual(result['identify']['status'], 'partial')
        self.assertIn('date', result['identify']['missing_source_fields'])

    def test_esri_dimension_validation_happens_before_any_request(self):
        with patch.object(self.m, '_open_url', side_effect=AssertionError('unexpected request')):
            for value in (0, -1, 4097, 1.5, True):
                with self.assertRaises(ValueError):
                    self.m.fetch_esri([0, 0, 0.001, 0.0005], width=value)

    def test_esri_rejects_actual_extent_that_drops_requested_area(self):
        fake, calls = self.esri_transport()
        def truncated(request, timeout):
            response = fake(request, timeout)
            if urlsplit(request.full_url).path.endswith('/export'):
                data = json.loads(response.getvalue())
                data['extent']['xmax'] = 100
                return Response(json.dumps(data).encode())
            return response
        with patch.object(self.m, '_open_url', truncated):
            with self.assertRaises(self.m.ProviderError) as context:
                self.m.fetch_esri([0, 0, 0.001, 0.0005])
        self.assertIn('cover', str(context.exception).lower())
        self.assertEqual(len(calls), 2)

    def test_same_host_redirect_policy_refuses_credentials_leak(self):
        from urllib.request import Request
        policy = self.m._SameHostRedirect()
        with self.assertRaises(self.m.ProviderError):
            policy.redirect_request(Request('https://server.arcgisonline.com/a?token=SECRET'),
                                    None, 302, '', {}, 'https://evil.test/image?token=SECRET')

    def test_esri_redacts_token_in_all_persistable_metadata(self):
        fake, _ = self.esri_transport()
        with patch.object(self.m, '_open_url', fake):
            result = self.m.fetch_esri([0, 0, 0.001, 0.0005], token='TOPSECRET')
        persistable = {k: v for k, v in result.items() if k != 'image_bytes'}
        self.assertNotIn('TOPSECRET', json.dumps(persistable))
        self.assertIn('REDACTED', result['export']['href'])

    def test_esri_identify_failure_is_explicit_partial_scope(self):
        fake, _ = self.esri_transport(identify_error=True)
        with patch.object(self.m, '_open_url', fake):
            result = self.m.fetch_esri([0, 0, 0.001, 0.0005], token='TOPSECRET')
        self.assertEqual(result['identify']['status'], 'partial')
        self.assertTrue(result['image_bytes'])
        self.assertNotIn('TOPSECRET', json.dumps(result['identify']))

    def test_esri_export_failure_has_no_tile_fallback_and_safe_error(self):
        fake, calls = self.esri_transport(export_error=True)
        with patch.object(self.m, '_open_url', fake):
            with self.assertRaises(self.m.ProviderError) as context:
                self.m.fetch_esri([0, 0, 0.001, 0.0005], token='TOPSECRET')
        self.assertNotIn('TOPSECRET', str(context.exception))
        self.assertEqual(len(calls), 2)

    def test_esri_refuses_cross_host_image_href(self):
        fake, calls = self.esri_transport(hostile_href=True)
        with patch.object(self.m, '_open_url', fake):
            with self.assertRaises(self.m.ProviderError):
                self.m.fetch_esri([0, 0, 0.001, 0.0005], token='TOPSECRET')
        self.assertEqual(len(calls), 2)

    def test_esri_refuses_size_larger_than_service_limit(self):
        fake, calls = self.esri_transport()
        with patch.object(self.m, '_open_url', fake):
            with self.assertRaises(self.m.ProviderError):
                self.m.fetch_esri([0, 0, 0.001, 0.0005], width=4096)
        self.assertEqual(len(calls), 1)

    def test_oversize_http_response_is_rejected(self):
        with patch.object(self.m, '_open_url', return_value=Response(b'x' * 1025)), \
                patch.object(self.m, 'MAX_RESPONSE_BYTES', 1024):
            with self.assertRaises(self.m.ProviderError):
                self.m.fetch_osm([116.2, 39.8, 116.3, 39.9])


if __name__ == '__main__':
    unittest.main()
