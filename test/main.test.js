
import { execSync } from 'child_process'
import chai, {util} from 'chai'
import chailint from 'chai-lint'


import initTest from './init.test.js'
import kanoTest from './kano.test.js'
import geoKatcherSchemaTest from './geokatchertest-suites/geokatcher-creation.test.js'
import geoKatcherPatchTest from './geokatchertest-suites/geokatcher-patch.test.js'
import geoKatcherMonitorTest from './geokatchertest-suites/geokatcher-monitor.test.js'


var server, app, kapp, catalogService, defaultLayers, featuresService, hubeauHydroStationsService
var globals = {server, app, kapp, catalogService, defaultLayers, featuresService, hubeauHydroStationsService}
before(() => {
  chailint(chai, util)
})


describe('geokatcher:init',initTest.bind(globals))

describe('geokatcher:kano',kanoTest.bind(globals))

describe('geokatcher:geokatcher-creation',geoKatcherSchemaTest.bind(globals))
describe('geokatcher:geokatcher-patch',geoKatcherPatchTest.bind(globals))
describe('geokatcher:geokatcher-monitor',geoKatcherMonitorTest.bind(globals))

after(async() => {
  // return
  await globals.catalogService._remove(null, {query: {}})
  await globals.featuresService._remove(null, {query: {}})
  await globals.hubeauHydroStationsService._remove(null, {query: {}})
  await globals.app.service('monitor')._remove(null, {query: {}})
  if (globals.server) await globals.server.close()
  await globals.kapp.teardown()
})
