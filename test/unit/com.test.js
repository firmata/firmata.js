// This test file is primarily for rounding out test coverage
// and gaurding against changes to the "serialport" stubs.
require("../common/bootstrap");

var sandbox = sinon.sandbox.create();

describe("SerialPort", function() {
  it("SerialPort is a function", function(done) {
    assert.equal(typeof SerialPort, "function");
    done();
  });

  it("SerialPort.list is a function", function(done) {
    assert.equal(typeof SerialPort.list, "function");
    done();
  });
});
