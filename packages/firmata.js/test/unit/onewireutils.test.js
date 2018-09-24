require("../common/bootstrap");

const sandbox = sinon.sandbox.create();

describe("OneWire.crc8/OneWire.readDevices", () => {

  afterEach(() => {
    sandbox.restore();
  });

  describe("OneWire.crc8", () => {
    it("must CRC check data read from firmata", done => {
      const input = [0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D];
      const crcByte = OneWire.crc8(input.slice(0, input.length - 1));

      assert.equal(crcByte, input[input.length - 1]);

      done();
    });
    it("must return an invalid CRC check for corrupt data", done => {
      const input = [0x28, 0xDB, 0xEF, 0x22, 0x05, 0x00, 0x00, 0x5D];
      const crcByte = OneWire.crc8(input.slice(0, input.length - 1));

      crcByte.should.not.equal(input[input.length - 1]);

      done();
    });
  });
  describe("OneWire.readDevices", () => {
    it("must read device identifier", done => {
      const input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D]);
      const devices = OneWire.readDevices(input);

      assert.equal(devices.length, 1);

      done();
    });
    it("must read device identifiers", done => {
      const input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D]);
      const devices = OneWire.readDevices(input);

      assert.equal(devices.length, 2);

      done();
    });
    it("must read only complete device identifiers", done => {
      const input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x00, 0x01, 0x02]);
      const devices = OneWire.readDevices(input);

      assert.equal(devices.length, 2);

      done();
    });

    it("detects and logs invalid ROM", done => {

      sandbox.stub(console, "error").callsFake(() => {});
      sandbox.stub(OneWire, "crc8").callsFake(() => null);

      const input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x00, 0x01, 0x02]);
      const devices = OneWire.readDevices(input);

      assert.equal(devices.length, 2);
      assert.equal(console.error.lastCall.args[0], "ROM invalid!");

      done();
    });
  });
});
