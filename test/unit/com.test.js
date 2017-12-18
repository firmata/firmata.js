// This test file is primarily for rounding out test coverage
// and gaurding against changes to the "com" stubs.
require("../common/bootstrap");

var sandbox = sinon.sandbox.create();

describe("com.*", function() {

  var response = {
    error: null,
    port: {
      comName: null
    },
  };

  it("com.SerialPort", function(done) {
    assert.equal(typeof com.SerialPort, "function");
    done();
  });

  it("com.list", function(done) {
    assert.equal(typeof com.list, "function");
    done();
  });
});
