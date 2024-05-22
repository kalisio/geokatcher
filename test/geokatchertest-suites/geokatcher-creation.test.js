import { expect } from 'chai'
import _ from 'lodash'
import { expectError } from '../tools.js'

async function geoKatcherSchemaTest () {
  let app, baseMonitorObject
  before(() => {
    app = this.app
    baseMonitorObject = {
      firstElement: {
        name: 'firstElement',
        filter: {
          'properties.name': 'randomname'
        }
      },
      secondElement: {
        name: 'secondElement'
      },
      monitor: {
        type: 'event',
        enabled: false,
        name: 'monitor',
        trigger: ['patched'],
        evaluation: {
          type: 'geoIntersects'
        }
      }
    }
  })

  it('a monitor with no firstElement/secondElement name should throw a BadRequest with message "firstElement/secondElement.name is required"', async () => {
    await expectError(() => app.service('monitor').create({ firstElement: {} }), '"firstElement.name" is required')
    await expectError(() => app.service('monitor').create({ firstElement: { name: 'firstElement' }, secondElement: {} }), '"secondElement.name" is required')
  }).timeout(1000)

  it('a monitor with a monitor type that is not "cron"/"event" or "dryRun" should throw a BadRequest with message "monitor.type must be one of [cron, event, dryRun]"', async () => {
    await expectError(() => app.service('monitor').create({ firstElement: { name: 'firstElement' }, secondElement: { name: 'secondElement' }, monitor: { type: 'xxx' } }), '"monitor.type" must be one of [cron, event, dryRun]')
  }).timeout(1000)

  it('a monitor with no evaluation type should throw a BadRequest with message "monitor.evaluation.type is required"', async () => {
    await expectError(() =>
      app.service('monitor').create({ firstElement: { name: 'firstElement' }, secondElement: { name: 'secondElement' }, monitor: { type: 'dryRun', evaluation: {} } }),
    '"monitor.evaluation.type" is required')
  }).timeout(1000)

  it('a monitor with an unknown evaluation type should throw a BadRequest with message "Unrecognized evaluation type"', async () => {
    const data = { firstElement: { name: 'firstElement' }, secondElement: { name: 'secondElement' }, monitor: { type: 'dryRun', evaluation: { type: 'unknown' } } }
    await expectError(() => app.service('monitor').create(data), 'Unrecognized evaluation type')
  }).timeout(1000)

  it('a monitor should an alertOn property that is either "data" or "noData"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.evaluation.alertOn = 'xxx'
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.evaluation.alertOn" must be one of [noData, data]')
  }).timeout(1000)

  it('a monitor with a maxDistance or minDistance that is not a positive number should throw a BadRequest with message "monitor.evaluation.maxDistance/minDistance must be a positive number"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.evaluation.maxDistance = -1
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.evaluation.maxDistance" must be a positive number')
    monitorObject.monitor.evaluation.maxDistance = 1
    monitorObject.monitor.evaluation.minDistance = -1
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.evaluation.minDistance" must be a positive number')
  }).timeout(1000)

  it('a monitor with a firstElement/secondElement name that does not exist should throw a BadRequest with message "firstElement/secondElement not found"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.firstElement.name = 'xxx'
    await expectError(() => app.service('monitor').create(monitorObject), 'Layer not found')

    monitorObject.firstElement.name = 'firstElement'
    monitorObject.secondElement.name = 'xxx'
    await expectError(() => app.service('monitor').create(monitorObject), 'Layer not found')
  }).timeout(1000)

  it('a monitor wich is not a dryRun needs a name,a type and a trigger', async () => {
    // type
    await expectError(() => app.service('monitor').create({ firstElement: { name: 'firstElement' }, secondElement: { name: 'secondElement' }, monitor: { evaluation: { type: 'geoIntersects' } } }),
      '"monitor.type" is required')

    // name
    await expectError(() => app.service('monitor').create({ firstElement: { name: 'firstElement' }, secondElement: { name: 'secondElement' }, monitor: { type: 'event', evaluation: { type: 'geoIntersects' } } }),
      '"monitor.name" is required')

    // trigger
    await expectError(() => app.service('monitor').create({ firstElement: { name: 'firstElement' }, secondElement: { name: 'secondElement' }, monitor: { type: 'event', name: 'monitor', evaluation: { type: 'geoIntersects' } } }),
      '"monitor.trigger" is required')
  }).timeout(5000)

  it('a monitor with a type cron and trigger not a string should throw a BadRequest with message "if "monitor.type" is "cron","monitor.trigger" must be a string"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.type = 'cron'
    monitorObject.monitor.trigger = ['patched']
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.type" is "cron","monitor.trigger" must be a string')
  }).timeout(5000)

  it('a monitor with a type cron and trigger that is not a valid cron expression should throw a BadRequest with message "if "monitor.type" is "cron","monitor.trigger" must be a valid cron expression"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.trigger = 'xxx'
    monitorObject.monitor.type = 'cron'
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.type" is "cron","monitor.trigger" must be a valid cron expression')
  }).timeout(5000)

  it('a monitor with a type event and trigger not an array should throw a BadRequest with message "if "monitor.type" is "event","monitor.trigger" must be an array"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.trigger = 'xxx'
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.type" is "event","monitor.trigger" must be an array')
  }).timeout(5000)

  it('a monitor with a type event and trigger that is not a list of strings should throw a BadRequest with message "if "monitor.type" is "event",all elements of "monitor.trigger" must be strings"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.trigger = ['4', 4]
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.type" is "event",all elements of "monitor.trigger" must be strings')
  }).timeout(5000)

  it('a monitor action should be an object', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = 'xxx'
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.action" must be of type object')
  }
  ).timeout(1000)
  it('a monitor wich has a name that already exists should throw a Conflict with message "Monitor with the same name already exists"', async () => {
    const firstMonitor = await app.service('monitor').create(baseMonitorObject)
    await expectError(() => app.service('monitor').create(baseMonitorObject), 'Monitor with the same name already exists')

    // we delete the monitor
    await app.service('monitor').remove(firstMonitor._id)
  }).timeout(1000)

  it('a monitor action that is not a slack-webhook, custom-request or crisis-webhook should throw a BadRequest with message "monitor.action.type must be one of [slack-webhook, custom-request, crisis-webhook]"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'xxx' }
    await expectError(() => app.service('monitor').create(monitorObject),
      '"monitor.action.type" must be one of [slack-webhook, custom-request, crisis-webhook, no-webhook]')
  }
  ).timeout(1000)

  it('a monitor action with no url should throw a BadRequest with message "monitor.action.url is required"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'slack-webhook' }
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.action.url" is required')
  }
  ).timeout(1000)

  it('a monitor action with a url that is not a valid uri should throw a BadRequest with message "monitor.action.url must be a valid uri"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'slack-webhook', url: 'xxx' }
    await expectError(() => app.service('monitor').create(monitorObject),
      '"monitor.action.url" must be a valid uri')
  }
  ).timeout(1000)

  it('a monitor action with type "crisis-webhook" or "custom-request" which has no additionalProperties should throw a BadRequest with message "monitor.action.additionalProperties is required"', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'crisis-webhook', url: 'http://localhost:3000' }
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.action.additionalProperties" is required')

    monitorObject.monitor.action = { type: 'custom-request', url: 'http://localhost:3000' }
    await expectError(() => app.service('monitor').create(monitorObject), '"monitor.action.additionalProperties" is required')
  }
  ).timeout(1000)

  it('a monitor action with type "crisis-webhook" should have a additionalProperties with a valid schema', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'crisis-webhook', url: 'http://localhost:3000', cooldown: 1 }
    // no organisation
    monitorObject.monitor.action.additionalProperties = {}
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.action.type" is "crisis-webhook", "monitor.action.aditionalProperties.organisation" is required')
    // no token
    monitorObject.monitor.action.additionalProperties.organisation = 'organisationid'
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.action.type" is "crisis-webhook", "monitor.action.aditionalProperties.token" is required')
    // no data
    monitorObject.monitor.action.additionalProperties.token = 'token'
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.action.type" is "crisis-webhook", "monitor.action.aditionalProperties.data" is required')

    // no template
    monitorObject.monitor.action.additionalProperties.data = {}
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.action.type" is "crisis-webhook", "monitor.action.aditionalProperties.data.template" is required')
  }).timeout(1000)

  it('a monitor action with type "custom-request" should have a valid method in additionalProperties', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'custom-request', url: 'http://localhost:3000', cooldown: 1 }
    monitorObject.monitor.action.additionalProperties = {}
    // try { await app.service('monitor').create(monitorObject)} catch (error) { expect(error.message).to.equal('if "monitor.action.type" is "custom-request", "monitor.action.aditionalProperties.method" is required') }
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.action.type" is "custom-request", "monitor.action.aditionalProperties.method" is required')
    monitorObject.monitor.action.additionalProperties.method = 'xxx'
    await expectError(() => app.service('monitor').create(monitorObject),
      'if "monitor.action.type" is "custom-request", "monitor.action.aditionalProperties.method" must be one of [get, post, put, delete]')
  }).timeout(1000)

  it('a monitor action with type "crisis-webhook" with a valid additionalProperties should return the created object', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'crisis-webhook', url: 'http://localhost:3000', cooldown: 1 }
    monitorObject.monitor.action.additionalProperties = {
      organisation: 'organisationid',
      token: 'token',
      data: {
        template: 'template'
      }
    }
    const createdMonitor = await app.service('monitor').create(monitorObject)
    expect(createdMonitor.monitor.action.type).to.equal('crisis-webhook')
    expect(createdMonitor.monitor.action.url).to.equal('http://localhost:3000')
    expect(createdMonitor.monitor.action.additionalProperties).to.deep.equal({
      organisation: 'organisationid',
      token: 'token',
      data: {
        template: 'template'
      }
    })
    expect(createdMonitor.monitor.action.cooldown).to.equal(1)
    // we delete the monitor
    await app.service('monitor').remove(createdMonitor._id)
  }).timeout(1000)

  it('a monitor action with type "custom-request" with a valid additionalProperties should return the created object', async () => {
    const monitorObject = _.cloneDeep(baseMonitorObject)
    monitorObject.monitor.action = { type: 'custom-request', url: 'http://localhost:3000' }
    monitorObject.monitor.action.additionalProperties = {
      method: 'get',
      headers: { 'Content-Type': 'application/json' },
      body: { key: 'value' }
    }
    const createdMonitor = await app.service('monitor').create(monitorObject)
    expect(createdMonitor.monitor.action.type).to.equal('custom-request')
    expect(createdMonitor.monitor.action.url).to.equal('http://localhost:3000')
    expect(createdMonitor.monitor.action.additionalProperties).to.deep.equal({
      method: 'get',
      headers: { 'Content-Type': 'application/json' },
      body: { key: 'value' }
    })
    expect(createdMonitor.monitor.action.cooldown).to.equal(60)
    // we delete the monitor
    await app.service('monitor').remove(createdMonitor._id)
  }).timeout(1000)
}

export default geoKatcherSchemaTest
