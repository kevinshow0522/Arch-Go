# 地图获取与统一坐标

用于用户给出 KML、GeoJSON、经纬度，要求获取周边地图或建立场地底图的入口。当前数据源为 OSM 矢量与 Esri World Imagery。先读本机环境，使用技能目录的 `scripts/fetch_map_data.py`。下载、范围计算和坐标转换已实现；本模块不负责建筑拉高、道路加宽、地形或生成 SKP。

## 执行与衔接

1. 沿用已知位置、用地边界、外扩距离和用途。KML 经度在前、纬度在后，按 WGS84 读取；GeoJSON 默认 RFC 7946 WGS84，有明确原始投影时传 `--source-crs`。多个地块须明确选择 `--placemark`，不默默合并。已有 CAD 的坐标和几何基线仍按资料角色规则保护。
2. 区分三种范围：`site_boundary` 是用地参照，可单独标色；`context_boundary` 是用地向外的取数和裁切范围；`design_clear` 仅在用户明确要求清空时成立。用地边界、周边 500 米请求不触发设计范围清空版。
3. 在 [外部任务工作目录](output-lifecycle.md#外部任务工作目录) 中运行，输出为新的目录，禁止覆盖上次资料。先完成坐标准备，再访问 OSM 与 Esri；来源原文、查询、归属、时间、影像实际范围和文件校验值随工作记录保留。
4. 读取 `report.json`。`complete` 仅表示所选数据源获取成功，不能称为影像对齐、现状识别或模型验收通过。`partial` 保留成功部分，查明失败来源；`failed` 不伪称已有完整地图。`prepared` 是仅完成离线坐标和范围准备。命令退出码分别为 0（complete/prepared）、2（partial）、1（failed/输入错误）。
5. 叠合项目边界、路口和可辨地面边界检查影像配准；检查 OSM 编辑时间、影像采集时间及实际地物差异。建筑高度、道路宽度缺失时保留未知，道路中心线不能当作道路边界。通过实际识别再按片区／详图规则进入 CAD 构造或已有 CAD → SU 入口。地图资料不自动完成选面、推拉、原生 SKP 保存和重开。

命令示例（解释器使用本机环境中的绝对路径；以下脚本路径为技能目录内路径）：

```text
python scripts/fetch_map_data.py --kml "项目用地.kml" --buffer-m 500 --output "外部工作目录/maps/run-001"
python scripts/fetch_map_data.py --kml "项目用地.kml" --placemark "项目用地" --buffer-m 500 --prepare-only --output "外部工作目录/maps/prepare-001"
python scripts/fetch_map_data.py --geojson "已知投影.json" --source-crs EPSG:3857 --buffer-m 500 --output "外部工作目录/maps/run-002"
python scripts/fetch_map_data.py --center 116.2823 39.8595 --buffer-m 500 --providers osm esri --esri-size 1536 1536 --output "外部工作目录/maps/run-003"
```

中心点入口按点外扩，是圆形范围；“按用地边界向外 500 米”必须传实际用地多边形，不能以中心圆或矩形替代。下载使用范围包络框，OSM 输出另按实际缓冲多边形裁切。影像保留实际矩形覆盖范围，不把四角误称为缓冲边界。

## 坐标约定

| 数据 | 坐标及用途 |
|---|---|
| KML／OSM／`*_wgs84.geojson` | WGS84，经度、纬度；保存来源和地理定位 |
| Esri 请求与返回影像 | Web Mercator EPSG:3857；以返回的 extent、width、height 建立像素中心仿射关系 |
| `*_local.json` | 以用地附近为原点的 AEQD 局部东／北米制坐标，含明确 CRS WKT；用于缓冲、裁切及后续建模 |
| 后续 SketchUp | 若按毫米建模，局部米制 x/y 乘 1000；保持原点、北向、单位换算和地理参考记录 |

转换由 pyproj／PROJ 执行，始终采用 `always_xy=True`。先将已知源投影转换到 WGS84，再到局部 AEQD；保留原始文件和 SHA256、源 CRS、原点、局部 CRS 与往返误差。EPSG:3857 的单位名为米但比例随纬度变化，不能直接据此计算地面 500 米。局部 AEQD 适用于本模块的小范围场地；脚本限制缓冲不超过 10 千米，并拒绝跨日界线、极区及过大的用地。

KML 的高程仅保存为来源参考，不作为真实地面高程。GCJ-02、BD-09、未知坐标、未确认控制点不能改名后当成 WGS84；明确补齐来源／转换依据后再处理。投影往返误差小只证明转换一致，不能证明数据精度或影像与地界相符。

## 数据源与失败处理

**OSM**：使用 [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) 获取建筑、建筑部分、道路、土地利用、休闲绿地、水体、水道和铁路。保留原始 tags、对象 ID 和版本时间；支持多面关系和孔洞。关系成员缺失、无效几何等写入 QA；服务器返回超时 `remark` 不能当成完整结果。公共服务按 [资源说明](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) 使用有限次数重试，不轮换接口规避限额。成果保留 [© OpenStreetMap contributors／ODbL](https://www.openstreetmap.org/copyright) 归属。

**Esri**：使用 [World Imagery MapServer](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) 的公开服务元数据、一次 [export map](https://developers.arcgis.com/rest/services-reference/enterprise/export-map/) 及中心点 identify。影像返回范围可能因画幅比例改变，必须读实际 extent，不能只保存请求 bbox。保留服务版权、像素大小和影像资料查询；identify 是采样点／图层的来源、日期、分辨率及精度信息，不能推广为全范围的测绘精度。影像发布日期与采集日期分别读取；空日期保持未知。

当前服务 `exportTilesAllowed=false`，本模块不使用批量瓦片下载补救。export 被拒绝、超时、需令牌或授权范围不足时保留 OSM 和坐标成果，记录部分失败；可改用用户有权使用且有地理参考的影像，不抓取网页图片凑配准。公开访问不构成永久免费或任意用途授权，使用时保留并核对服务条款和归属。

可选 Esri 凭证只从当前进程环境变量 `MAP2MODEL_ESRI_TOKEN` 读取，不放在命令参数、技能文件或交付文件。脚本对返回链接、元数据与错误中的令牌脱敏。无需令牌可成功的公开服务继续直接访问，不要求用户先注册。

## 产物与复核

工作目录含原始来源、Overpass JSON／查询、WGS84 矢量、局部米制矢量、`coordinate_frame.json`、Esri 影像及 `esri_image_reference.json`、`report.json`、`attribution.txt`、`manifest.json`。米制文件使用 `.json` 并显式标识坐标系，避免被误读为 RFC 7946 经度／纬度 GeoJSON。

后续使用影像时，以实际 extent 与像素中心仿射建立像素→3857→WGS84→局部米制映射；矩形图层不能仅按局部四角线性拉伸就声称精确配准。保留有效工作记录供重做和追溯，交付仍按生命周期规则，仅将请求的 DWG／SKP 与有用的最终图片放入项目成果目录。

离线测试在 `tests/test_map_coordinates.py`、`tests/test_map_providers.py`、`tests/test_fetch_map_data.py`。网络实测与几何自动检查分别报告；公共服务连通不代表覆盖、时效或地物识别全部通过。
