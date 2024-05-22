import { expect } from 'chai'
import { expectError } from '../tools.js'
import _ from 'lodash'

async function geoKatcherPatchTest () {
  let app, baseMonitorObject, monitorObject
  before(async () => {
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
    // Create the monitor
    monitorObject = await app.service('monitor').create(baseMonitorObject)
  })

  afterEach(async () => {
    // revert the monitor object to its original state
    await app.service('monitor').patch(monitorObject._id, baseMonitorObject)
  })
  it('patch the first element name with layer that does not exist should throw a NotFound with message "Layer not found', async () => {
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { firstElement: { name: 'xxx' } }),
    'Layer not found')
  }).timeout(1000)

  it('patch only the first element should leave the rest of the object unchanged', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { firstElement: { name: 'secondElement' } })
    const omit = ['firstElement', 'monitor.lastRun', 'updatedAt']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
    expect(patchedMonitor.firstElement.name).to.equal('secondElement')
    expect(patchedMonitor.updatedAt).to.not.equal(monitorObject.updatedAt)
    expect(patchedMonitor.monitor.lastRun).to.not.equal(monitorObject.monitor.lastRun)
  }).timeout(1000)

  it('patch the first element name with layer that does exist should return the patched object', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { firstElement: { name: 'secondElement' } })
    expect(patchedMonitor.firstElement.name).to.equal('secondElement')
  }).timeout(1000)

  it('patch the first element name should reset the filters', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { firstElement: { name: 'secondElement' } })
    expect(patchedMonitor.firstElement.filter).to.equal(undefined)
  }).timeout(1000)

  it('patch the first element filter should return the patched object with new filter', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { firstElement: { filter: { 'properties.name': 'newName' } } })
    expect(patchedMonitor.firstElement.filter).to.deep.equal({ 'properties.name': 'newName' })
  }).timeout(1000)

  it('patch the monitor trigger (event) with an invalid (event) trigger should throw a BadRequest ', async () => {
    // not an array
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { trigger: 'notanarray' } }),
    'if "monitor.type" is "event","monitor.trigger" must be an array')

    // not an array of strings
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { trigger: [1, 2, 3] } }),
    'if "monitor.type" is "event",all elements of "monitor.trigger" must be strings')
  }
  ).timeout(1000)

  it('patch the monitor trigger (event) with a valid (event) trigger should return the patched object', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { trigger: ['created', 'patched', 'removed'] } })
    expect(patchedMonitor.monitor.trigger).to.deep.equal(['created', 'patched', 'removed'])
  }).timeout(1000)

  it('patch the monitor type from event to cron without changing the trigger should throw a BadRequest', async () => {
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { type: 'cron' } }),
    'if "monitor.type" is "cron","monitor.trigger" must be a string')
  }).timeout(1000)

  it('patch the monitor type from event to cron with a valid trigger should return the patched object', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { type: 'cron', trigger: '*/5 * * * *' } })
    expect(patchedMonitor.monitor.type).to.equal('cron')
    expect(patchedMonitor.monitor.trigger).to.equal('*/5 * * * *')
    const omit = ['monitor.lastRun', 'monitor.trigger', 'monitor.type', 'updatedAt']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('patch the monitor type to dryRun should return a BadRequest', async () => {
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { type: 'dryRun' } }),
    '"monitor.type" must be one of [cron, event]')
  }).timeout(1000)

  it('patch the action to an invalid action should throw a BadRequest', async () => {
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { action: 'invalidAction' } }),
    '"monitor.action" must be of type object')
  }).timeout(1000)

  it('patch the action to anything other than "no-webhook" with no url should throw a BadRequest', async () => {
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'slack-webhook' } } }),
    '"monitor.action.url" is required')
  }).timeout(1000)

  it('patch the action to no-webhook should return the patched object', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'no-webhook' } } })
    expect(patchedMonitor.monitor.action.type).to.equal('no-webhook')
    const omit = ['monitor.lastRun', 'updatedAt']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('patch the action to slack-webhook with a valid url should return the patched object', async () => {
    const patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'slack-webhook', url: 'https://slack.com' } } })
    expect(patchedMonitor.monitor.action.type).to.equal('slack-webhook')
    expect(patchedMonitor.monitor.action.url).to.equal('https://slack.com')
    const omit = ['monitor.lastRun', 'monitor.action', 'updatedAt']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('patch the action to slack-webhook with an invalid url should throw a BadRequest', async () => {
    await expectError(() =>
      app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'slack-webhook', url: 'xxxx' } } }),
    '"monitor.action.url" must be a valid uri')
  }).timeout(1000)

  it('patch an action from slack-webhook to no-webhook should remove the url', async () => {
    // patch to slack-webhook
    let patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'slack-webhook', url: 'https://slack.com' } } })
    expect(patchedMonitor.monitor.action.type).to.equal('slack-webhook')
    expect(patchedMonitor.monitor.action.url).to.equal('https://slack.com')

    // patch to no-webhook
    patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'no-webhook' } } })
    expect(patchedMonitor.monitor.action.type).to.equal('no-webhook')
    expect(patchedMonitor.monitor.action.url).to.equal(undefined)
    const omit = ['monitor.lastRun', 'updatedAt']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('patch an action from "crisis-webhook" to "no-webhook" should remove the url and additionalProperties', async () => {
    // patch to crisis-webhook
    let patchedMonitor = await app.service('monitor').patch(monitorObject._id, {
      monitor: {
        action: {
          type: 'crisis-webhook',
          url: 'https://crisis.com',
          additionalProperties: {
            organisation: 'Crisis',
            token: '1234',
            data: {
              template: 'template'
            }
          }
        }
      }
    })
    expect(patchedMonitor.monitor.action.type).to.equal('crisis-webhook')
    expect(patchedMonitor.monitor.action.url).to.equal('https://crisis.com')

    // patch to no-webhook
    patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'no-webhook' } } })
    expect(patchedMonitor.monitor.action.type).to.equal('no-webhook')
    expect(patchedMonitor.monitor.action.url).to.equal(undefined)
    expect(patchedMonitor.monitor.action.additionalProperties).to.equal(undefined)
    const omit = ['monitor.lastRun', 'updatedAt']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  it('patch an action from "crisis-webhook" to "custom-request" should reset the url and additionalProperties', async () => {
    // patch to crisis-webhook
    let patchedMonitor = await app.service('monitor').patch(monitorObject._id, {
      monitor: {
        action: {
          type: 'crisis-webhook',
          url: 'https://crisis.com',
          additionalProperties: {
            organisation: 'Crisis',
            token: '1234',
            data: {
              template: 'template'
            }
          }
        }
      }
    })
    expect(patchedMonitor.monitor.action.type).to.equal('crisis-webhook')
    expect(patchedMonitor.monitor.action.url).to.equal('https://crisis.com')

    // patch to custom-request
    patchedMonitor = await app.service('monitor').patch(monitorObject._id, { monitor: { action: { type: 'custom-request', url: 'https://custom.com', additionalProperties: { method: 'get', body: { key: 'template' } } } } })
    expect(patchedMonitor.monitor.action.type).to.equal('custom-request')
    expect(patchedMonitor.monitor.action.url).to.equal('https://custom.com')
    expect(patchedMonitor.monitor.action.additionalProperties).to.deep.equal({ method: 'get', body: { key: 'template' }, headers: {} })
    const omit = ['monitor.lastRun', 'updatedAt', 'monitor.action']
    expect(_.omit(patchedMonitor, omit)).to.deep.equal(_.omit(monitorObject, omit))
  }).timeout(1000)

  after(async () => {
    await app.service('monitor').remove(monitorObject._id)
  })
}

export default geoKatcherPatchTest
