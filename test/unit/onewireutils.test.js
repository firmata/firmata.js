require("../common/bootstrap");

var sandbox = sinon.sandbox.create();

describe("OneWire.crc8/OneWire.readDevices", function () {

  afterEach(function() {
    sandbox.restore();
  });

  describe("OneWire.crc8", function () {
    it("must CRC check data read from firmata", function (done) {
      var input = [0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D];
      var crcByte = OneWire.crc8(input.slice(0, input.length - 1));

      assert.equal(crcByte, input[input.length - 1]);

      done();
    });
    it("must return an invalid CRC check for corrupt data", function (done) {
      var input = [0x28, 0xDB, 0xEF, 0x22, 0x05, 0x00, 0x00, 0x5D];
      var crcByte = OneWire.crc8(input.slice(0, input.length - 1));

      crcByte.should.not.equal(input[input.length - 1]);

      done();
    });
  });
  describe("OneWire.readDevices", function () {
    it("must read device identifier", function (done) {
      var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D]);
      var devices = OneWire.readDevices(input);

      assert.equal(devices.length, 1);

      done();
    });
    it("must read device identifiers", function (done) {
      var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D]);
      var devices = OneWire.readDevices(input);

      assert.equal(devices.length, 2);

      done();
    });
    it("must read only complete device identifiers", function (done) {
      var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x00, 0x01, 0x02]);
      var devices = OneWire.readDevices(input);

      assert.equal(devices.length, 2);

      done();
    });

    it("detects and logs invalid ROM", function (done) {

      sandbox.stub(console, "error", () => {});
      sandbox.stub(OneWire, "crc8", () => null);

      var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x00, 0x01, 0x02]);
      var devices = OneWire.readDevices(input);

      assert.equal(devices.length, 2);
      assert.equal(console.error.lastCall.args[0], "ROM invalid!");

      done();
    });
  });
});
