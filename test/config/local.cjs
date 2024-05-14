const path = require('path')

module.exports = {
  providers: {
    Kano: {
      services: {
        'hubeau-hydro-stations': ['properties.name'],
        'features': ['properties.name']
      }
    }
  }
}
