const moment = require('moment')
const fs = require('fs')
const converter = require('json-2-csv')

const args = process.argv.slice(2);
const startDate = moment(args[0])
const endDate = moment(args[1])
const periods = args[2]

if (24 % periods) {
	console.log('---------------------------------------------------------------')
	console.log('!! Please choose a period that can divide 24 w/ no remainder !!')
	console.log('---------------------------------------------------------------')
	return
}

const URL = [
	'ftp://ftp.ncep.noaa.gov/pub/data/nccf/com/rtma/prod/rtma2p5.',
	'/rtma2p5.t',
	'z.2dvaranl_ndfd.grb2_wexp'
]

const getDaysBetweenDates = function(startDate, endDate) {
	const now = startDate.clone()
	const dates = []

	while (now.isSameOrBefore(endDate)) {
		dates.push(now.format('YYYYMMDD'))
		now.add(1, 'days')
	}

	return dates
}

const dateList = getDaysBetweenDates(startDate, endDate)
const toCsv = []

// for (var i = 0; i < periods; i++) {
// 	if ()
// }

dateList.forEach((d) => {
	const hours = (24 / periods)

	for (let i = hours; i >= 1; i--) {
		let hour = (i > 0 ? 24 - (periods * i) : 0)

		console.log(hour, hours, i)

		if (hour < 10) {
			hour = '0' + hour
		}

		const URLBuilder = URL[0] + d + URL[1] + hour + URL[2]

		toCsv.push({'date': URLBuilder})
	}
})

converter.json2csv(toCsv, (err, csv) => {
	if (err) { throw err }

	fs.writeFile('dates.csv', csv)
})
