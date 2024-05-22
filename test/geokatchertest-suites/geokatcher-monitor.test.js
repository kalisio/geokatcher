import { expect } from 'chai'
import _ from 'lodash'
import { waitEvent } from '../tools.js'
async function geoKatcherMonitorTest () {
  let app, baseMonitorObject, featuresService, firstElementFeatureId
  before(async () => {
    app = this.app
    featuresService = this.featuresService
    baseMonitorObject = {
      firstElement: {
        name: 'firstElement',
        filter: {
          'properties.name': 'notexistingfeaturename'
        }
      },
      secondElement: {
        name: 'secondElement'
      },
      monitor: {
        type: 'event',
        description: 'monitor-test',
        enabled: true,
        name: 'monitor',
        trigger: ['patched'],
        evaluation: {
          alertOn: 'data',
          type: 'geoIntersects'
        }
      }
    }
    firstElementFeatureId = (await featuresService.find({ query: { 'properties.name': 'featurename' } })).features[0]._id
  })

  afterEach(async () => {
    // remove all monitors
    await app.service('monitor').remove(null, { query: { 'monitor.name': { $regex: '.*' } } })
    // reset the feature with name featurename to coordinates [-1.424805, 43.595556]
    await featuresService.patch(firstElementFeatureId, { 'geometry.coordinates': [-1.424805, 43.595556] })
  })

  it('creates an event monitor that does not initially fire', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    const omit = ['firstElement.layerInfo', 'secondElement.layerInfo', 'monitor.lastRun', 'monitor.action', 'createdAt', 'updatedAt', '_id']

    const result = await app.service('monitor').create(monitorObject)
    const stored = await app.service('monitor').get(result._id)
    expect(stored).to.deep.equal(result)
    expect(result?.monitor?.lastRun?.alert).to.equal('not firing')
    expect(result?.monitor?.lastRun?.status.success).to.equal(true)
    expect(_.omit(result, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('creates an event monitor that initially fires', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    const omit = ['firstElement.layerInfo', 'secondElement.layerInfo', 'monitor.lastRun', 'monitor.action', 'createdAt', 'updatedAt', '_id']
    delete monitorObject.firstElement.filter

    const result = await app.service('monitor').create(monitorObject)
    const stored = await app.service('monitor').get(result._id)
    expect(stored).to.deep.equal(result)
    expect(result?.monitor?.lastRun?.alert).to.equal('firing')
    expect(result?.monitor?.lastRun?.status.success).to.equal(true)
    expect(_.omit(result, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('creates an event monitor that initially fires and does no longer fire after a feature is updated', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.firstElement.filter
    const omit = ['firstElement.layerInfo', 'secondElement.layerInfo', 'monitor.lastRun', 'monitor.action', 'createdAt', 'updatedAt', '_id']
    const result = await app.service('monitor').create(monitorObject)
    const stored = await app.service('monitor').get(result._id)
    expect(stored).to.deep.equal(result)
    expect(result?.monitor?.lastRun?.alert).to.equal('firing')
    expect(result?.monitor?.lastRun?.status.success).to.equal(true)
    expect(_.omit(result, omit)).to.deep.equal(_.omit(monitorObject, omit))

    // listen for the event, update the feature and wait for the event to be received
    const eventPromise = waitEvent(app.service('monitor'), 'monitor')
    await featuresService.patch(firstElementFeatureId, { 'geometry.coordinates': [0, 0] })
    const eventResult = await eventPromise

    expect(eventResult.status).to.equal('no longer firing')
    const storedAfterUpdate = await app.service('monitor').get(result._id)
    expect(storedAfterUpdate.monitor.lastRun.date).to.be.greaterThan(result.monitor.lastRun.date) // check that the lastRun date has been updated
    expect(storedAfterUpdate.monitor.lastRun.alert).to.equal('no longer firing')
  }).timeout(5000)

  it('creates a cron monitor that does initially fire and does no longer fire after a feature is updated', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.firstElement.filter
    monitorObject.monitor.type = 'cron'
    monitorObject.monitor.trigger = '*/2 * * * * *'
    const result = await app.service('monitor').create(monitorObject)
    expect(result.monitor.lastRun.alert).to.equal('firing')

    // listen for the event, update the feature and wait for the event to be received
    const eventPromise = waitEvent(app.service('monitor'), 'monitor', 4000)
    await featuresService.patch(firstElementFeatureId, { 'geometry.coordinates': [0, 0] })
    const eventResult = await eventPromise
    expect(eventResult.status).to.equal('no longer firing')

    await new Promise(resolve => setTimeout(resolve, 300)) // wait for the monitor to be updated in the database
    const storedAfterUpdate = await app.service('monitor').get(result._id)

    expect(storedAfterUpdate.monitor.lastRun.alert).to.equal('no longer firing')
    expect(storedAfterUpdate.monitor.lastRun.date).to.be.greaterThan(result.monitor.lastRun.date) // check that the lastRun date has been updated
  }).timeout(6000)
}

export default geoKatcherMonitorTest
