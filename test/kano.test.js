import {expect} from 'chai'


async function kanoTest() {
    // this, is the global object with all the global variables
    let app,kano

    before(() => {
        app = this.app
        kano = app.get('kano')
    })

    
    it('kano services are available', async () => {
      // we check if app.services contains the catalog, features and hubeau-hydro services
      expect(app.services['api/catalog']).toExist()
      expect(app.services['api/features']).toExist()
      expect(app.services['api/hubeau-hydro-stations']).toExist()
    }).timeout(10000)
  
    it('getLayerData with no name should throw a BadRequest with message "Layer name is required"', async () => {

      try {
        await kano.getLayerData()
      } catch (error) {
        expect(error.message).to.equal('Layer name is required')
      }
    }).timeout(10000)
  
    it('getLayerData with name "xxx" should throw a NotFound with message "Layer not found"', async () => {

      try {
        await kano.getLayerData('xxx')
      } catch (error) {
        expect(error.message).to.equal('Layer not found')
      }
    }).timeout(10000)
  
    it('getLayerData with name "hubeau_hydro" should return the corresponding layer', async () => {

      const layer = await kano.getLayerData('hubeau_hydro')
      expect(layer).toExist()
      expect(layer.name).to.equal('Layers.HUBEAU_HYDRO')
    }).timeout(10000)
  
    it('getLayerFeatures with no layer should throw a BadRequest with message "Layer is required"', async () => {

      try {
        await kano.getLayerFeatures()
      } catch (error) {
        expect(error.message).to.equal('Layer is required')
      }
    }).timeout(10000)
  
    it('getLayerFeatures with layer "hubeau_hydro" and no filters should return 10 features', async () => {

      const layer = await kano.getLayerData('hubeau_hydro')
      const features = await kano.getLayerFeatures(layer)
      expect(features).toExist()
      expect(features.features.length).to.equal(10)
    }).timeout(10000)
  
    it('getLayerFeatures with layer "hubeau_hydro" and filter code_station #O962053101 should return 1 feature', async () => {

      const layer = await kano.getLayerData('hubeau_hydro')
      const features = await kano.getLayerFeatures(layer, { 'properties.code_station': '#O962053101' })
      expect(features).toExist()
      expect(features.features.length).to.equal(1)
    }).timeout(10000)
  
}


export default kanoTest