"""Acquire OSM / Esri source material and a reproducible local metre frame.

No CAD geometry repair, road widths, extrusion heights, or SKP export happens here.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote, quote_plus

from shapely import force_2d, transform
from shapely.geometry import mapping, shape

from map_coordinates import build_context, load_site, local_transform, site_from_center
from map_providers import fetch_esri, fetch_osm


def _safe(value, secret=None):
    if isinstance(value, dict):
        return {str(k): ('[REDACTED]' if str(k).lower() in
                {'token', 'access_token', 'api_key', 'apikey', 'authorization', 'password', 'secret'} else _safe(v, secret))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_safe(v, secret) for v in value]
    if isinstance(value, str):
        if secret:
            for encoded in {secret, quote(secret, safe=''), quote_plus(secret)}:
                value = value.replace(encoded, '[REDACTED]')
        return re.sub(r'(?i)([?&](?:token|access_token|api_?key)=)[^&\s"<>]+',
                      r'\1[REDACTED]', value)
    return value


def _write_json(path, value, secret=None):
    with path.open('x', encoding='utf-8') as handle:
        json.dump(_safe(value, secret), handle, ensure_ascii=False,
                  allow_nan=False, indent=2)
        handle.write('\n')


def _local_features(geojson, context):
    transformer = local_transform(context)
    clip = shape(context['context_local'])
    features, issues = [], []
    for item in geojson['features']:
        try:
            geometry = transform(force_2d(shape(item['geometry'])),
                                 transformer.transform, interleaved=False)
            if not geometry.is_valid:
                raise ValueError('invalid projected geometry')
            geometry = geometry.intersection(clip)
            if not geometry.is_empty:
                features.append({**item, 'geometry': mapping(geometry)})
        except (ValueError, TypeError, KeyError) as exc:
            issues.append({'id':item.get('id'), 'error':str(exc)})
    return {
        'type':'FeatureCollection',
        'coordinate_space':{'crs_wkt':context['local_crs_wkt'], 'units':'metre',
                            'axis_order':'east,north', 'origin_wgs84':context['origin']},
        'features':features,
        'qa':{'issues':issues, 'input_count':len(geojson['features']),
              'clipped_count':len(features)},
    }


def acquire(args):
    """Write one new acquisition directory; return its explicit status report."""
    source_path = args.kml or args.geojson
    if source_path:
        source_path = Path(source_path).resolve(strict=True)
        site = load_site(source_path, source_crs=args.source_crs, placemark=args.placemark)
    else:
        if args.source_crs or args.placemark:
            raise ValueError('--source-crs/--placemark require a file input')
        site = site_from_center(*args.center)
    context = build_context(site, args.buffer_m)
    output = Path(args.output).resolve()
    if source_path and (output == source_path or output in source_path.parents):
        raise ValueError('Output must not contain or replace the source file')
    # Existing outputs are evidence; never merge a new run into them.
    output.mkdir(parents=True, exist_ok=False)
    raw_dir = output/'raw'
    raw_dir.mkdir()
    secret = os.environ.get('MAP2MODEL_ESRI_TOKEN') or None
    report = {
        'schema_version':1, 'created_at':datetime.now(timezone.utc).isoformat(),
        'status':'prepared', 'buffer_m':args.buffer_m,
        'source':context['source'], 'providers':{},
        'checks':{'coordinates':context['checks'], 'imagery_registration':'not_run',
                  'semantic_review':'pending', 'cad':'not_run', 'skp':'not_run'},
        'scope_roles':{'site_boundary':'user_reference_and_highlight',
                       'context_boundary':'acquisition_and_clipping',
                       'design_clear':'not_requested'},
    }
    if source_path:
        original = source_path.read_bytes()
        if hashlib.sha256(original).hexdigest() != context['source']['sha256']:
            raise ValueError('Source changed after coordinate preparation; retry with a stable file')
        with (raw_dir/('site_source'+source_path.suffix.lower())).open('xb') as handle:
            handle.write(original)
    _write_json(output/'coordinate_frame.json', context)
    _write_json(output/'context_wgs84.geojson', {
        'type':'FeatureCollection', 'features':[
            {'type':'Feature','properties':{'role':role},'geometry':context[key]}
            for role,key in [('site_boundary','site_wgs84'),('context_boundary','context_wgs84')]]})
    _write_json(output/'context_local.json', {
        'type':'FeatureCollection',
        'coordinate_space':{'crs_wkt':context['local_crs_wkt'], 'units':'metre',
                            'axis_order':'east,north', 'origin_wgs84':context['origin']},
        'features':[
            {'type':'Feature','properties':{'role':role},'geometry':context[key]}
            for role,key in [('site_boundary','site_local'),('context_boundary','context_local')]]})
    attributions = []
    if not args.prepare_only:
        for provider in args.providers:
            try:
                if provider == 'osm':
                    result = fetch_osm(context['bbox_wgs84'])
                    _write_json(raw_dir/'overpass.json', result['raw'], secret)
                    (raw_dir/'overpass.query.txt').write_text(result['query'], encoding='utf-8')
                    _write_json(output/'osm_wgs84.geojson', result['geojson'], secret)
                    local = _local_features(result['geojson'], context)
                    _write_json(output/'osm_local.json', local, secret)
                    partial = (result['geojson'].get('qa',{}).get('status') == 'partial'
                               or bool(local['qa']['issues']))
                    report['providers']['osm'] = {
                        'status':'partial' if partial else 'complete',
                        'fetched_at':result['fetched_at'], 'endpoint':result['endpoint'],
                        'source_count':len(result['geojson']['features']),
                        'clipped_count':len(local['features']), 'qa':result['geojson'].get('qa',{}),
                        'local_qa':local['qa']}
                elif provider == 'esri':
                    result = fetch_esri(context['bbox_wgs84'], *args.esri_size, token=secret)
                    # Provider validates image decoding; original bytes stay unmodified.
                    extension = result['export'].get('image_extension', 'jpg').lstrip('.')
                    if extension not in ('jpg','jpeg','png'):
                        raise ValueError('Unsupported Esri image format')
                    image_path = 'esri_imagery.'+extension
                    (output/image_path).write_bytes(result['image_bytes'])
                    _write_json(raw_dir/'esri_service.json', result['metadata'], secret)
                    _write_json(raw_dir/'esri_identify.json', result['identify'], secret)
                    _write_json(output/'esri_image_reference.json', result['export'], secret)
                    partial = result['identify'].get('status') in ('partial','failed')
                    report['providers']['esri'] = {
                        'status':'partial' if partial else 'complete',
                        'fetched_at':result['fetched_at'], 'endpoint':result['endpoint'],
                        'image_path':image_path,
                        'image_reference':'esri_image_reference.json',
                        'registration':'pending_visual_review'}
                else:
                    raise ValueError('Unsupported provider')
                attributions.append(result['attribution'])
            except Exception as exc:
                report['providers'][provider] = {'status':'failed',
                                                'error':_safe(str(exc), secret)}
        statuses = [r['status'] for r in report['providers'].values()]
        report['status'] = ('complete' if statuses and all(s=='complete' for s in statuses)
                            else 'failed' if not statuses or all(s=='failed' for s in statuses)
                            else 'partial')
        report['checks']['imagery_registration'] = (
            'pending_visual_review' if report['providers'].get('esri',{}).get('image_path') else 'not_run')
    (output/'attribution.txt').write_text('\n'.join(attributions)+
        '\nSource geometry and imagery require separate visual / temporal review.\n', encoding='utf-8')
    _write_json(output/'report.json', report, secret)
    manifest = {'schema_version':1, 'sha256':{
        path.relative_to(output).as_posix():hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(output.rglob('*')) if path.is_file()}}
    _write_json(output/'manifest.json', manifest)
    return _safe(report, secret)


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument('--kml')
    source.add_argument('--geojson')
    source.add_argument('--center', type=float, nargs=2, metavar=('LON','LAT'))
    result.add_argument('--source-crs', help='Known GeoJSON CRS; default RFC7946 WGS84')
    result.add_argument('--placemark', help='Select named KML placemark / GeoJSON feature')
    result.add_argument('--buffer-m', type=float, default=500)
    result.add_argument('--output', required=True, help='New work directory; cannot already exist')
    result.add_argument('--providers', nargs='+', choices=['osm','esri'], default=['osm','esri'])
    result.add_argument('--esri-size', nargs=2, type=int, default=[1536,1536], metavar=('WIDTH','HEIGHT'))
    result.add_argument('--prepare-only', action='store_true', help='Offline scope / coordinate preparation')
    return result


def main():
    try:
        report = acquire(parser().parse_args())
    except Exception as exc:
        print(_safe(str(exc), os.environ.get('MAP2MODEL_ESRI_TOKEN')), file=sys.stderr)
        return 1
    print(json.dumps({'status':report['status'], 'providers':report['providers']}, ensure_ascii=False))
    return 0 if report['status'] in ('complete','prepared') else 2 if report['status']=='partial' else 1


if __name__ == '__main__':
    sys.exit(main())
