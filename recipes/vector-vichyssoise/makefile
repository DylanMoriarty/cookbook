run:
	make fetch
	make clean
	make tiles

# ----------
# Fetch
# Useful if pulling data off of Dropbox, or if you
# anticipate the data changing before the pub date.
# Unneccesary if you just want to build off local 
# data. Example below
# ----------

fetch:
	mkdir -p 0-rawData
	wget https://www2.census.gov/geo/tiger/TIGER2022/CD/tl_2022_us_cd116.zip -P 0-rawData
	unzip -o 0-rawData/tl_2022_us_cd116.zip -d 0-rawData
	rm 0-rawData/tl_2022_us_cd116.zip

# ----------
# Clean
# Use mapshaper to reduce the fields, clip, or
# simplify as much as desired. 
# ----------

clean:
	mkdir -p cleaned
	mapshaper \
		0-rawData/tl_2022_us_cd116.shp \
		-each STFIPS=STATEFP \
		-each FIPS=GEOID \
		-each 'NAME=(Number(CD116FP) > 0 ? String(Number(CD116FP)) : "At Large")' \
		-filter-fields NAME,FIPS,STFIPS \
		-o cleaned/districts.json

# ----------
# TILES
# ----------

tiles:
	mkdir -p tiles	
	tippecanoe \
		-f \
		--named-layer=us-districts:cleaned/districts.json \
		--read-parallel \
		--no-polygon-splitting \
		--no-tile-size-limit \
		--drop-rate=0 \
		--minimum-zoom 0 \
		--maximum-zoom 12 \
		--name=us-boundaries \
		--output tiles/county-borders.pmtiles

