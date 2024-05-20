import { mongoose } from 'mongoose'
import { escape, unescape } from 'mongo-escape'
import { stripSlashes } from '@feathersjs/commons'
import { find } from 'mingo'
import  fetch  from 'node-fetch'

import _ from 'lodash'
import cron from 'node-cron'

const monitorsModel = {
  kano: null,
  app: null,
  activeMonitors: {},
  activeServices: [],
  allowedEvents: ['created', 'updated', 'patched', 'removed'],
  model: null,

  /**
     * Create the mongoose model for the monitors
     * @param {*} app  The feathers app
     * @returns {Object}  The mongoose model created
     */
  createModel (app) {
    const Schema = mongoose.Schema
    const monitorsSchema = new Schema(
      {
        firstElement: {
          name: { type: String, required: true },
          filter: { type: Object, required: false },
          layerInfo: { type: Object, required: false }
        },
        secondElement: {
          name: { type: String, required: true },
          filter: { type: Object, required: false },
          layerInfo: { type: Object, required: false }
        },
        monitor: {
          name: { type: String, required: true },
          description: { type: String, required: false },
          type: { type: String, required: true },
          trigger: { type: Object, required: true },
          enabled: { type: Boolean, required: true },
          lastRun: { type: Object, required: false },
          evaluation: {
            alertOn: { type: String, required: true },
            type: { type: String, required: true },
            maxDistance: { type: Number, required: false, min: 0 },
            minDistance: { type: Number, required: false, min: 0 }
          },
          action: { type: Object, required: false }

        }

      },
      {
        timestamps: true,
        versionKey: false
      }
    )

    this.app = app
    this.model = mongoose.model('monitors', monitorsSchema)
    // app.set('monitorsModel', Model);
    return this.model
  },

  /**
   * Start all the monitors that are enabled in the database
   */
  startExistingMonitors () {
    this.model.find({ 'monitor.enabled': true }).then((monitors) => {
      monitors.forEach((monitorObject) => {
        // if the monitor is enabled and not already running
        if (!(this.activeMonitors[monitorObject._id])) {
          this.startMonitor(monitorObject.toObject())
        }
      })
    })
  },

  /**
    * Evaluate the monitor object
    * @param {Object} monitorObject  The monitor object to evaluate, it will be modified by the function, the lastRun object will be updated
    * @param {Boolean} throwError  If true, the function will throw an error if the evaluation fails, if false, the error will be caught and specified in the lastRun object
    * @returns {Object}  The data that match the evaluation
    */
  async evaluate (monitorObject, throwError = false) {
    let data= {}
    let error
    let firstElementLayer
    let secondElementLayer
    let firstElementFeatureCollection
    try {
      // If the source isn't inRequest, we need to get the layer data from the provider (Kano)
      if (_.get(monitorObject.firstElement, 'source') != 'inRequest') {
        firstElementLayer = await this.kano.getLayerData(monitorObject.firstElement.name).catch((err) => {
          throw err
        })

        // If the layer is not found, we stop the evaluation, the error is already thrown
        if (!firstElementLayer) {
          return
        }
        firstElementFeatureCollection = await this.kano.getLayerFeatures(
          firstElementLayer,
          monitorObject.firstElement.filter
        )
        // If the feature collection is empty, we stop the evaluation, there won't be any data to compare
        if (!firstElementFeatureCollection.features) {
          return 
        }
        // The Kano service and layerId are added to the monitorObject to be able to use them for future events on the service
        monitorObject.firstElement.layerInfo = {
          kanoService: _.get(firstElementLayer, 'probeService', firstElementLayer.service),
          layerId: firstElementLayer._id
        }
      }
      // If the source isn't inRequest, we need to get the layer data from the provider (Kano)
      if (_.get(monitorObject.secondElement, 'source') != 'inRequest') {
        secondElementLayer = await this.kano.getLayerData(monitorObject.secondElement.name).catch((err) => {
          throw err
        })
        // If the layer is not found, we stop the evaluation, the error is already thrown
        if (!secondElementLayer) {
          return
        }

        // The Kano service and layerId are added to the monitorObject to be able to use them for future events on the service
        monitorObject.secondElement.layerInfo = {
          kanoService: _.get(secondElementLayer, 'probeService', secondElementLayer.service),
          layerId: secondElementLayer._id
        }
      }

      // Compare the two layers and return the data that match the evaluation
      data.result = await this.kano.compareLayers(
        firstElementFeatureCollection,
        secondElementLayer,
        monitorObject.secondElement.filter,
        monitorObject.monitor
      )
    } catch (err) {
      error = err
      
      // if throwError is true, we escalate the error to the caller
      if (throwError) {
        throw error
      }
      else{
        this.app.logger.error(`Error while evaluating monitor ${monitorObject.monitor.name}: ${error.message}`)
      }
    } finally {
      data.status = { success: !error, ...(error ? { error: { message: error.message, data: error.data } } : {}) }
    }
    return data
  },

  /**
     * Start the monitor and add it to the list of running monitors
     * @param {Object} monitorObject  The monitor object to start
     * @note The monitor is started with the cron library, the monitor will be evaluated at the trigger time
     * @todo Add the possibility to start the monitor with real time events from the provider
     */
  startMonitor (monitorObject) {
      if (monitorObject.monitor.type === 'cron') {
        if (this.activeMonitors[monitorObject._id]) {
          this.app.logger.info(`Monitor ${monitorObject.monitor.name} was already running, stopping it`)
          this.activeMonitors[monitorObject._id].cron.stop()
        }

        const cronjob = cron.schedule(
          monitorObject.monitor.trigger,
          async () => {
            await runMonitor.bind(this)(monitorObject)
          }
        )

        this.activeMonitors[monitorObject._id] = { cron: cronjob, monitor: monitorObject }
      }

      if (monitorObject.monitor.type === 'event') {
        const apiPath = this.app.get('apiPath')
        const firstElementServiceName = _.get(monitorObject, 'firstElement.layerInfo.kanoService', null)
        const secondElementServiceName = _.get(monitorObject, 'secondElement.layerInfo.kanoService', null)
        const apiPathSlash = stripSlashes(apiPath)
        const firstElementService = this.app.services[`${apiPathSlash}/${firstElementServiceName}`]
        const secondElementService = this.app.services[`${apiPathSlash}/${secondElementServiceName}`]

        if (!this.activeServices.includes(firstElementServiceName)) {
          this.activeServices.push(firstElementServiceName)
          this.allowedEvents.forEach((event) => {
            firstElementService.on(event, async (data) => {
              handleServiceEvents(this, data, event)
            })
          })
        }
        if (!this.activeServices.includes(secondElementServiceName)) {
          this.activeServices.push(secondElementServiceName)
          this.allowedEvents.forEach((event) => {
            secondElementService.on(event, async (data) => {
              handleServiceEvents(this, data, event)
            })
          })
        }

        this.activeMonitors[monitorObject._id] = { monitor: monitorObject }
      }
      this.app.logger.info(`Monitor ${monitorObject.monitor.name} started`)
      async () => {
        await runMonitor.bind(this)(monitorObject)
      }
    },

  /**
     * Stops and remove the monitor from the list of running monitors
     * @param {*} monitorObject  The monitor object to stop
     */
  stopMonitor (monitorObject) {
    if (this.activeMonitors[monitorObject._id]) {
      if (monitorObject.monitor.type === 'cron') {
        this.activeMonitors[monitorObject._id].cron.stop()
      }
      delete this.activeMonitors[monitorObject._id]
      this.app.logger.info(`Monitor ${monitorObject.monitor.name} stopped`)
    }
  },

/**
   * Executes the actions associated with a monitor based on its status.
   * 
   * @param {Object} monitorObject - The monitor object containing the monitor details.
   * @param {string} status - The status of the monitor.
   * @returns {Date} - The date and time if the action was run. null if the action was skipped.
   */
  async runActions (monitorObject, status,data) {
    const monitor = monitorObject.monitor
    const action = monitor.action
    const cooldown = action.cooldown*1000 ?? 0
    const now = new Date()
    const lastActionRun = new Date(monitor.lastRun.lastActionRun) ?? 0 
    const onCooldown = now - lastActionRun < cooldown 
    if (status === 'still firing' && onCooldown) {
      this.app.logger.info(`Monitor ${monitor.name} is still firing but the cooldown is not over yet, skipping action`)
      return  
    }
    
    this.app.logger.info(`Monitor ${monitor.name} is ${status}`)
    // Emit an event to the monitor service,
    // so any listeners in the distributed system can react to the monitor status
    this.app.services['monitor'].emit(monitor.name, {status: status})
    if (!action.url) {
      return 
    }

    let actionInfo = {
      url: action.url,
      method : _.get(action, 'customProperties.method', 'POST'),
      body: _.get(action, 'customProperties.body', {}),
      headers: _.get(action, 'customProperties.headers', {"Content-Type": "application/json"})
    } // we will store the default action info here to send it at the end

    if (action.type === 'slack-webhook') {
      actionInfo.body = {
        attachments: [
          {
            color: status === 'firing' ? '#f52a2a' : status === 'still firing' ? '#fc7703' : '#03fc07',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*[GeoKatcher]*\n*Monitor :* \`${monitor.name}\`\n*Status :* ${status}`
                }
              }
            ]
          }
        ]
      }
    }
    if (action.type === 'crisis-webhook') {
      actionInfo.body = {"organisation" : action.crisisProperties.organisation}
      actionInfo.headers.Authorization = "Bearer " + action.crisisProperties.token
      // On firing, we create a crisis event
      if (status === 'firing') {
        actionInfo.body.data = {
          template: action.crisisProperties.data.template,
          name : action.crisisProperties.data.name || monitor.name,
          description : action.crisisProperties.data.description || monitor.description,
        }
        // we add the location if the data is not empty
        if (data.length > 0) {
          actionInfo.body.data.location = {
            type: "Feature",
            geometry:{
              "type":  "GeometryCollection",
              "geometries": [data[0].firstElementFeatures.geometry].concat(data[0].secondElementFeatures.map((feature) => feature.geometry))
            },
            "properties": {
              "name": monitor.name,
              "date": monitor.lastRun.date,
              "condition": monitor.evaluation.type,
              "alertOn": monitor.evaluation.alertOn,
            }
         }
        }
      } 

      // On no longer firing, we close the crisis event
      else if (status === 'no longer firing') {
        actionInfo.body.operation = "remove"
        actionInfo.body.id = action.crisisProperties.knownAlertId
        // remove the knownAlertId from the monitor
        delete monitor.lastRun.knownAlertId
      }

      // On still firing we ignore the action
      else {
        return
      }

      }

    if (action.type === 'custom-request') {
      // we replace the string "%monitorName%" and %monitorStatus% with the name of the monitor in the body and headers and the url
      actionInfo.url = actionInfo.url.replace(/%monitorName%/g, monitor.name).replace(/%monitorStatus%/g, status)
      actionInfo.headers = JSON.parse(JSON.stringify(actionInfo.headers).replace(/%monitorName%/g, monitor.name).replace(/%monitorStatus%/g, status))
      actionInfo.body = JSON.parse(JSON.stringify(actionInfo.body).replace(/%monitorName%/g, monitor.name).replace(/%monitorStatus%/g, status))
    }
    // we send the request
    this.app.logger.info(`Sending ${action.type} for monitor ${monitor.name}`)
    const res = await fetch(actionInfo.url, {
      method: actionInfo.method,
      headers: actionInfo.headers,
      body: JSON.stringify(actionInfo.body)
    })
    // if the request was not successful, we log the error
    if (!res.ok) {
      this.app.logger.error(`Error while sending ${action.type} for monitor ${monitor.name}: ${res.statusText}`)
      const responseText = await res.text()
      this.app.logger.error(`Response: ${responseText}`)
    }
    // if the action was crisis-webhook and the status was firing, we store the knownAlertId in the monitor
    if (action.type === 'crisis-webhook' && status === 'firing') {
      const response = await res.json()
      monitor.action.crisisProperties.knownAlertId = response._id
    }
    // we update the lastActionRun date
    monitor.lastRun.lastActionRun = now
  },
  /**
   * Determines the firing status of a monitor based on the evaluation criteria set in the monitor object and the data received as input.
   * @param {object} monitorObject - The monitor object containing the evaluation criteria and last run information.
   * @param {array} data - The data received as input for the monitor evaluation.
   * @returns {string} - The firing status of the monitor.
   * @note The firing status can be one of the following: 'firing', 'still firing', 'no longer firing', 'not firing'.
   */
  determineFiringStatus(monitorObject, data) {
    const { evaluation, lastRun } = monitorObject.monitor;
    const lastRunAlert = lastRun?.alert
    const { alertOn } = evaluation;
    const isDataEmpty = data.result.length === 0;
    const wasFiring = lastRunAlert === 'firing' || lastRunAlert === 'still firing' 

    if (alertOn === 'data') {
      if (isDataEmpty) {
        return wasFiring ? 'no longer firing' : 'not firing';
      } else {
        return wasFiring ? 'still firing' : 'firing';
      }
    }

    if (alertOn === 'noData') {
      if (isDataEmpty) {
        return wasFiring ? 'still firing' : 'firing';
      } else {
        return wasFiring ? 'no longer firing' : 'not firing';
      }
    }
  }
}
/**
   * Handles service events for monitors.
   * 
   * @param {object} monitorsModel - The monitors model object.
   * @param {object} data - The data object received from the service event.
   * @param {string} event - The event type.
   * @returns {Promise} - A promise that resolves when the function is done.
   */
