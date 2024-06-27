import utility from 'util'
import _ from 'lodash'
import path from 'path'
import fs from 'fs-extra'
import {expect} from 'chai'
import distribution from '@kalisio/feathers-distributed'
import { kdk } from '@kalisio/kdk/core.api.js'
import { createFeaturesService, createCatalogService} from '@kalisio/kdk/map.api.js'
import { createServer } from '../src/main.js'

import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))



async function initTest() {
    // this, is the global object with all the global variables
    let server, app, kapp, catalogService, featuresService, hubeauHydroStationsService, defaultLayers
    before(() => {
        server = this.server
        app = this.app
        kapp = this.kapp
        catalogService = this.catalogService
        defaultLayers = this.defaultLayers
        featuresService = this.featuresService
        hubeauHydroStationsService = this.hubeauHydroStationsService
    })

    it('is ES module compatible', () => {
      expect(typeof createServer).to.equal('function')
    })
  
    it('initialize the remote app', async () => {
      kapp = kdk()
  
      // Distribute services
      await kapp.configure(distribution({
        // Use cote defaults to speedup tests
        cote: {
          helloInterval: 2000,
          checkInterval: 4000,
          nodeTimeout: 5000,
          masterTimeout: 6000
        },
        publicationDelay: 3000,
        key: 'geokatcher-test',
        // Distribute only the test services
        services: (service) => service.path.includes('features') ||
                               service.path.includes('hubeau-hydro-stations') ||
                               service.path.includes('catalog')
      }))
      await kapp.db.connect()
      // Create a global catalog service
      await createCatalogService.call(kapp)
      catalogService = kapp.getService('catalog')
      expect(catalogService).toExist()

    }).timeout(5000)
  
    it('registers the kano layers', async () => {
      const layers = await fs.readJson(path.join(__dirname, 'config/layers.json'))
      expect(layers.length > 0)
      defaultLayers = await catalogService.create(layers)
      // Single layer case
      if (!Array.isArray(defaultLayers)) defaultLayers = [defaultLayers]
      expect(defaultLayers.length > 0)

    })
  
    it('create and feed the kano services', async () => {
      // Create the services
      await createFeaturesService.call(kapp, {
        collection: 'hubeau-hydro-stations',
        featureId: 'code_station',
        featureLabel: 'name'
      })
      await createFeaturesService.call(kapp, {
        collection: 'features',
        featureLabel: 'name'
      })
      hubeauHydroStationsService = kapp.getService('hubeau-hydro-stations')
      expect(hubeauHydroStationsService).toExist()
      featuresService = kapp.getService('features')
      expect(featuresService).toExist()
      // Feed the collections
      let data = fs.readJsonSync(path.join(__dirname, 'data/hubeau-hydro-stations.json'))
      await hubeauHydroStationsService.create(data)
      data = fs.readJsonSync(path.join(__dirname, 'data/targetFeature.json'))
      await featuresService.create(data)
      data = fs.readJsonSync(path.join(__dirname, 'data/zoneFeature.json'))
      await featuresService.create(data)
    }).timeout(5000)
  
    it('initialize the geokatcher service', async () => {
      server = await createServer()
      expect(server).toExist()
      app = server.app
  
      expect(app).toExist()
      // Wait till we have an event to ensure the service is ready "kano:ready"
      await utility.promisify(app.once).bind(app)('kano:ready')
      app.logger.silent = true // Disable logging
    }).timeout(15000),
  
    after(() => {
        this.server = server
        this.app = app
        this.kapp = kapp
        this.catalogService = catalogService
        this.featuresService = featuresService
        this.hubeauHydroStationsService = hubeauHydroStationsService
    })
  }


export default initTest