import utility from 'util'
import _ from 'lodash'
import path from 'path'
import fs from 'fs-extra'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import chai, { util, expect,assert, } from 'chai'
import chailint from 'chai-lint'
import distribution, { finalize } from '@kalisio/feathers-distributed'
import { kdk } from '@kalisio/kdk/core.api.js'
import { createFeaturesService, createCatalogService, removeCatalogService } from '@kalisio/kdk/map.api.js'
import { createServer } from '../src/main.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))


const wait = (ms=9000000) => new Promise(resolve => setTimeout(resolve, ms))

var server, app, kapp, catalogService, defaultLayers, featuresService, hubeauHydroStationsService
before(() => {
  execSync('docker exec mongo-test mongo geokatcher-test --eval "db.dropDatabase()"');
  chailint(chai, util)

})

describe('geokatcher:init',() => {
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
    data = fs.readJsonSync(path.join(__dirname, 'data/firstElementFeature.json'))
    await featuresService.create(data)
    data = fs.readJsonSync(path.join(__dirname, 'data/secondElementFeature.json'))
    await featuresService.create(data)
    
  }) .timeout(5000)

  it('initialize the geokatcher service', async () => {
    server = await createServer()
    expect(server).toExist()
    app = server.app

    expect(app).toExist()
    // Wait till we have an event to ensure the service is ready "kano:ready"
    await utility.promisify(app.once).bind(app)('kano:ready')
    app.logger.silent = true // Disable logging
  }).timeout(15000)
})
  


describe('geokatcher:kano', () => {


  it('kano services are available', async () => {
    // we check if app.services contains the catalog, features and hubeau-hydro services
    expect(app.services['api/catalog']).toExist()
    expect(app.services['api/features']).toExist()
    expect(app.services['api/hubeau-hydro-stations']).toExist()
  }).timeout(10000)

  it('getLayerData with no name should throw a BadRequest with message "Layer name is required"', async () => {
    const kano = app.get('providers').get('kano')[0];
    try {
      await kano.getLayerData();
    }
    catch (error) {
      expect(error.message).to.equal('Layer name is required');
    }

  }).timeout(10000);

  it('getLayerData with name "xxx" should throw a NotFound with message "Layer not found"', async () => {
    const kano = app.get('providers').get('kano')[0];
    try {
      await kano.getLayerData('xxx');
    }
    catch (error) {
      expect(error.message).to.equal('Layer not found');
    }

  }).timeout(10000);

  it('getLayerData with name "hubeau_hydro" should return the corresponding layer', async () => {
    const kano = app.get('providers').get('kano')[0];
    const layer = await kano.getLayerData('hubeau_hydro');
    expect(layer).toExist();
    expect(layer.name).to.equal("Layers.HUBEAU_HYDRO");
  }).timeout(10000);

  it('getLayerFeatures with no layer should throw a BadRequest with message "Layer is required"', async () => {
    const kano = app.get('providers').get('kano')[0];
    try {
      await kano.getLayerFeatures();
    }
    catch (error) {
      expect(error.message).to.equal('Layer is required');
    }

  }).timeout(10000);

  it('getLayerFeatures with layer "hubeau_hydro" and no filters should return 10 features', async () => {
    const kano = app.get('providers').get('kano')[0];
    const layer = await kano.getLayerData('hubeau_hydro');
    const features = await kano.getLayerFeatures(layer);
    expect(features).toExist();
    expect(features.features.length).to.equal(10);
    // it use the development data not good
  }).timeout(10000);

  it('getLayerFeatures with layer "hubeau_hydro" and filter code_station #O962053101 should return 1 feature', async () => {
    const kano = app.get('providers').get('kano')[0];
    const layer = await kano.getLayerData('hubeau_hydro');
    const features = await kano.getLayerFeatures(layer, { "properties.code_station": '#O962053101' });
    expect(features).toExist();
    expect(features.features.length).to.equal(1);
  }).timeout(10000);

  // after(async () => {
  //   return
  //   //wait 1s
  //   await new Promise(resolve => setTimeout(resolve, 1000));
  //   // if (server) await server.close()
  //   await app.teardown()
  //   finalize(kapp)
  //   fs.emptyDirSync(path.join(__dirname, 'logs'))
  //   // await hubeauHydroStationsService.Model.drop()
  //   // await featuresService.Model.drop()
  //   await kapp.db.disconnect()
  // })
})

