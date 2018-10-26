import EmberObject from '@ember/object';
import PersoonMixin from '@lblod/ember-rdfa-editor-personen-plugin/mixins/persoon';
import { module, test } from 'qunit';

module('Unit | Mixin | persoon', function() {
  // Replace this with your real tests.
  test('it works', function (assert) {
    let PersoonObject = EmberObject.extend(PersoonMixin);
    let subject = PersoonObject.create();
    assert.ok(subject);
  });
});
