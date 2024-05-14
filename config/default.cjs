const _ = require('lodash')
const path = require('path')
const glob = require('glob')
const winston = require('winston')

const host = process.env.HOSTNAME || 'localhost'
const port = process.env.PORT || 8080
const apiPath = process.env.API_PREFIX || '/api'
const baseUrl = process.env.BASE_URL || `http://${host}:${port}`

let i18n = {}
glob.sync(path.join(__dirname, 'i18n/**/*.cjs')).forEach(i18nFile => {
  _.merge(i18n, require(i18nFile))
})

module.exports = {
  host,
  port,
  baseUrl,
  apiPath,
  providers: {
     Kano: {},
  },
  i18n,
  
  dbUrl :'mongodb://192.168.0.253:27017/geokatcher',
  env: process.env.NODE_ENV || 'development',

  logs: {
    Console: {
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      level: (process.env.NODE_ENV === 'development' ? 'verbose' : 'info')
    },
    DailyRotateFile: {
      format: winston.format.json(),
      dirname: path.join(__dirname, '..', 'logs'),
      filename: 'geokatcher-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d'
    }
  },
  distribution: { // Distribute no services simply use remote ones from Kano
    services: (service) => true,
    // Use only Kano services
    remoteServices: (service) => (service.key === 'kano'),
    healthcheckPath: apiPath + '/distribution/'
  }
}
