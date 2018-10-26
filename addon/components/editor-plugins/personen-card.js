import { computed } from '@ember/object';
import Component from '@ember/component';
import layout from '../../templates/components/editor-plugins/personen-card';
import InsertResourceRelationCardMixin from '@lblod/ember-rdfa-editor-generic-model-plugin-utils/mixins/insert-resource-relation-card-mixin';

/**
* Card displaying a hint of the Personen plugin
*
* @module editor-personen-plugin
* @class PersonenCard
* @extends Ember.Component
*/
export default Component.extend(InsertResourceRelationCardMixin, {
  layout,
  hintOwner: 'editor-plugins/personen-card',

  serializeToJsonApi(resource){
    //This is because we're not sure uri is kept (due to bug in mu-cl-resources/or ember-ds?)
    const serializedResource = resource.serialize({includeId: true});
    serializedResource.data.attributes.uri = resource.uri;
    return serializedResource;
  },

  personCombinedWithProperties: computed('info', function(){
    return this.info.rdfaProperties.map(prop => {
      return { person: this.info.person, prop: prop };
    });
  }),

  actions: {
    async refer(data){
      const personJsonApi = this.serializeToJsonApi(data.person);
      const rdfaRefer = await this.getReferRdfa(await data.prop, personJsonApi, data.person.fullName);
      const mappedLocation = this.hintsRegistry.updateLocationToCurrentIndex(this.hrId, this.location);
      this.hintsRegistry.removeHintsAtLocation(this.location, this.get.hrId, this.hintOwner);
      this.editor.replaceTextWithHTML(...mappedLocation, rdfaRefer, [{ who: this.hintOwner }]);
    },
    async extend(data){
      const personJsonApi = this.serializeToJsonApi(data.person);
      const rdfaRefer = await this.getReferRdfa(await data.prop, personJsonApi);
      const mappedLocation = this.hintsRegistry.updateLocationToCurrentIndex(this.hrId, this.location);
      this.hintsRegistry.removeHintsAtLocation(this.location, this.get.hrId, this.hintOwner);
      this.editor.replaceTextWithHTML(...mappedLocation, rdfaRefer, [{ who: this.hintOwner }]);
    }
  }
});
