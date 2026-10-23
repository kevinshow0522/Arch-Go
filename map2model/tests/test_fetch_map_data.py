import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
SCRIPT = ROOT / 'scripts' / 'fetch_map_data.py'


class FetchMapDataTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('map_fetch_cli', SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'site.geojson'
        self.source.write_text(json.dumps({'type': 'Polygon', 'coordinates': [[
            [116.28175,39.85972], [116.28280,39.85972],
            [116.28280,39.85935], [116.28175,39.85935],
            [116.28175,39.85972]]]}), encoding='utf-8')

    def args(self, **updates):
        values = dict(kml=None, geojson=str(self.source), center=None,
                      source_crs=None, placemark=None, buffer_m=500,
                      output=str(self.root/'result'), providers=['osm','esri'],
                      prepare_only=True, esri_size=[512,512])
        values.update(updates)
        return argparse.Namespace(**values)

    def test_prepare_preserves_source_and_declares_pending_reviews(self):
        original = self.source.read_bytes()
        result = self.module.acquire(self.args())
        self.assertEqual(result['status'], 'prepared')
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(result['checks']['imagery_registration'], 'not_run')
        self.assertEqual(result['checks']['skp'], 'not_run')
        out = self.root/'result'
        local = json.loads((out/'context_local.json').read_text(encoding='utf-8'))
        self.assertEqual(local['coordinate_space']['units'], 'metre')
        manifest = json.loads((out/'manifest.json').read_text(encoding='utf-8'))
        for name, digest in manifest['sha256'].items():
            self.assertEqual(hashlib.sha256((out/name).read_bytes()).hexdigest(), digest)

    def test_existing_output_cannot_overwrite_input(self):
        with self.assertRaises((FileExistsError, ValueError)):
            self.module.acquire(self.args(output=str(self.root)))
        self.assertTrue(self.source.exists())

    def test_osm_kept_when_esri_fails_and_no_invented_width_or_height(self):
        osm = {'raw': {'elements': []}, 'query':'test', 'endpoint':'https://test/',
               'attribution':'OpenStreetMap contributors', 'fetched_at':'test',
               'geojson': {'type':'FeatureCollection', 'qa':{'status':'complete'},
                'features':[{'type':'Feature','id':'way/1', 'properties': {
                    'category':'road', 'tags':{'highway':'residential'}},
                    'geometry':{'type':'LineString','coordinates':[
                        [116.2817,39.8595],[116.283,39.8595]]}}]}}
        with patch.object(self.module, 'fetch_osm', return_value=osm), \
             patch.object(self.module, 'fetch_esri', side_effect=RuntimeError('service unavailable')):
            result = self.module.acquire(self.args(prepare_only=False))
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['providers']['osm']['status'], 'complete')
        self.assertEqual(result['providers']['esri']['status'], 'failed')
        local = json.loads((self.root/'result'/'osm_local.json').read_text(encoding='utf-8'))
        road = local['features'][0]
        self.assertEqual(road['geometry']['type'], 'LineString')
        self.assertNotIn('height', road['properties'])
        self.assertNotIn('width', road['properties'])

    def test_token_not_saved_when_provider_error_echoes_it(self):
        with patch.dict('os.environ', {'MAP2MODEL_ESRI_TOKEN':'sensitive-test-token'}), \
             patch.object(self.module, 'fetch_esri', side_effect=RuntimeError('token=sensitive-test-token')):
            result = self.module.acquire(self.args(prepare_only=False, providers=['esri']))
        self.assertEqual(result['status'], 'failed')
        for path in (self.root/'result').rglob('*'):
            if path.is_file():
                self.assertNotIn(b'sensitive-test-token', path.read_bytes())

    def test_image_extension_and_partial_metadata_are_preserved(self):
        image = {'image_bytes':b'validated-provider-image',
                 'metadata':{'status':'complete'}, 'identify':{'status':'partial'},
                 'export':{'image_extension':'.png', 'extent':{'xmin':1}},
                 'attribution':'Esri', 'fetched_at':'test', 'endpoint':'https://test/'}
        with patch.object(self.module, 'fetch_esri', return_value=image):
            report = self.module.acquire(self.args(prepare_only=False, providers=['esri']))
        self.assertEqual(report['status'], 'partial')
        self.assertEqual(report['providers']['esri']['image_path'], 'esri_imagery.png')
        self.assertTrue((self.root/'result'/'esri_imagery.png').is_file())
        self.assertEqual(report['checks']['imagery_registration'], 'pending_visual_review')
        self.assertEqual(report['checks']['skp'], 'not_run')

    def test_encoded_secrets_are_removed(self):
        self.assertNotIn('a%2Fb%2Bc', self.module._safe('token=a%2Fb%2Bc', 'a/b+c'))


if __name__ == '__main__':
    unittest.main()
