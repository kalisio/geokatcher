import { expect } from 'chai'
import _ from 'lodash'
import { waitEvent, wait } from '../tools.js'
async function geoKatcherMonitorTest () {
  let app, baseMonitorObject, featuresService, targetFeatureId
  before(async () => {
    app = this.app
    featuresService = this.featuresService
    baseMonitorObject = {
      target: {
        name: 'target',
        filter: {
          'properties.name': 'notexistingfeaturename'
        }
      },
      zone: {
        name: 'zone'
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
    targetFeatureId = (await featuresService.find({ query: { 'properties.name': 'featurename' } })).features[0]._id
  })

  afterEach(async () => {
    // remove all monitors
    await app.service('monitor').remove(null, { query: { 'monitor.name': { $regex: '.*' } } })
    // reset the feature with name featurename to coordinates [-1.424805, 43.595556]
    await featuresService.patch(targetFeatureId, { 'geometry.coordinates': [-1.424805, 43.595556] })
  })

  it('creates an event monitor that does not initially fire', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    const omit = ['target.layerInfo', 'zone.layerInfo', 'monitor.lastRun', 'monitor.action', 'createdAt', 'updatedAt', '_id']

    const result = await app.service('monitor').create(monitorObject)
    const stored = await app.service('monitor').get(result._id)
    expect(stored).to.deep.equal(result)
    expect(result?.monitor?.lastRun?.alert).to.equal('not firing')
    expect(result?.monitor?.lastRun?.status.success).to.equal(true)
    expect(_.omit(result, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('creates an event monitor that initially fires', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    const omit = ['target.layerInfo', 'zone.layerInfo', 'monitor.lastRun', 'monitor.action', 'createdAt', 'updatedAt', '_id']
    delete monitorObject.target.filter

    const result = await app.service('monitor').create(monitorObject)
    const stored = await app.service('monitor').get(result._id)
    expect(stored).to.deep.equal(result)
    expect(result?.monitor?.lastRun?.alert).to.equal('firing')
    expect(result?.monitor?.lastRun?.status.success).to.equal(true)
    expect(_.omit(result, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('creates an event monitor that initially fires and does no longer fire after a feature is updated', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.target.filter
    const omit = ['target.layerInfo', 'zone.layerInfo', 'monitor.lastRun', 'monitor.action', 'createdAt', 'updatedAt', '_id']
    const result = await app.service('monitor').create(monitorObject)
    const stored = await app.service('monitor').get(result._id)
    expect(stored).to.deep.equal(result)
    expect(result?.monitor?.lastRun?.alert).to.equal('firing')
    expect(result?.monitor?.lastRun?.status.success).to.equal(true)
    expect(_.omit(result, omit)).to.deep.equal(_.omit(monitorObject, omit))

    // listen for the event, update the feature and wait for the event to be received
    const eventPromise = waitEvent(app.service('monitor'), 'monitor')
    await featuresService.patch(targetFeatureId, { 'geometry.coordinates': [0, 0] })
    const eventResult = await eventPromise

    expect(eventResult.status).to.equal('no longer firing')
    const storedAfterUpdate = await app.service('monitor').get(result._id)
    expect(storedAfterUpdate.monitor.lastRun.date).to.be.greaterThan(result.monitor.lastRun.date) // check that the lastRun date has been updated
    expect(storedAfterUpdate.monitor.lastRun.alert).to.equal('no longer firing')
  }).timeout(5000)

  it('creates a cron monitor that does initially fire and does no longer fire after a feature is updated', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.target.filter
    monitorObject.monitor.type = 'cron'
    monitorObject.monitor.trigger = '*/2 * * * * *'
    const result = await app.service('monitor').create(monitorObject)
    expect(result.monitor.lastRun.alert).to.equal('firing')

    // listen for the event, update the feature and wait for the event to be received
    const eventPromise = waitEvent(app.service('monitor'), 'monitor', 4500) // need to wait 2.25x the cron time to be sure that the cron has fired
    await featuresService.patch(targetFeatureId, { 'geometry.coordinates': [0, 0] })
    const eventResult = await eventPromise
    expect(eventResult.status).to.equal('no longer firing')

    await wait(300) // wait for the monitor to be updated in the database
    const storedAfterUpdate = await app.service('monitor').get(result._id)

    expect(storedAfterUpdate.monitor.lastRun.alert).to.equal('no longer firing')
    expect(storedAfterUpdate.monitor.lastRun.date).to.be.greaterThan(result.monitor.lastRun.date) // check that the lastRun date has been updated
  }).timeout(6000)

  it('creates an event monitor that initially fires and patch it to a cron monitor that fires', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.target.filter
    const omit = ['monitor.lastRun', 'monitor.trigger', 'monitor.type', 'createdAt', 'updatedAt']

    const result = await app.service('monitor').create(monitorObject)
    expect(result.monitor.lastRun.alert).to.equal('firing')

    // patch the monitor to a cron monitor
    const patchedMonitor = await app.service('monitor').patch(result._id, { monitor: { type: 'cron', trigger: '*/2 * * * * *' } })
    expect(patchedMonitor.monitor.lastRun.alert).to.equal('firing')
    expect(patchedMonitor.monitor.lastRun.date).to.be.greaterThan(result.monitor.lastRun.date) // check that the lastRun date has been updated

    // listen for the event, and wait for the cron to fire again
    const eventResult = await waitEvent(app.service('monitor'), 'monitor', 4500) // need to wait 2.25x the cron time to be sure that the cron has fired
    expect(eventResult.status).to.equal('still firing')

    // check in the database that the monitor has been updated
    await wait(300) // wait for the monitor to be updated in the database
    const storedAfterUpdate = await app.service('monitor').get(result._id)
    expect(storedAfterUpdate.monitor.lastRun.alert).to.equal('still firing')
    expect(storedAfterUpdate.monitor.type).to.equal('cron')
    expect(storedAfterUpdate.monitor.trigger).to.equal('*/2 * * * * *')
    expect(storedAfterUpdate.monitor.lastRun.date).to.be.greaterThan(patchedMonitor.monitor.lastRun.date) // check that the lastRun date has been updated
    expect(_.omit(storedAfterUpdate, omit)).to.deep.equal(_.omit(patchedMonitor, omit))
  }).timeout(6000)

  it('creates a dryrun monitor of type geowithin that should fire', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.target.filter
    monitorObject.monitor.type = 'dryRun'
    monitorObject.monitor.evaluation.type = 'geoWithin'
    const data = await app.service('monitor').create(monitorObject)
    expect(data.monitorObject.monitor.lastRun.alert).to.equal('firing')
  }).timeout(4000)

  it('creates a dryrun monitor of type geowithin that should not fire', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.type = 'dryRun'
    monitorObject.monitor.evaluation.type = 'geoWithin'

    const data = await app.service('monitor').create(monitorObject)
    expect(data.monitorObject.monitor.lastRun.alert).to.equal('not firing')
  }).timeout(4000)

  it('creates a dryrun monitor of type geoIntersects that should fire', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    delete monitorObject.target.filter
    monitorObject.monitor.type = 'dryRun'
    monitorObject.monitor.evaluation.type = 'geoIntersects'

    const data = await app.service('monitor').create(monitorObject)
    expect(data.monitorObject.monitor.lastRun.alert).to.equal('firing')
  }).timeout(4000)

  it('creates a dryrun monitor of type geoIntersects that should not fire', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.type = 'dryRun'
    monitorObject.monitor.evaluation.type = 'geoIntersects'

    const data = await app.service('monitor').create(monitorObject)
    expect(data.monitorObject.monitor.lastRun.alert).to.equal('not firing')
  }).timeout(4000)

  // CAN'T TEST BECAUSE $not is not supported by the kdk test instance (NEEDS TO BE FIXED)
  // it('creates a dryrun monitor of type near with a maxDistance of 1000 that should fire', async () => {
  //   const monitorObject = _.cloneDeep(baseMonitorObject)
  //   monitorObject.target = { name: 'hubeau_hydro' }
  //   monitorObject.zone = { name: 'hubeau_hydro' }
  //   monitorObject.monitor.type = 'dryRun'
  //   monitorObject.monitor.evaluation.type = 'near'
  //   monitorObject.monitor.evaluation.maxDistance = 1000

  //   const data = await app.service('monitor').create(monitorObject)
  //   expect(data.monitorObject.monitor.lastRun.alert).to.equal('firing')
  // }).timeout(4000)
}

export default geoKatcherMonitorTest
