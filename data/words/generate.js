const fs = require('fs')
const path = require('path')

const words = fs.readFileSync('words.txt', 'utf8')

const splitted = words.split('\n')

splitted.forEach(line => {
  fs.appendFileSync(path.join(__dirname, line[0].toLowerCase() + '.txt'), line)
})
