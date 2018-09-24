// This test file is primarily for rounding out test coverage
// and gaurding against changes to the "com" stubs.
require("../common/bootstrap");

const sandbox = sinon.sandbox.create();

describe("com.*", () => {

  const response = {
    error: null,
    port: {
      comName: null
    },
  };

  it("com.SerialPort", done => {
    assert.equal(typeof com.SerialPort, "function");
    done();
  });

  it("com.list", done => {
    assert.equal(typeof com.list, "function");
    done();
  });
});

