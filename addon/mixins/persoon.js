import Mixin from '@ember/object/mixin';
import { computed } from '@ember/object';
import attr from 'ember-data/attr';

export default Mixin.create({
  fullName: computed('gebruikteVoornaam', 'achternaam', function() {
    return `${this.get('gebruikteVoornaam')} ${this.get('achternaam')}`;
  }),

  achternaam: attr(),
  alternatieveNaam: attr(),
  gebruikteVoornaam: attr(),
  geslacht: attr(),
  uri: attr()
});
