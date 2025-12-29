# geoKatcher

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/geokatcher?sort=semver&label=latest)](https://github.com/kalisio/geokatcher/releases)
[![CI](https://github.com/kalisio/geokatcher/actions/workflows/main.yaml/badge.svg)](https://github.com/kalisio/geokatcher/actions/workflows/main.yaml)
[![Maintainability Issues](https://sonar.portal.kalisio.com/api/project_badges/measure?project=kalisio-geokatcher&metric=software_quality_maintainability_issues&token=sqb_cd30e069e54f792c73676aab535cf782ad32c4a0)](https://sonar.portal.kalisio.com/dashboard?id=kalisio-geokatcher)
[![Coverage](https://sonar.portal.kalisio.com/api/project_badges/measure?project=kalisio-geokatcher&metric=coverage&token=sqb_cd30e069e54f792c73676aab535cf782ad32c4a0)](https://sonar.portal.kalisio.com/dashboard?id=kalisio-geokatcher)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Kalisio geofencing service**

**geoKatcher** is a service that allows to monitor geofences between two layers of geospatial data.<br>
for now only the following sources are supported:
- Kalisio Maps ([_Kano_](https://github.com/kalisio/kano))

Using the [feathers](https://github.com/feathersjs/feathers) framework, and [feathers-distributed](https://github.com/kalisio/feathers-distributed) extension.<br>
GeoKatcher can discover Kano services and query them to retrieve layers and features. Additionally, it can publish its `monitor` service, allowing other services to interact with it and receive events.

<details open>
<summary>Summary</summary>

* [Configuration](#configuration)
* [API](#api)
  - [/healthcheck](#healthcheck-get)
  - [/monitor](#monitor)
- [Monitor structure](#monitor-structure)
  - [Layer Element](#layer-element)
  - [Monitor Element](#monitor-element)
    - [Evaluation](#evaluation)
    - [Action](#action)
      - [Additional Properties (crisis-webhook)](#additional-properties-crisis-webhook)
      - [Additional Properties (custom-request)](#additional-properties-custom-request)

    
- [Object representation](#object-returned-by-the-service)
- [Behavior](#behavior)
  - [Error handling](#error-handling)
  - [Request to kano services](#request-to-kano-services)
  - [Patching a monitor](#patching-a-monitor)
</details>

## Configuration

### Environment variables
| Variable  | Description | Defaults |
|-----------| ------------| ------------|
| `PORT` | The port to be used when exposing the service |  `8080` |
| `HOSTNAME` | The hostname to be used when exposing the service | `localhost` |
| `DB_URL` | The url of the database | `mongodb://localhost:27017/geokatcher` |
| `BASE_URL` | The url used when exposing the service | `localhost:8080` |
| `API_PATH` | The path to the API |



## API

### /healthcheck (GET)

Checks for the health of the service, returns a json object with the name of the service (geokatcher) and it's version number.

### /monitor 

| Method | Endpoint       | Description                           |
|--------|----------------|---------------------------------------|
| POST   | /monitor       | Create a new monitor                   |
| GET    | /monitor       | Get all the monitors                   |
| GET    | /monitor/:id   | Get a monitor by its id                |
| PUT    | /monitor/:id   | Update a monitor by its id (complete)  |
| PATCH  | /monitor/:id   | Update a monitor by its id (partial)   |
| DELETE | /monitor/:id   | Delete a monitor by its id             |




## Monitor structure

A monitor is a JSON object with 3 main parts:
| Part           | Description                           | Type | Presence |
|----------------|---------------------------------------| ---- | ------- |
| target   | The first layer to monitor             | ``Object`` | `Required` |
| zone  | The second layer to monitor            | ``Object`` |  `Required` |
| monitor        | The monitor information                | ``Object`` | `Required` |


### Layer Element

A layer element (either target or zone) is an object that specifies the layer to monitor and can include filters to select only a subset of the layer.
```json
{
  "name": "layer1",
  "filter": {
    "properties.name" : "layer1name"
  }
}
```

| Field       | Description                           | Type | Presence |
|-------------|---------------------------------------| ---- | ------- |
| name        | The name (or id) of the layer to monitor     | ``String`` | `Required` |
| filter      | An optional filter object (MongoDB query syntax) | ``Object`` | `Optional`, default : `{}`|

The layer can be a user defined layer like `layer1` or a built-in layer like `hubeau_hydro` (or `Layers.HUBEAU_HYDRO`)


### Monitor Element

The monitor element is an object that contains the monitor information.<br>

| Field       | Description                           | Type | Constraints | Presence |
|-------------|---------------------------------------| ---- | ------- | ------- |
| name        | The name of the monitor              | ``String`` | | `Required` |
| description | The description of the monitor        | ``String`` || `Optional`, default : `''` |
| enabled     |if the monitor is enabled or not      | ``Boolean`` || `Optional`, default : `true` |
| type        | The type of the monitor  | ``String`` | ``event`` or ``cron`` or `dryRun(Only on create)`| `Required` |
| trigger     | The trigger of the monitor  | ``Array`` or ``String`` | ``array of events`` or ``a valid cron expression`` | `Required` |
| evaluation  | The evaluation of the monitor (what should be the operation to do) | ``Object`` | | `Required` |
| action      | The action of the monitor (what should be done when the monitor alert status changes) | ``Object`` | | `Optional`, default : `{}` |

⚠️ Even if no action is provided, the monitor will still emit an event on its feather-service when the monitor alert status changes.<br>
⚠️ The ``dryRun`` option is a special type of monitor that allows you to test the monitor without actually saving it in the database, executing any actions, or emitting events.<br><br>
in case of a dryRun, the following fields are not required : 
- `name`
- `trigger`
```javascript
// dryRun response
{
  "monitorObject" : {
    // The monitor object
  },
  "result" : {
    // The features that are returned by the evaluation
  }
}
```


### ⮑ <u>Evaluation :</u>
###### Evaluation

| Field       | Description                           | Type | Constraints | Presence |
|-------------|---------------------------------------| ---- | ------- |  ------- | 
| alertOn     | Alert if the data is inside or outside the geofence | ``String`` | ``data`` or ``noData`` | `Optional`, default : `data` |
| type        | The type of the evaluation          | ``String`` | ``geoWithin``, ``geoIntersects`` or ``near`` | `Required` |
| _maxDistance_| The maximum distance to consider for the near evaluation | ``Number`` | ``> 0``, only for the near type | `Optional`, default : `1000` |
| _minDistance_| The minimum distance to consider for the near evaluation | ``Number`` | ``> 0``, only for the near type | `Optional`, default : `0` |

### ⮑ <u>Action :</u>
###### Action
| Field       | Description                           | Type | Constraints | Presence |
|-------------|---------------------------------------| ---- | ------- | ------- | 
| type        | The type of the action  | ``String`` | ``slack-webhook``, ``crisis-webhook``, ``custom-request``,``no-webhook`` | `Optional`, default : `no-webhook` |
| url         | The url of the action  | ``String`` | ``valid url``, | `Required` when not `no-webhook` |
| cooldown    | The cooldown before next `Still firing` alert | ``Number`` seconds | ``>= 0`` | `Optional`, default : `60` |
| _additionalProperties_ | Additional properties for the action | ``Object`` | only for `crisis-webhook` and `custom-request` type | `Required` |


#### ⮑⮑ <u>Additional Properties :</u> (crisis-webhook)
###### Additional Properties (crisis-webhook)


| Field       | Description                           | Type | Constraints | Presence |
|-------------|---------------------------------------| ---- | ------- | ------- | 
| organisation| The organisation id  | ``String`` | | `Required` | 
| token       | The token to interact with the crisis service  | ``String`` | | `Required` | 
| data        | The data to send to the crisis service  | ``Object`` | | `Required` | 

##### ⮑⮑⮑ <u>Data :</u>
###### Data
| Field       | Description                           | Type | Constraints | Presence | 
|-------------|---------------------------------------| ---- | ------- |  ------- |
| name        | The name of the data   | ``String`` | | `Optional`, default : monitor name |
| description | The description of the data  | ``String`` | | `Optional`, default : monitor description |
| template    | The template of the alert in crisis (id or name)  | ``String`` | | `Required` |

#### ⮑⮑ <u>Additional Properties :</u> (custom-request)
###### Additional Properties (custom-request)
| Field       | Description                           | Type | Constraints | Presence | 
|-------------|---------------------------------------| ---- | ------- | ------- | 
| method      | The method of the request  | ``String`` | ``GET``, ``POST``, ``PUT``, ``PATCH``, ``DELETE`` |  `Required` |
| headers     | The headers of the request  | ``Object`` | | `Optional`, default : `{}` |
| body        | The body of the request  | ``Object`` | | `Optional`, default : `{}` |

The ``custom-request`` action supports basic templating using the ``%_%`` syntax.
placing :
-  `%monitorName%` in the url,body or headers will be replaced by the monitor name.
-  `%monitorStatus%` in the url,body or headers will be replaced by the monitor alert status.

<!-- 
### e
-->


## Object representation
The object returned by the service will have the following structure:
```javascript
{
  "_id": "6644cf4f83bf298f8a8bb1ba"       // id auto generated by the service
  "target": {
    "name": "layer1",
    "filter": {
      "properties.name": "layer1featureA"
    },
    
    "layerInfo": {                          // Generated by the service to determine on which kano service to query 
      "kanoService": "features",            // The kano service to query
      "layerId": "663e3593fb7a85c83f5084fe" // The layer id (layer1)
    }
  },
  "zone": {
    "name": "layer2",
    "filter": {
      "properties.name": "layer2featureB"
    },
    "layerInfo": {                          // Generated by the service to determine on which kano service to query
      "kanoService": "features",            // The kano service to query
      "layerId": "6628d597151fd9493aedd094" // The layer id (layer2)        
    }
  },
  "monitor": {
    "description": "description du moniteur",
    "type": "event",
    "trigger": [
      "patched"
    ],
    "name": "nice monitor",
    "enabled": true,
    "evaluation": {
      "alertOn": "data",
      "type": "geoIntersects"
    },
    "action": {
      "type": "crisis-webhook",
      "url": "https://crisis-service/api/webhooks/events",
      "additionalProperties": {
        "organisation": "85c83f5084fe6644cf4f83bf",
        "token": "euzyfgnzeufhiuzefze",
        "data": {
          "template": "Webhook alert",
        }
      },
      "cooldown": 1
    },
    "lastRun": {                          // Generated by the service after each run of the monitor
      "date": "2024-05-17T15:50:19.331Z", // The date of the last run
      "lastActionRun": 0,                 // The date of the last action run
      "alert": "not firing",              // Last alert status
      "status": {                         // Last status of the monitor
        "success": true                   // if an error occured the name,message and data will be described here
      }
    }
  },
  "createdAt": "2024-05-15T15:05:51.534Z", // Generated by the service
  "updatedAt": "2024-05-17T15:50:19.334Z"  // Generated/updated by the service
}
```
The following fields are generated by the service and will be ignored if provided by the user<br>

| Field                     | Description                                                                 |
|---------------------------|-----------------------------------------------------------------------------|
| `_id`                     | The service-generated ID for each monitor                                    |
| `layerInfo`  | The service-generated layerInfo object to determine which Kano service to query |
| `lastRun`         | The service-generated lastRun object after each run of the monitor           |
| `createdAt`               | The service-generated creation date of the monitor                           |
| `updatedAt`               | The service-generated last update date of the monitor                        |

In case of an error, the lastRun status object will contain the following fields:
```javascript
{
  "status": {
    "success": false,
    "error": {
      "message": "Layer not found",
      "data": {
        "layer": "layer3"
      }
    }
  }
}$
```

## Behavior
### Error handling
Before any CREATE,PATCH,PUT operation, the service will validate the monitor structure and then run the monitor evaluation<br>
If an error occurs, the monitor will not be saved and the error will be returned to the user.
| Error code | Error name | Description                           |
|------------|------------|---------------------------------------|
| 400        | Bad Request | The monitor structure is not valid    |
| 404        | Not Found   | A layer was not found during evalutation       |
| 404        | Not Found   | A monitor was not found during update/patch/delete |
| 409        | Conflict    | A monitor with the same name already exists |
| 500        | Internal Server Error | Kano service error |
| 500        | Internal Server Error | Any other error |



### Request to kano services
When making a request:
  - Retrieve the geometries of the features of the target.
  - Generate MongoDB queries for each geometry (number of queries equals the number of geometries).
  - Query the zone service to find matching features for each geometry.

⚠️ Order matters, the target is the one that will be used to generate the queries, the zone is the one that will be queried.<br>
depending on the type of evaluation, arrange the layers accordingly to get the desired result and least amount of queries.

- `geoWithin` : the zone should be inside the target
- `geoIntersects` : the target and the zone should intersect (target should be the layer with the least amount of features*)
- `near` : the target and the zone should be near each other (target should be the layer with the least amount of features*)

_*considering the filters_

⚠️ The services will only return the first 5000 features that match the query, if you have more than 5000 features that match the query, consider using a filter to reduce the number of features returned.


### Patching a monitor
The patch operation updates only the fields provided in the request. Other fields will remain unchanged. However, certain internal fields need to be re-specified in the request even if they are not being updated, because they can be considered optional.

For example:
- When updating the ``layerElement``, it is necessary to provide the ``filters`` (if specified) again. Otherwise, it will be assumed that the user wants to remove the filters.
- When updating the ``monitor.action``, it is necessary to provide ``additionalProperties`` (if specified) again. Otherwise, it will be assumed that the user wants to remove the field.

These constraints apply only if the specific part of the monitor is being updated. If you do not update ``monitor.action`` in the request body, you do not need to provide the ``additionalProperties`` field. The same applies to the ``layerElement`` filters.
