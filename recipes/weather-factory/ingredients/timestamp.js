// const { exec } = require("child_process");
const { exec } = require('node:child_process');
const fs = require('fs');

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthsAbbr = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const daysAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const basepath = (process.argv[2])

fs.readdir(`./${basepath}/jpg`, (err, files) => {
  files.forEach(file => {
    const dateString = file.split('.')[0]
    const sMonth = dateString.substring(0,2)
    const sDay = dateString.substring(2,4)
    const sHour = dateString.substring(4,6)
    const sMin = dateString.substring(6,8)
    const sDayOtheWeek = Number(sDay > 7 ? sDay - (7 * (sDay % 7)) : sDay)

    const thisDate = new Date(`2023-${sMonth}-${sDay}T${sHour}:${sMin}:00`)

    const fixDate = new Date(thisDate)

    fixDate.setHours(fixDate.getHours() - 5)

    const tMonth = monthsAbbr[fixDate.getMonth()]
    const tDay = days[fixDate.getDay()]
    const tDayNum = Number(fixDate.getDate())
    const tTime = `${fixDate.getHours()} ${(fixDate.getHours() > 12 ? 'p.m.' : 'a.m.' )}`

    const displayDateFull = `${tDay}, ${tMonth} ${tDayNum}, ${tTime}` 

    const displayDate = `${tDay}, ${tMonth}. ${tDayNum}` 
    
    console.log(displayDateFull)

    const command = `convert \
      ${basepath}/overlay/${file} \
      -font FranklinITCStd-Bold \
      -gravity Southwest \
      -pointsize 42 \
      -annotate +20+20 \
      '${displayDateFull}' \
      -font Franklin ITC Std \
      -gravity Southeast \
      -pointsize 24 \
      -annotate +20+20 \
      'Source: NASA' \
      ${basepath}/text/${file} 
    `

    exec(command, (err, stdout, stderr) => {
      console.log(`${file} built`)
    })
    exec(`echo ${file}`, (err, stdout, stderr) => {
      console.log(stdout)
    })
  });
});
