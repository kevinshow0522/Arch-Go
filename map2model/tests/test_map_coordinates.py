"""Behavioral checks for bounded, read-only map coordinate preparation."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from map_coordinates import (
    build_context,
    load_site,
    local_transform,
    project_geometry,
    site_from_center,
)
from pyproj import Geod
from shapely.geometry import shape


OUTER = [[116.30, 39.80], [116.31, 39.80], [116.31, 39.81],
         [116.30, 39.81], [116.30, 39.80]]
HOLE = [[116.303, 39.803], [116.303, 39.807], [116.307, 39.807],
        [116.307, 39.803], [116.303, 39.803]]
POLYGON = {"type": "Polygon", "coordinates": [OUTER, HOLE]}


class CoordinateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def geojson(self, obj=POLYGON, name="site.geojson"):
        path = self.folder / name
        path.write_text(json.dumps(obj), encoding="utf-8")
        return path

    def test_geojson_load_preserves_holes_provenance_and_source_bytes(self):
        path = self.geojson()
        original = path.read_bytes()
        site = load_site(path)
        self.assertEqual(len(shape(site["geometry"]).interiors), 1)
        self.assertEqual(shape(site["geometry"]).bounds, (116.30, 39.80, 116.31, 39.81))
        self.assertEqual(site["source"]["sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(site["source"]["path"], str(path.resolve()))
        self.assertEqual(site["source"]["crs"], "EPSG:4326")
        self.assertEqual(path.read_bytes(), original)

    def test_kml_load_preserves_holes_and_records_unconverted_altitude(self):
        path = self.folder / "site.kml"
        path.write_text('''<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2">
        <Document><Placemark><name>Site A</name><Polygon><altitudeMode>absolute</altitudeMode>
        <outerBoundaryIs><LinearRing><coordinates>
        116.30,39.80,25 116.31,39.80,26 116.31,39.81,27 116.30,39.81,28 116.30,39.80,25
        </coordinates></LinearRing></outerBoundaryIs>
        <innerBoundaryIs><LinearRing><coordinates>
        116.303,39.803,25 116.303,39.807,25 116.307,39.807,25 116.307,39.803,25 116.303,39.803,25
        </coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark></Document></kml>''', encoding="utf-8")
        site = load_site(path)
        self.assertEqual(len(shape(site["geometry"]).interiors), 1)
        self.assertFalse(shape(site["geometry"]).has_z)
        self.assertIn("absolute", site["source"]["altitude_modes"])
        self.assertFalse(site["source"]["height_converted"])

    def test_multiple_features_require_unique_named_selection(self):
        collection = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"name": "A"}, "geometry": POLYGON},
            {"type": "Feature", "properties": {"name": "B"}, "geometry": POLYGON}]}
        path = self.geojson(collection)
        with self.assertRaises(ValueError):
            load_site(path)
        self.assertEqual(load_site(path, placemark="B")["source"]["selection"], "B")
        with self.assertRaises(ValueError):
            load_site(path, placemark="missing")

    def test_multipolygon_is_supported_as_one_site(self):
        second = [[116.32, 39.80], [116.321, 39.80], [116.321, 39.801],
                  [116.32, 39.801], [116.32, 39.80]]
        site = load_site(self.geojson({"type": "MultiPolygon", "coordinates": [[OUTER, HOLE], [second]]}))
        self.assertEqual(len(shape(site["geometry"]).geoms), 2)

    def test_kml_selection_requires_unique_placemark_and_supports_multigeometry(self):
        path = self.folder / "many.kml"
        polygon = ('<Polygon><outerBoundaryIs><LinearRing><coordinates>'
                   '116.30,39.80 116.31,39.80 116.31,39.81 116.30,39.80'
                   '</coordinates></LinearRing></outerBoundaryIs></Polygon>')
        other = polygon.replace('116.3', '116.4')
        path.write_text('<kml><Document><Placemark><name>A</name>' + polygon +
                        '</Placemark><Placemark id="site-b"><name>B</name><MultiGeometry>' +
                        polygon + other + '</MultiGeometry></Placemark></Document></kml>', encoding="utf-8")
        with self.assertRaises(ValueError):
            load_site(path)
        site = load_site(path, placemark="site-b")
        self.assertEqual(len(shape(site["geometry"]).geoms), 2)
        self.assertEqual(site["source"]["selection"], "site-b")

    def test_explicit_3857_source_converts_known_lon_lat_values(self):
        polygon = {"type": "Polygon", "coordinates": [[[0, 0], [111319.49079327357, 0],
                   [111319.49079327357, 111325.1428663851], [0, 111325.1428663851], [0, 0]]]}
        path = self.geojson(polygon)
        with self.assertRaises(ValueError):
            load_site(path)
        site = load_site(path, source_crs="EPSG:3857")
        self.assertAlmostEqual(shape(site["geometry"]).bounds[2], 1.0, places=9)
        self.assertAlmostEqual(shape(site["geometry"]).bounds[3], 1.0, places=9)
        self.assertEqual(site["source"]["crs"], "EPSG:3857")

    def test_declared_non_rfc_crs_requires_matching_explicit_source(self):
        obj = {"type": "Feature", "properties": {}, "geometry": POLYGON,
               "crs": {"type": "name", "properties": {"name": "EPSG:3857"}}}
        with self.assertRaises(ValueError):
            load_site(self.geojson(obj))
        with self.assertRaises(ValueError):
            load_site(self.geojson(obj), source_crs="EPSG:4326")

    def test_unknown_or_offset_crs_is_never_guessed(self):
        path = self.geojson()
        for crs in ("GCJ-02", "BD09", "unknown", "EPSG:5703"):
            with self.subTest(crs=crs), self.assertRaises(ValueError):
                load_site(path, source_crs=crs)

    def test_kml_crs_cannot_be_overridden_as_projected(self):
        path = self.folder / "site.kml"
        path.write_text('<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>'
                        '116.30,39.80 116.31,39.80 116.31,39.81 116.30,39.80'
                        '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>', encoding="utf-8")
        with self.assertRaises(ValueError):
            load_site(path, source_crs="EPSG:3857")

    def test_invalid_or_nonfinite_geometry_is_rejected(self):
        cases = [
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]]},
            {"type": "Polygon", "coordinates": [[[0, 0], [math.nan, 0], [1, 1], [0, 0]]]},
            {"type": "Polygon", "coordinates": []},
            {"type": "Point", "coordinates": [116.3, 39.8]},
        ]
        for obj in cases:
            with self.subTest(obj=obj), self.assertRaises(ValueError):
                load_site(self.geojson(obj))

    def test_malformed_or_unclosed_polygon_coordinates_have_clear_value_errors(self):
        cases = [
            {"type": "Polygon"},
            {"type": "Polygon", "coordinates": None},
            {"type": "Polygon", "coordinates": [None]},
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]]},
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0, 0]]]},
        ]
        for obj in cases:
            with self.subTest(obj=obj), self.assertRaises(ValueError):
                load_site(self.geojson(obj))

    def test_file_changed_during_read_is_rejected(self):
        path = self.geojson()
        original_read = Path.read_bytes
        reads = 0

        def changing_read(target):
            nonlocal reads
            result = original_read(target)
            if target == path.resolve():
                reads += 1
                if reads == 1:
                    target.write_bytes(result + b" ")
            return result

        with patch.object(Path, "read_bytes", changing_read), self.assertRaises(ValueError):
            load_site(path)

    def test_point_500m_buffer_is_in_ground_metres_and_wgs84_lonlat(self):
        context = build_context(site_from_center(116.3, 39.8), buffer_m=500)
        polygon = shape(context["context_wgs84"])
        geod = Geod(ellps="WGS84")
        for lon, lat in polygon.exterior.coords:
            _, _, distance = geod.inv(116.3, 39.8, lon, lat)
            self.assertAlmostEqual(distance, 500.0, delta=0.02)
        self.assertAlmostEqual(shape(context["context_local"]).area, math.pi * 500 ** 2, delta=500)
        self.assertEqual(context["origin"], [116.3, 39.8])
        self.assertLess(context["bbox_wgs84"][0], 116.3)
        self.assertGreater(context["bbox_wgs84"][3], 39.8)
        self.assertLess(context["checks"]["roundtrip_max_error_m"], 0.001)
        json.dumps(context, allow_nan=False)

    def test_polygon_holes_survive_projection_and_zero_buffer(self):
        context = build_context(load_site(self.geojson()), buffer_m=0)
        self.assertEqual(len(shape(context["site_local"]).interiors), 1)
        self.assertEqual(len(shape(context["context_wgs84"]).interiors), 1)
        self.assertTrue(shape(context["context_local"]).equals(shape(context["site_local"])))

    def test_metric_polygon_buffer_retains_large_hole_and_expands_bounds(self):
        context = build_context(load_site(self.geojson()), buffer_m=20)
        site = shape(context["site_local"])
        expanded = shape(context["context_local"])
        self.assertEqual(len(expanded.interiors), 1)
        self.assertAlmostEqual(expanded.bounds[0], site.bounds[0] - 20, delta=0.05)
        self.assertAlmostEqual(expanded.bounds[2], site.bounds[2] + 20, delta=0.05)

    def test_local_transform_origin_and_roundtrip_do_not_swap_axes(self):
        context = build_context(site_from_center(116.3, 39.8))
        transformer = local_transform(context)
        x, y = transformer.transform(116.3, 39.8)
        self.assertAlmostEqual(x, 0.0, places=6)
        self.assertAlmostEqual(y, 0.0, places=6)
        east_x, east_y = transformer.transform(116.301, 39.8)
        self.assertGreater(east_x, 80)
        self.assertLess(abs(east_y), 0.01)

    def test_project_geometry_converts_in_both_directions_without_height_conversion(self):
        projected = project_geometry(POLYGON, "EPSG:4326", "EPSG:3857")
        self.assertGreater(shape(projected).bounds[0], 12_000_000)
        restored = project_geometry(projected, "EPSG:3857", "EPSG:4326")
        self.assertLess(shape(restored).hausdorff_distance(shape(POLYGON)), 1e-10)
        three_d = {"type": "Point", "coordinates": [116.3, 39.8, 42]}
        self.assertEqual(len(project_geometry(three_d, "EPSG:4326", "EPSG:3857")["coordinates"]), 2)

    def test_invalid_buffers_centres_and_unsupported_scope_are_rejected(self):
        for distance in (-1, 10001, math.nan, math.inf):
            with self.subTest(distance=distance), self.assertRaises(ValueError):
                build_context(site_from_center(116.3, 39.8), distance)
        with self.assertRaises(ValueError):
            build_context(site_from_center(116.3, 39.8), 0)
        for lon, lat in ((math.nan, 39), (116, 81), (181, 39), (39, 116)):
            with self.subTest(lon=lon, lat=lat), self.assertRaises(ValueError):
                site_from_center(lon, lat)
        for ring in (
            [[179.9, 0], [-179.9, 0], [-179.9, 0.1], [179.9, 0.1], [179.9, 0]],
            [[0, 0], [5, 0], [5, 1], [0, 1], [0, 0]],
        ):
            with self.subTest(ring=ring), self.assertRaises(ValueError):
                load_site(self.geojson({"type": "Polygon", "coordinates": [ring]}))


if __name__ == "__main__":
    unittest.main()