async function handleServiceEvents (monitorsModel, data, event) {
  const serviceName = data.path.split('/')[1] // ex : api/features -> features
  const activeEventMonitors = Object.values(monitorsModel.activeMonitors).filter(monitor => monitor.monitor.monitor.type === 'event' && monitor.monitor.monitor.trigger.includes(event))
  // Only get the monitors that are of type event and that have the event in their trigger
  for (const monitor of activeEventMonitors) {
    if (serviceName !== monitor.monitor.firstElement.layerInfo.kanoService && serviceName !== monitor.monitor.secondElement.layerInfo.kanoService) {
      // if the service name is not the one we are looking for, we skip it
      continue;
    }

    if (serviceName === "features" && (data.layer !== monitor.monitor.firstElement.layerInfo.layerId && data.layer !== monitor.monitor.secondElement.layerInfo.layerId)) {
      // if the service is "features" and the layers are not the ones we are looking for, we skip it
      continue;
    }

    // get the element (firstElement or secondElement) that corresponds to the event
    const dataElement = data.layer === monitor.monitor.firstElement.layerInfo.layerId ? monitor.monitor.firstElement : monitor.monitor.secondElement 
    const dataFilter = unescape(dataElement.filter) ?? {}
    // if the data matches the filter, we run the monitor
    if (find([data], dataFilter).all().length > 0) {
      await runMonitor.bind(monitorsModel)(monitor.monitor)
    }
  }
}


