const chroma = require('chroma-js')

// WIND SPEED
// Based on Beaufort Wind Scale
// https://www.weather.gov/mfl/beaufort
const mphValues = [
  0,
  10, // gentle breeze
  20, // Small trees swaying
  30, // Moderate gale, walking against wind harder
  40, // Twigs breaking
  50, // Roof shingles getting removed, minimal damage to buildings
  60, // Trees uprooted
  70, // Widespread damage + destruction
  100 // null data
]

// Convert above to meters per second.
const msValues = mphValues.map((mph) => { return mph * 0.447})
const windColors = ['#d5f7f6', '#aae8e3', '#85dce5', '#6fc0dd', '#71a3db', '#718cd8', '#fff']

// TEMPERATURE, Farenhiet
const CValues = [
  -35,
  -28,
  -14,
  -7,
  0,
  7,
  16.9579,
  24.6107,
  35
]
const celciusToKelvin = CValues.map((temp) => { return (temp + 273.15)})
// const farenToKelvin = FValues.map((temp) => { return ((temp + 459.67) * (5 / 9))})
// const celciusValues = FValues.map((temp) => { return (temp - 32) * (5 / 9)})
const tempColors = ['#000000', '253a70', '#6593c5', '#b0e6f3', '#fff', '#d9f8bc', '#eed900', '#f27300',  '#78221b']
// const tempColors = ['#6313e2', '#2046e5', '#2399e2', '#2bccc7', '#98ce30', '#d8d200', '#e09500', '#ce3a00']

const colorScale = chroma.scale(tempColors)
let colorsArray = []

const stops = celciusToKelvin.length
for (let i = 0; i < stops; i++) {
  const color = colorScale(i / stops).rgb()
  colorsArray.push(color)
}

let string = ''
colorsArray.forEach((c, i) => {
  string = string + celciusToKelvin[i] + ',' + colorsArray[i] + (i === stops - 1 ? '' : '\n')
})

console.log(string)
