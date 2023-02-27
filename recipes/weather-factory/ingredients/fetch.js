const fetch = require('node-fetch')
const {promisify} = require('util');
const {writeFile} = require('fs');
const writeFilePromise = promisify(writeFile);

const startDate = new Date('Feb 22, 2023, 0:00')
const endDate = new Date('Feb 25, 2023, 24:00')
const frequency = 2

let currentDate = startDate

const basepath = (process.argv[2])

downloadLoop()

async function downloadLoop() {
  if(currentDate <= endDate) { 
    const month = `0${(currentDate.getMonth() + 1)}`
    const dayNum = currentDate.getDate()
    const day = (dayNum > 9 ? dayNum : `0${dayNum}`)
    const hourNum = currentDate.getHours()
    const hour = (hourNum > 9 ? `${hourNum}00` : `0${hourNum}00`)
    const path = `${basepath}/data/${month}${day}${hour}.nc4`

    const url = `https://portal.nccs.nasa.gov/datashare/gmao/geos-fp/das/Y2023/M${month}/D${day}/GEOS.fp.asm.inst1_2d_lfo_Nx.2023${month}${day}_${hour}.V01.nc4`

    console.log('starting download', url)
    await download(url, path)
    console.log('finished downloading')

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
