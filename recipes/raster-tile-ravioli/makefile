FILENAME=filename

run:
	make gtiff2TileDir
	make directory2MbTiles
	make mbTiles2proto

gtiff2TileDir:
	gdal2tiles.py \
		$(FILENAME).tif \
		-z 10-14 \
		$(FILENAME)

# Need to install mb-util globally for this to work.
# https://github.com/mapbox/mbutil
directory2MbTiles:
	rm -r $(FILENAME).mbtiles
	mb-util $(FILENAME) $(FILENAME).mbtiles --image_format=png

mbTiles2proto:
	pmtiles convert $(FILENAME).mbtiles $(FILENAME).pmtiles

# -------------------------- #
# Additional things tried...
# -------------------------- #

# This uses gdal_translate to create mbtiles. Could work, 
# but it makes a *lot* of assumptions in regards to zoom
# level and overall file size, without a good way to
# change once it's a mbtile file.

gdalConvert:
	gdal_translate \
		$(FILENAME).tif \
		$(FILENAME).mbtiles \
		-of MBTILES


# Tippecanoe doesn't work with raster tiles, womp womp.

# $ tippecanoe -zg -o out.mbtiles --drop-densest-as-needed in.geojson


# Supposidly this allows for more control over zoom levels 
# using gdal alone. Don't 

# gdal_translate -of mbtiles -co "TILE_FORMAT=PNG8" -co "ZLEVEL=9" "Level 19.tif" "mapbase.mbtiles"
# gdaladdo -r nearest -oo "TILE_FORMAT=PNG8" -oo "ZLEVEL=9" "mapbase.mbtiles" 2 4
# gdal_translate -of mbtiles -co "TILE_FORMAT=PNG8" -co "ZLEVEL=9" "Level 16.tif" "mapbase low.mbtiles"
# gdaladdo -r nearest -oo "TILE_FORMAT=PNG8" -oo "ZLEVEL=9" "mapbase low.mbtiles" 2 4 8 16
# echo ATTACH "mapbase low.mbtiles" AS low; INSERT INTO main.tiles SELECT * FROM low.tiles; | sqlite3 "mapbase.mbtiles"
