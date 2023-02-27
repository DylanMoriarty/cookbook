PROJ="+proj=ortho +lat_0=35 +lon_0=-90 +x_0=0 +y_0=0 +a=6371000 +b=6371000 +units=m +no_defs"
COLORSCALE=""

# Defining an addtl. path for ease of the .gitignore.
ROUTE=cooking
FILES=$(basename $(notdir $(wildcard $(ROUTE)/data/*)))

# The -B forces it to run even when the command matches
# already exists.
factory:
	make -B fetch
	make -B info
	make -B process
	make -B projWGS
	make -B proj
	make -B color
	make -B jpg
	make -B crop
	make -B text
	make -B legend
	make -B gif
	make -B vid

# Removes all the process 
scruffy:
	rm -r $(ROUTE)/gtiff
	rm -r $(ROUTE)/projWGS
	rm -r $(ROUTE)/proj
	rm -r $(ROUTE)/color
	rm -r $(ROUTE)/jpg
	rm -r $(ROUTE)/crop
	rm -r $(ROUTE)/overlay
	rm -r $(ROUTE)/text
	rm -r $(ROUTE)/resize
	rm -r $(ROUTE)/final

# Additionally scrubs the data folder 
cleanup:
	rm -r $(ROUTE)/data
	make scruffy

# This pulls wind speed data, units are m/s
fetch:
	mkdir -p $(ROUTE)
	mkdir -p $(ROUTE)/data
	node ingredients/fetch.js $(ROUTE)

# This doesn't need to be a loop, but it gives
# you the band/layer info for each gtiff 
# downloaded. Use for "process" step.
# use gdalsrsinfo for projection info
info:
	for f in $(FILES); do \
		echo $$f; \
		echo $(ROUTE)/data/$$f.nc4; \
		echo cooking/data/02260000.nc4; \
		gdalinfo $(ROUTE)/data/$$f.nc4; \
	done

# Convert from nc4 file to gtiff. 
process:
	mkdir -p $(ROUTE)/gtiff
	for f in $(FILES); do \
		gdal_translate \
			-of NetCDF \
			NETCDF:"$(ROUTE)/data/$$f.nc4":TLML \
			$(ROUTE)/gtiff/$$f.tif; \
	done

# File doesn't come with a proj, but it's
# in WGS. This assigns that proj to it.
projWGS:
	mkdir -p $(ROUTE)/projWGS
	for f in $(FILES); do \
		gdalwarp \
		$(ROUTE)/gtiff/$$f.tif \
		$(ROUTE)/projWGS/$$f.tif \
		-t_srs "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs"; \
	done

# Now that gdal can tell what the proj
# is, can convert it to the orthographic
# proj. Great!
proj:
	mkdir -p $(ROUTE)/proj
	for f in $(FILES); do \
		gdalwarp \
		$(ROUTE)/projWGS/$$f.tif \
		$(ROUTE)/proj/$$f.tif \
		-t_srs $(PROJ); \
	done

# Create a color scale and color each
# tiff by it.
color:
	mkdir -p $(ROUTE)/color
	node ingredients/gdaldem-color-maker.js > colorScale.txt
	for f in $(FILES); do \
		gdaldem \
			color-relief \
			-alpha \
			$(ROUTE)/proj/$$f.tif \
			colorScale.txt \
			$(ROUTE)/color/$$f.tif; \
	done

# Convert each image into a jpg...
jpg:
	mkdir -p $(ROUTE)/jpg
	for f in $(FILES); do \
		convert $(ROUTE)/color/$$f.tif $(ROUTE)/jpg/$$f.jpg; \
	done

# Crop to better fit the overlay file, and then
# overlay that image.
crop: 
	mkdir -p $(ROUTE)/crop
	mkdir -p $(ROUTE)/overlay
	for f in $(FILES); do \
		convert $(ROUTE)/jpg/$$f.jpg -coalesce -repage 0x0  -gravity North -crop 963x720+0+0 +repage $(ROUTE)/crop/$$f.jpg; \
		convert $(ROUTE)/crop/$$f.jpg -coalesce null: ingredients/overlay-map.png -gravity center -layers composite $(ROUTE)/overlay/$$f.jpg; \
	done

# Append text to each image.
text:
	mkdir -p $(ROUTE)/text
	node ingredients/timestamp.js $(ROUTE)

# Recrop for the legend overlay, and 
# add that into it. This step should
# be baked into crop, but that's for
# next time.
legend:
	mkdir -p $(ROUTE)/resize
	mkdir -p $(ROUTE)/final
	for f in $(FILES); do \
		convert $(ROUTE)/text/$$f.jpg -resize 963x720 -background white -gravity South -extent 963x880 $(ROUTE)/resize/$$f.jpg; \
		convert $(ROUTE)/resize/$$f.jpg -coalesce null: ingredients/overlay-legend.png -gravity center -layers composite $(ROUTE)/final/$$f.jpg; \
	done

# Convert that into a gif!
gif:
	convert -delay 15 -loop 0 $(ROUTE)/final/*.jpg gif.gif

# and finally convert that gif into a video
vid:
	ffmpeg -i gif.gif -crf 12 -pix_fmt yuv420p -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2:color=white" -y temps.mp4




# wind:
# 	mkdir -p wind-overlay
# 	for f in $(FILES); do \
# 		convert jpg/$$f.jpg -coalesce null: winds/$$f.png -gravity center -layers composite wind-overlay/$$f.jpg; \
# 	done


# gdalwarp translated/$$i.tif projected/$$i.tif -t_srs "+proj=robin +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"; \


# gif:
# 	mkdir -p jpgUS
# 	mkdir -p jpgChina
# 	for f in $(CHINAFILES); do \
# 		convert coloChina/$$f.tif jpgChina/$$f.jpg; \
# 	done
# 	for f in $(USFILES); do \
# 		convert coloUS/$$f.tif jpgUS/$$f.jpg; \
# 	done
# 	convert -delay 15 -loop 0 jpgUS/*.jpg gifUS.gif
# 	convert -delay 15 -loop 0 jpgChina/*.jpg gifChina.gif
# 	convert gifChina.gif -coalesce null: overlay.png -gravity center -layers composite out-pacific.gif
# 	convert gifUS.gif -coalesce null: overlay-us.png -gravity center -layers composite out-us.gif


# overlay:
# 	convert gif.gif -coalesce null: overlay-us.png -gravity center -layers composite out-us.gif

# magick 
# convert 
# circle.png inner.png -gravity Center -geometry 256x256+30+5 -composite -resize 64x64 output.png

	
# mkdir -p latLngFix
# for f in $(FILES); do \
# 	gdalwarp -t_srs WGS84 \
# 	projd/$$f.tif \
# 	latLngFix/$$f.tif \
# 	-wo SOURCE_EXTRA=1000 \
# 	--config CENTER_LONG 180; \
# done


