# Original author Daniel Kao. h/t dude!

import sys
import rasterio
import numpy
import subprocess
import json
import os
import time

# World Geodetic System 1984
crs = "EPSG:4326"

# The resolution to output the file
output_res = 50000

# Get node.js installation on this machine
p = subprocess.Popen(['which', 'node'], stdout=subprocess.PIPE)
node_exec = p.stdout.read().decode("utf-8").strip()
# npm install -g d3@6
subprocess.Popen(
	['npm', 'install', '--loglevel', 'silent', '--no-progress', '-g', 'd3@6'], 
	stdout=subprocess.PIPE
)
# Get global node path, make sure that we install d3 with
p = subprocess.Popen(['npm', 'root', '-g'], stdout=subprocess.PIPE)
node_path = p.stdout.read().decode("utf-8").strip()

# Write our node helper script out to file
node_script = open('albers.js', 'w')
script_lines = [
	"const d3 = require('d3'); \n", 
	"const radius = 6378137.0; \n", # radius of Earth in meters
	"const points = JSON.parse(process.argv[2]).map(d => d.map(e => parseFloat(e))); \n", 
	"const projection = d3.geoAlbersUsa().translate([0, 0]).scale(radius); \n",
	"console.log(JSON.stringify(points.map(point => projection.invert(point)))); \n"]
node_script.writelines(script_lines)
node_script.close()

# projects the points from albers to WGS84 by calling d3.geoAlbersUsa invert in node LOL
def albers_usa(points):
	p = subprocess.Popen(
		[node_exec, 'albers.js', json.dumps(points)], 
		env={'NODE_PATH': node_path},
		stdout=subprocess.PIPE
	)
	out = p.stdout.read()
	return [(point[0], point[1]) for point in json.loads(out)]


def project_albers(src, dataset, out_path):
	# radius of the earth in meters
	radius = 6378137

	# Get our transformed bbox
	projected_bounds = (
		-0.455 * radius, -0.238 * radius, 0.455 * radius, 0.238 * radius
	)
	projected_height = 0.238 * 2 * radius
	projected_width = 0.455 * 2 * radius

	# Do the geoAlbersUsa transform by looping through the array 
	# and mapping values over

	# ratio for albers projection from here: 
	# https://github.com/d3/d3-geo/blob/main/src/projection/albersUsa.js#L73
	albers_height = int(0.238 * output_res)
	albers_width = int(0.455 * output_res)

	last_progress = -1
	albers_dest = numpy.zeros((albers_height, albers_width), numpy.uint8)
	# Loop through all the y values
	for y in range(albers_height):
		# log the progress
		progress = int((y / albers_height) * 100)
		if (progress > last_progress and progress % 10 == 0):
			last_progress = progress
			print(str(progress) + "...", end='', flush=True)

		y_lat = projected_bounds[1] + y / albers_height * projected_height
		sample_points = []
		# Loop through all the x values
		for x in range(albers_width):
			x_lng = projected_bounds[0] + x / albers_width * projected_width
			sample_points.append([x_lng, y_lat])
		# get the longitude and latitude values
		unprojected_points = albers_usa(sample_points)
		# get the actual data
		point_data = [sample[0] for sample in dataset.sample(unprojected_points)]
		albers_dest[y] = point_data

		kwargs = src.meta.copy()
		kwargs.update({
			# Web Mercator CRS
			'crs': "EPSG:3857",
			'transform': rasterio.transform.from_bounds(*projected_bounds, albers_width, albers_height),
			'width': albers_width,
			'height': albers_height
		})

		# Write the new raster to a file
		with rasterio.open(out_path, 'w', **kwargs) as dst:
			dst.write(albers_dest, indexes=1)


# Reprojects the raster
def reproject_raster(in_path, out_path):
	# reproject raster to project crs
	with rasterio.open(in_path) as src:
		if str(src.crs) != crs:
			print("Converting from " + str(src.crs) + " to " + crs + "...")

			# First get the raster into EPSG:4326
			transform, width, height = rasterio._warp._calculate_default_transform(
				src.crs, crs, src.width, src.height, *src.bounds
			)	

			dest = numpy.zeros((height, width), numpy.uint8)

			rasterio._warp._reproject(
				source=rasterio.band(src, 1),
				destination=dest,
				src_transform=src.transform,
				src_crs=src.crs,
				dst_transform=transform,
				dst_crs=crs,
				resampling=rasterio.enums.Resampling.nearest
			)
			
			print("Reprojecting to AlbersUSA...")

			# save the reprojected data into a memfile we can work with
			with rasterio.io.MemoryFile() as memfile:
				with memfile.open(
					driver="GTiff", dtype="uint8", width=width, height=height, 
					crs=crs, transform=transform, count=1
				) as dataset:
					dataset.write(dest, indexes=1)
					project_albers(src, dataset, out_path)

		else:
			print("Reprojecting to AlbersUSA...")
			time.sleep(10)
			project_albers(src, src, out_path)


print("Reading " + sys.argv[1] + "...")
reproject_raster(sys.argv[1], sys.argv[2])

# Delete our albers script
os.remove("albers.js")
print("Done")
