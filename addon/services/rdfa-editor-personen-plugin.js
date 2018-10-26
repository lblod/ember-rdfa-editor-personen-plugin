import Service, { inject as service } from '@ember/service';
import EmberObject from '@ember/object';
import { task, timeout } from 'ember-concurrency';
import memoize from '../utils/memoize';
import { tokenizeNames } from '../utils/text-tokenizing-utils';

const personRdfaClass = 'http://www.w3.org/ns/person#Person';

/**
* RDFa Editor plugin that hints mandatarissen when typing their name.
*
* @module editor-personen-plugin
* @class RdfaEditorPersonenPlugin
* @constructor
* @extends EmberService
*/
const RdfaEditorPersonenPlugin = Service.extend({
  metaModelQuery: service(),
  store: service(),

  init(){
    this._super(...arguments);
    this.set('memoizedTokenize', memoize(tokenizeNames.bind(this)));
    this.set('memoizedFindPropertiesWithRange',
             memoize((classType, range) => this.metaModelQuery.findPropertiesWithRange(classType, range)));
  },

  /**
   * Restartable task to handle the incoming events from the editor dispatcher
   *
   * @method execute
   *
   * @param {string} hrId Unique identifier of the event in the hintsRegistry
   * @param {Array} contexts RDFa contexts of the text snippets the event applies on
   * @param {Object} hintsRegistry Registry of hints in the editor
   * @param {Object} editor The RDFa editor instance
   *
   * @public
   */
  execute: task(function * (hrId, contexts, hintsRegistry, editor, extraInfo = []) {
    if (contexts.length === 0) return;

    // if we see event was triggered by this plugin, ignore it
    if(extraInfo.find(i => i && i.who == this.who))
      return;

    yield this.loadPersonsForZitting();

    yield timeout(300);

    const cards = [];

    for (let context of contexts) {
      const rdfaProperties = yield this.detectRdfaPropertiesToUse(context);
      if(rdfaProperties.length == 0) continue;

      const hints = yield this.generateHintsForContext(context);
      if(hints.length == 0) continue;

      hintsRegistry.removeHintsInRegion(context.region, hrId, this.who);
      cards.push(...this.generateCardsForHints(rdfaProperties, hrId, hintsRegistry, editor, hints));
    }

    if(cards.length > 0){
      hintsRegistry.addHints(hrId, this.who, cards);
    }
  }).restartable(),

  async detectRdfaPropertiesToUse(context){
    const lastTriple = context.context.slice(-1)[0] || {};
    if(!lastTriple.predicate == 'a')
      return [];

    const classType = lastTriple.object;
    if(classType.trim().length == 0)
      return [];

    return this.memoizedFindPropertiesWithRange(classType.trim(), personRdfaClass);
  },

  async loadPersonsForZitting(){
    const node = document.querySelectorAll("[property='http://data.vlaanderen.be/ns/besluit#isGehoudenDoor']")[0];
    if(!node || !node.attributes || !node.attributes.resource || !node.attributes.resource.value)
      return;

    const bestuursorgaanUri = node.attributes.resource.value;
    if(this.bestuursorgaanInTijd == bestuursorgaanUri)
      return;

    this.set('bestuursorgaanInTijd', bestuursorgaanUri);
    await this.store.unloadAll('persoon');

    //start loading
    let queryParams = {
      'filter[is-aangesteld-als][bekleedt][bevat-in][:uri:]': bestuursorgaanUri,
      page: { size: 10000 }
    };

    await this.store.query('persoon', queryParams);
  },

  /**
   given token with partial (potential) name, find persons

   @method findPartialMatchingPersons

   @param {object} token

   @return {object} Ember array

   @private
   */
  async findPartialMatchingPersons(token){

    const startsGebruikteVoornaam = person => {
      return (person.gebruikteVoornaam || '').toLowerCase().startsWith(token.sanitizedString.toLowerCase());
    };

    const startsAchternaam = person => {
      return (person.achternaam || '').toLowerCase().startsWith(token.sanitizedString.toLowerCase());
    };

    const startsFullName = person => {
      return (person.fullName || '').toLowerCase().startsWith(token.sanitizedString.toLowerCase());
    };

    return this.store.peekAll('persoon').filter(person => {
      return startsFullName(person) ||  startsGebruikteVoornaam(person) || startsAchternaam(person);
    });

  },

  /**
   * Maps location of substring back within reference location
   *
   * @method normalizeLocation
   *
   * @param {[int,int]} [start, end] Location withing string
   * @param {[int,int]} [start, end] reference location
   *
   * @return {[int,int]} [start, end] absolute location
   *
   * @private
   */
  normalizeLocation(location, reference){
    return [location[0] + reference[0], location[1] + reference[0]];
  },

  /**
   generates cards for array of hints

   @method generateCardsForHints

   @param {object} rdfaProperties object
   @param {object} hrId
   @param {object} hintsRegistry
   @param {object} editor
   @param {array} hints

   @return {object} card object

   @private
   */
  generateCardsForHints(rdfaProperties, hrId, hintsRegistry, editor, hints){
    return hints.map(hint => this.generateCard(rdfaProperties,
                                   hint.person,
                                   hint.normalizedLocation,
                                   hrId, hintsRegistry,
                                   editor));
  },

  /**
   generates card

   @method generateCard

   @param {Object} rdfaProperties
   @param {EmberObject} person
   @param {object} location in the editor (normalized)
   @param {object} hrId
   @param {object} hintsRegistry
   @param {object} editor

   @return {object} card object

   @private
   */
  generateCard(rdfaProperties, person, location, hrId, hintsRegistry, editor) {
    return EmberObject.create({
      location: location,
      info: { person, location, hrId, hintsRegistry, editor, rdfaProperties },
      card: this.who
    });
  },

  /**
   * Generates a hint, given a context
   *
   * @method generateHintsForContext
   *
   * @param {Object} context Text snippet at a specific location with an RDFa context
   *
   * @return {Object} [{dateString, location}]
   *
   * @private
   */
  async generateHintsForContext(context){
    const tokens = await this.memoizedTokenize(context.text);

    let allHints = [];

    for(let token of tokens){
      const persons = await this.findPartialMatchingPersons(token);

      if(persons.length === 0) continue;

      token.normalizedLocation = this.normalizeLocation(token.location, context.region);
      token.persons = persons;

      allHints = allHints.concat(token);
    }

    //remove double hints by taking biggest overlapping region (and thus most specific hint)
    //e.g 'Felix Ruiz' should give one hint for 'Felix Ruiz' and not 'Felix', 'Ruiz'
    const cleanedHints = allHints.filter(this.isLargestOverlappingHint);
    const flattenedHints = [];
    cleanedHints.forEach(hint => {
      hint.persons.forEach(person => {
        flattenedHints.push({
          location: hint.location,
          normalizedLocation: hint.normalizedLocation,
          person: person
        });
      });
    });

    return flattenedHints;
  },

  /**
   Checks if hint.location is largest overlapping hint within array.

   @method isLargestOverlappingHint

   @return {boolean}

   @private
   */
  isLargestOverlappingHint(currentHint, currentIndex, hints){
    const containsLocation = (testLocation, refLocation) => {
      return refLocation[0] <= testLocation[0] && testLocation[1] <= refLocation[1];
    };

    const isRealOverlap = (element, index) => {
      return containsLocation(hints[currentIndex].location, hints[index].location) && currentIndex !== index;
    };

    return hints.find(isRealOverlap) === undefined;

  }
});

RdfaEditorPersonenPlugin.reopen({
  who: 'editor-plugins/personen-card'
});
export default RdfaEditorPersonenPlugin;
