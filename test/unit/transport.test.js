const factory = require("../../packages/firmata-io/lib/firmata.js");

describe("Transport", function() {

  it("undefined Transport", done => {
    const Firmata = factory(undefined);

    assert.throws(() => {
      new Firmata();
    });

    done();
  });

  it("null Transport", done => {
    const Firmata = factory(null);

    assert.throws(() => {
      new Firmata();
    });

    done();
  });

});