describe('geokatcher:geokatcher', () => {
  it('create a monitor in dryrun mode and expect alert to be firing', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement"
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "dryRun",
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject)
    expect(result).toExist()
    expect(result.monitorObject.monitor.type).to.equal('dryRun')
    expect((result.monitorObject.monitor.lastRun.alert)).to.equal('firing')
    expect(result.result.result.length).to.equal(1)
  }).timeout(1000);

  it('create a monitor with no firstElement/secondElement name should throw a BadRequest with message "firstElement/secondElement.name is required"', async () => {
    try {await app.service('monitor').create({"firstElement": {}})}
    catch (error) {expect(error.message).to.equal('"firstElement.name" is required');}

    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"}, "secondElement": {}})}
    catch (error) {expect(error.message).to.equal('"secondElement.name" is required');}
    
  }).timeout(1000);

  it('create a monitor with a monitor type that is not "cron"/"event" or "dryRun" should throw a BadRequest with message "monitor.type must be one of [cron, event, dryRun]"', async () => {
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"}, "secondElement": {"name": "secondElement"}, "monitor": {"type": "xxx"}})}
    catch (error) {expect(error.message).to.equal('"monitor.type" must be one of [cron, event, dryRun]');}
  }
  ).timeout(1000);

  it('create a monitor with no evaluation type should throw a BadRequest with message "monitor.evaluation.type is required"', async () => {
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"}, "secondElement": {"name": "secondElement"}, "monitor": {"type": "dryRun", "evaluation": {}}})
    }
    catch (error) {expect(error.message).to.equal('"monitor.evaluation.type" is required');}
  }
  ).timeout(1000);

  it('create a monitor with an unknown evaluation type should throw a BadRequest with message "Unrecognized evaluation type"', async () => {
    const data = {"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"type": "dryRun","evaluation": {"type": "unknown"}}}
    try {await app.service('monitor').create(data)}
    catch (error) {expect(error.message).to.equal('Unrecognized evaluation type');}
  }).timeout(1000);

  it('create a monitor with a firstElement/secondElement name that does not exist should throw a BadRequest with message "firstElement/secondElement not found"', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "xxx"
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "event",
        "name": "test_layer_name",
        "trigger": ["patched"],
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    try {await app.service('monitor').create(monitorObject)}
    catch (error) {
      expect(error.message).to.equal('Layer not found');
      expect(error.data.layer).to.equal('xxx');
    }

    monitorObject.firstElement.name = "firstElement"
    monitorObject.secondElement.name = "xxx"
    try {await app.service('monitor').create(monitorObject)}
    catch (error) {
      expect(error.message).to.equal('Layer not found');
      expect(error.data.layer).to.equal('xxx');
    }
  }).timeout(1000);

  it('create a monitor wich is not a dryRun needs a name,a type and a trigger', async () => {
    // type
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('"monitor.type" is required');}

    // name
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"type": "event","evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('"monitor.name" is required');}

    // trigger
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"type": "event","name": "monitor","evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('"monitor.trigger" is required');}
    
  }).timeout(5000);

  it('create a monitor with a type cron and trigger not a string should throw a BadRequest with message "if "monitor.type" is "cron","monitor.trigger" must be a string"', async () => {
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"name": "monitor","type": "cron","trigger": ["patched"],"evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('if "monitor.type" is "cron","monitor.trigger" must be a string');}
  }).timeout(5000);

  it('create a monitor with a type cron and trigger that is not a valid cron expression should throw a BadRequest with message "if "monitor.type" is "cron","monitor.trigger" must be a valid cron expression"', async () => {
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"name": "monitor","type": "cron","trigger": "xxx","evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('if "monitor.type" is "cron","monitor.trigger" must be a valid cron expression');}
  }).timeout(5000);

  it('create a monitor with a type event and trigger not an array should throw a BadRequest with message "if "monitor.type" is "event","monitor.trigger" must be an array"', async () => {
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"name": "monitor","type": "event","trigger": "patched","evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('if "monitor.type" is "event","monitor.trigger" must be an array');}
  }).timeout(5000);

  it('create a monitor with a type event and trigger that is not a list of strings should throw a BadRequest with message "if "monitor.type" is "event",all elements of "monitor.trigger" must be strings"', async () => {
    try {await app.service('monitor').create({"firstElement": {"name": "firstElement"},"secondElement": {"name": "secondElement"},"monitor": {"name": "monitor","type": "event","trigger": ["4",4],"evaluation": {"type": "geoIntersects"}}})}
    catch (error) {expect(error.message).to.equal('if "monitor.type" is "event",all elements of "monitor.trigger" must be strings');}
  }).timeout(5000);
  
  it('create a monitor wich has a name that already exists should throw a Conflict with message "Monitor with the same name already exists"', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement",
        "filter": {
          "properties.name": "randomname"
        }
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "event",
        "enabled": false, 
        "name": "name_conflict",
        "trigger": ["patched"],
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    const firstMonitor=await app.service('monitor').create(monitorObject)
    try {await app.service('monitor').create(monitorObject)}
    catch (error) {expect(error.message).to.equal('Monitor with the same name already exists');}

    //we delete the monitor
    await app.service('monitor').remove(firstMonitor._id)

    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(firstMonitor._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${firstMonitor._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}


  }).timeout(1000);

  it('patch a monitor wich was disabled and expect it to be enabled', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement"
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "event",
        "enabled": false,
        "name": "test_patch",
        "trigger": ["patched"],
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject)
    expect(result).toExist()
    expect(result.monitor.enabled).to.equal(false)
    const patchedMonitor = await app.service('monitor').patch(result._id, { monitor: { enabled: true } })
    expect(patchedMonitor).toExist()
    expect(patchedMonitor.monitor.enabled).to.equal(true)
    await app.service('monitor').remove(patchedMonitor._id)
    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(patchedMonitor._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${patchedMonitor._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }
  ).timeout(1000); 
  
  it('create a working monitor with a type event and deleting it', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement"
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "event",
        "name": "test_event",
        "trigger": ["patched"],
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject)
    expect(result).toExist()
    expect(result.monitor.type).to.equal('event')
    expect(result._id).toExist()
    expect((result.monitorObject.monitor.lastRun.alert)).to.equal('firing')
    await app.service('monitor').remove(result._id)
    // we expect the monitor to be deleted
    try {await app.service('monitor').get(result._id);throw new Error(`Monitor with ID ${result._id} still exists`);} 
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);}
  }).timeout(1000);

  it('create a working monitor with a type cron and deleting it', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement"
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "cron",
        "name": "test_cron",
        "trigger": "*/50 * * * *",
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject)
    expect(result).toExist()
    expect(result.monitor.type).to.equal('cron')
    expect(result._id).toExist()
    expect((result.monitorObject.monitor.lastRun.alert)).to.equal('firing')
    await app.service('monitor').remove(result._id)
    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(result._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }).timeout(1000);

  it('create a working monitor with a type cron and wait for its schedule and delete it', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement"
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "cron",
        "name": "test_cron_3s",
        "trigger": "*/3 * * * * *",
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
  
    const result = await app.service('monitor').create(monitorObject);
    expect(result).to.exist;
    expect(result.monitor.type).to.equal('cron');
    expect(result._id).to.exist;
  
    // Wait for the monitor event to be received
    const eventReceivedPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error('Event not received within timeout'));
      }, 3500); // Timeout of 4s
  
      app.service('monitor').once('test_cron_3s', (data) => {
        clearTimeout(timeoutId); 
        resolve(data); 
      });
    });
  
    // wait for the event to be received and check its status
    const eventData = await eventReceivedPromise;
    expect(eventData).to.exist;
    expect(eventData.status).to.equal('still firing');
  
    // delete the monitor
    await app.service('monitor').remove(result._id);
  
    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(result._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }).timeout(4000);

  it('create a working monitor with a type event and wait for its event and delete it', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement",
        "filter": {
          "properties.name": "featurename"
        }
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "event",
        "name": "test_event",
        "trigger": ["patched"],
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
  
    // Wait for the event with a timeout of 2 seconds
    const eventReceivedPromise = new Promise(async(resolve, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error('Event not received within timeout'));
      }, 2000); // Timeout of 2 seconds
  
      app.service('monitor').once('test_event', (data) => {
        clearTimeout(timeoutId);
        resolve(data);
      });
    });
  
    // Create the monitor
    const result = await app.service('monitor').create(monitorObject);
    expect(result).to.exist;
    expect(result.monitor.type).to.equal('event');
    expect(result._id).to.exist;
  
    // Retrieve the old feature
    const oldFeature = await app.service('api/features').find({ query: { "properties.name": "featurename" } });
  
    // Wait for the resolution of the event promise before updating the feature
    const eventData = await eventReceivedPromise;
  
    // Update the feature to trigger the event
    await app.service('api/features').patch(oldFeature.features[0]._id, { properties: { name: "featurename2" } });
  
    // Check the received event
    expect(eventData).to.exist;
    expect(eventData.status).to.equal('firing');
  
    // Revert the feature to its original state
    await app.service('api/features').patch(oldFeature.features[0]._id, { properties: { name: "featurename" } });
  
    // Remove the monitor
    await app.service('monitor').remove(result._id);
  
    // Verify that the monitor has been removed
    let deleted = false
    try {await app.service('monitor').get(result._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }).timeout(2500); 

  it('create a working monitor with a type event patching a feature to make it no longer fire', async () => {
      const monitorObject = {
        "firstElement": {
          "name": "firstElement",
          "filter": {
            "properties.name": "featurename"
          }
        },
        "secondElement": {
          "name": "secondElement"
        },
        "monitor": {
          "type": "event",
          "name": "test_event",
          "trigger": ["patched"],
          "evaluation": {
            "type": "geoIntersects"
          }
        }
      }
    

      // Create the monitor
      const result = await app.service('monitor').create(monitorObject);
      expect(result).to.exist;
      expect(result.monitor.type).to.equal('event');
      expect(result._id).to.exist;
  
      // Wait for the event with a timeout of 2 seconds
      const eventReceivedPromise = new Promise(async (resolve, reject) => {
        const timeoutId = setTimeout(() => {
          clearTimeout(timeoutId);
          reject(new Error('Event not received within timeout'));
        }, 2000); // Timeout of 2 seconds
    
        app.service('monitor').once('test_event', (data) => {
          clearTimeout(timeoutId);
          resolve(data);
        });

      });

      // trigger the event
      const oldFeature = await app.service('api/features').find({ query: { "properties.name": "featurename" } });
      await app.service('api/features').patch(oldFeature.features[0]._id, { geometry: { type: "Point", coordinates: [0, 0] } });
      
      // Wait for the resolution of the event promise before updating the feature
      const eventData = await eventReceivedPromise;

      // revert the feature to its original state
      await app.service('api/features').patch(oldFeature.features[0]._id, { geometry:oldFeature.features[0].geometry });
  
    
      // Check the received event
      expect(eventData).to.exist;
      expect(eventData.status).to.equal('no longer firing');
    
    
      // Remove the monitor
      await app.service('monitor').remove(result._id);
    
      // Verify that the monitor has been removed
      let deleted = false
      try {await app.service('monitor').get(result._id);}
      catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
      finally {expect(deleted).to.equal(true)}

    }).timeout(5000);

  it('create a working monitor with a condition filter that does not match any feature', async () => {
    const monitorObject = {
      "firstElement": {
        "name": "firstElement",
        "filter": {
          "$and" : [
            // can't be both at the same time
            {"properties.name": "featurename"},
            {"properties.name": "featurename2"}
          ]
        }
      },
      "secondElement": {
        "name": "secondElement"
      },
      "monitor": {
        "type": "event",
        "name": "test_event",
        "trigger": ["patched"],
        "evaluation": {
          "type": "geoIntersects"
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject);
    expect(result).toExist();
    expect(result.monitor.type).to.equal('event');
    expect(result._id).toExist();
    expect(result.monitor.lastRun.firing).to.equal(false);
    await app.service('monitor').remove(result._id);
    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(result._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }).timeout(1000);

  it('create a working monitor with a near evaluation that should fire', async () => {
    // if an active hubeau station is close to an inactive hubeau station, the monitor should fire
    const monitorObject = {
      "firstElement": {
        "name": "hubeau_hydro",
        "filter": {
          "properties.en_service": false
        }
      },
      "secondElement": {
        "name": "hubeau_hydro",
        "filter": {
          "properties.en_service": true
        }
      },
      "monitor": {
        "type": "event",
        "name": "test_proximity",
        "trigger": ["patched"],
        "evaluation": {
          "type": "near",
          "maxDistance": 2500
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject);
    expect(result).toExist();
    expect(result.monitor.type).to.equal('event');
    expect(result._id).toExist();
    expect(result.monitor.lastRun.firing).to.equal(true);
    await app.service('monitor').remove(result._id);
    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(result._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }
  ).timeout(1000);

  it('create a working monitor with a near evaluation that shouldn\'t fire', async () => {
    // if an active hubeau station is close to an inactive hubeau station, the monitor should fire
    const monitorObject = {
      "firstElement": {
        "name": "hubeau_hydro",
        "filter": {
          "properties.en_service": false
        }
      },
      "secondElement": {
        "name": "hubeau_hydro",
        "filter": {
          "properties.en_service": true
        }
      },
      "monitor": {
        "type": "event",
        "name": "test_proximity",
        "trigger": ["patched"],
        "evaluation": {
          "type": "near",
          "maxDistance": 1000
        }
      }
    }
    const result = await app.service('monitor').create(monitorObject);
    expect(result).toExist();
    expect(result.monitor.type).to.equal('event');
    expect(result._id).toExist();
    expect(result.monitor.lastRun.firing).to.equal(false);
    await app.service('monitor').remove(result._id);
    // we expect the monitor to be deleted
    let deleted = false
    try {await app.service('monitor').get(result._id);}
    catch (error) {expect(error.message).to.equal(`No record found for id '${result._id}'`);deleted = true}
    finally {expect(deleted).to.equal(true)}
  }
  ).timeout(1000);
})

// TODO REPAIR PATCH TESTS


