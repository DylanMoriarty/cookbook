const fetch = require('node-fetch')
const urlExist = require("url-exist");

const {promisify} = require('util');
const {writeFile} = require('fs');
const writeFilePromise = promisify(writeFile);

let basepath = ''

if(process.argv.length > 2) {
  basepath = process.argv[2]
}

// SETTINGS
const startDate = new Date('Feb 28, 2023, 20:00')
const endDate = new Date('Feb 28, 2023, 24:00')
const src = 'RTMA' // RTMA, GFS, or GOESFP
const frequency = 1

let currentDate = startDate

if (src === 'GFS') {
  console.log('This will take awhile - files are huge. Good time to make some tea.')
}

downloadLoop()

async function downloadLoop() {
  if(currentDate <= endDate) { 
    const monthNum = currentDate.getMonth() + 1
    const month = (monthNum > 9 ? `${monthNum}` : `0${monthNum}`)
    const dayNum = currentDate.getDate()
    const day = (dayNum > 9 ? dayNum : `0${dayNum}`)
    const hourNum = currentDate.getHours()
    const year = 2023

    if(src === 'GOESFP') {
      const hour = (hourNum > 9 ? `${hourNum}00` : `0${hourNum}00`)
      const outpath = `${basepath}/data/${month}${day}${hour}.nc4`

      const url = `https://portal.nccs.nasa.gov/datashare/gmao/geos-fp/das/Y${year}/M${month}/D${day}/GEOS.fp.asm.inst1_2d_lfo_Nx.2023${month}${day}_${hour}.V01.nc4`

      console.log('starting download', url)
      await download(url, outpath)
      console.log('finished downloading')
    
    } else if (src === 'RTMA') {
      const hour = (hourNum > 9 ? `${hourNum}` : `0${hourNum}`)
      const outpath = `${basepath}/data/${month}${day}${hour}.grb2`

      const url = `https://nomads.ncep.noaa.gov/pub/data/nccf/com/rtma/prod/rtma2p5.${year}${month}${day}/rtma2p5.t${hour}z.2dvaranl_ndfd.grb2_wexp`

      console.log('starting download', url)
      await download(url, outpath)
      console.log('finished downloading')
    } else if (src === 'GFS') {
      const hour = (hourNum > 9 ? `${hourNum}` : `0${hourNum}`)
      const outpath = `${basepath}/data/${month}${day}${hour}.grb2`

      // check if present or future
      const timeAtDownload = new Date()

      if(currentDate <= timeAtDownload) {
        console.log('past date')
      } else {
        const timeZoneDiff = new Date(timeAtDownload)
        timeZoneDiff.setHours(timeZoneDiff.getHours() + 5)

        const presentMonthNum = timeZoneDiff.getMonth() + 1
        const presentMonth = (monthNum > 9 ? `${presentMonthNum}` : `0${presentMonthNum}`)
        const todayNum = timeZoneDiff.getDate()
        const today = (todayNum > 9 ? todayNum : `0${todayNum}`)
        const gmtHour = timeZoneDiff.getHours()

        const quarter = Math.floor(gmtHour / 6) * 6
        const latestQuarter = (quarter > 9 ? quarter : `0${quarter}`)
        let hoursDiff = Math.ceil((currentDate - timeAtDownload) / (1000 * 60 * 60))
        hoursDiff = (hoursDiff > 9 ? hoursDiff : `0${hoursDiff}`)

        const outpath = `${basepath}/data/${month}${day}${hour}.grb2`
        const url = `https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.${year}${presentMonth}${today}/${latestQuarter}/atmos/gfs.t${latestQuarter}z.pgrb2.0p25.f0${hoursDiff}`

        console.log('starting download', url)
        await download(url, outpath)
        console.log('finished downloading')
      }    
    }

    currentDate = new Date(currentDate.getTime() + (frequency*60*60*1000))

    downloadLoop()
  } else {
    console.log('finished all jobs')      
  }
}

async function download(url, path) {    
  return fetch(url)
      .then(x => x.arrayBuffer())
      .then(x => writeFilePromise(path, Buffer.from(x)));
}