/**
   * Runs a monitor and updates its status based on the evaluation of data.
   *
   * @param {Object} monitorObject - The monitor object containing the necessary information for running the monitor.
   * @returns {Promise<void>} - A promise that resolves once the monitor object is updated in the database.
   */
async function runMonitor(monitorObject) {
  // Log the number of active monitors
  this.app.logger.info(`Currently running ${Object.keys(this.activeMonitors).length} monitor(s)`);

  // Create a deep copy of the monitor object and unescape it
  const escapedMonitorObject = unescape(_.cloneDeep(monitorObject));

  // Evaluate the monitor using the evaluate function
  const data = await this.evaluate(escapedMonitorObject);

  // Update the lastRun property of the monitor object with the unescaped lastRun value
  monitorObject.monitor.lastRun = escapedMonitorObject.monitor.lastRun;

  // Update the layerInfos in case they were not present / updated
  if (escapedMonitorObject.secondElement.layerInfo) {
    monitorObject.secondElement.layerInfo = escapedMonitorObject.secondElement.layerInfo;
  }
  if (escapedMonitorObject.firstElement.layerInfo) {
    monitorObject.firstElement.layerInfo = escapedMonitorObject.firstElement.layerInfo;
  }

  // Determine the firing status of the monitor based on the evaluation result, but only if the monitor is successful
  if (escapedMonitorObject.monitor.status?.success){
    const alertStatus = this.determineFiringStatus(monitorObject, data);

    // Run actions based on the firing status
    if(alertStatus !== 'not firing'){
      await this.runActions(monitorObject, alertStatus,data.result);
    }
    monitorObject.monitor.lastRun.alert = alertStatus;
  }

  // Update the monitor object
  monitorObject.monitor.lastRun.status = data.status;
  monitorObject.monitor.lastRun.date = new Date()


  // Update the monitor object in the database
  await this.model.updateOne({ _id: monitorObject._id }, monitorObject);
}





export default monitorsModel
