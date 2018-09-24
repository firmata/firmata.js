const Emitter = require("events");
const factory = require("../../packages/firmata-io/lib/firmata.js");


class SerialTransport extends Emitter {
  constructor(path, options) {
    super();

    Object.assign(this.settings = {}, options);
  }

  write(data, callback) {}
}
describe("Serialport", function() {
  let Firmata;

  beforeEach(() => {
    Firmata = factory(SerialTransport);
  });
  afterEach(() => {
    factory(undefined);
  });

  it("Default settings sent to Serialport", done => {
    const board = new Firmata("/fake/usb");

    assert.equal(board.transport.settings.baudRate, 57600);
    assert.equal(board.transport.settings.highWaterMark, 256);
    done();
  });

  it("Override settings sent to Serialport", done => {
    const board = new Firmata("/fake/usb", {
      serialport: {
        baudRate: Number.POSITIVE_INFINITY,
        highWaterMark: Number.POSITIVE_INFINITY,
      },
    });

    assert.equal(board.transport.settings.baudRate, Number.POSITIVE_INFINITY);
    assert.equal(board.transport.settings.highWaterMark, Number.POSITIVE_INFINITY);
    done();
  });
});
