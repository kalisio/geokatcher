// We import the hooks for this service from the hooks.js file
import hooks from './monitors.hooks.js'
import createService  from 'feathers-mongoose';
import monitorsModel  from '../../models/monitors.model.js';




export default function async (app) {
   const Model = monitorsModel.createModel(app);
   const paginate = app.get('paginate');
   
   const options = {
      Model,
      lean: true,
      paginate,
      multi: ['delete', 'patch', 'update']
   };
   
   
   app.use('monitor', createService(options));
   app.service('monitor').hooks(hooks)
   
   app.on('kano:ready', () => {
      monitorsModel.startExistingMonitors();
   });

}