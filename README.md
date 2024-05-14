# geoKatcher
(pre-release doc)
exemple of monitor :

```json
{
  "firstElement": {
    "name": "layer1",
    "filter": {
      "properties.name" : "layer1name"
    }
  },
  
  "secondElement": {
    "name": "layer2",
    "filter": {
      "properties.name": "layer2name"
    }
  },
  
  "monitor": {
    "name" : "monitor-name",
    "enabled" : true,
    "type": "event",
    "trigger" : ["patched"],
    
    "evaluation": {
      "alertOn": "data",
      "type": "geoWithin"
    },
    "action":
            {
        "type" : "slack-webhook",
        "url" : "https://hooks.slack.com/services/T------V/B--------F/B---------I"}
  
  }
}

```

When doing a request: 
- We get the geometries of the first element 
- Generate MongoDB queries for each geometry (nb of queries = nb of geometries)
- Query the second element service for matching features with each geometry