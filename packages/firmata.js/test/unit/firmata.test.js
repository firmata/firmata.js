"use strict";

require("../common/bootstrap");

// Test specific internals
//
const Board = firmata.Board;

const ANALOG_MAPPING_QUERY = 0x69;
const ANALOG_MAPPING_RESPONSE = 0x6A;
const ANALOG_MESSAGE = 0xE0;
const CAPABILITY_QUERY = 0x6B;
const CAPABILITY_RESPONSE = 0x6C;
const DIGITAL_MESSAGE = 0x90;
const END_SYSEX = 0xF7;
const EXTENDED_ANALOG = 0x6F;
const I2C_CONFIG = 0x78;
const I2C_REPLY = 0x77;
const I2C_REQUEST = 0x76;
const I2C_READ_MASK = 0x18;   // 0b00011000
const I2C_END_TX_MASK = 0x40; // 0b01000000
const ONEWIRE_CONFIG_REQUEST = 0x41;
const ONEWIRE_DATA = 0x73;
const ONEWIRE_DELAY_REQUEST_BIT = 0x10;
const ONEWIRE_READ_REPLY = 0x43;
const ONEWIRE_READ_REQUEST_BIT = 0x08;
const ONEWIRE_RESET_REQUEST_BIT = 0x01;
const ONEWIRE_SEARCH_ALARMS_REPLY = 0x45;
const ONEWIRE_SEARCH_ALARMS_REQUEST = 0x44;
const ONEWIRE_SEARCH_REPLY = 0x42;
const ONEWIRE_SEARCH_REQUEST = 0x40;
const ONEWIRE_WITHDATA_REQUEST_BITS = 0x3C;
const ONEWIRE_WRITE_REQUEST_BIT = 0x20;
const PIN_MODE = 0xF4;
const PIN_STATE_QUERY = 0x6D;
const PIN_STATE_RESPONSE = 0x6E;
const PING_READ = 0x75;
const PULSE_IN = 0x74;
const PULSE_OUT = 0x73;
const QUERY_FIRMWARE = 0x79;
const REPORT_ANALOG = 0xC0;
const REPORT_DIGITAL = 0xD0;
const REPORT_VERSION = 0xF9;
const SAMPLING_INTERVAL = 0x7A;
const SERVO_CONFIG = 0x70;
const SERIAL_MESSAGE = 0x60;
const SERIAL_CONFIG = 0x10;
const SERIAL_WRITE = 0x20;
const SERIAL_READ = 0x30;
const SERIAL_REPLY = 0x40;
const SERIAL_CLOSE = 0x50;
const SERIAL_FLUSH = 0x60;
const SERIAL_LISTEN = 0x70;
const START_SYSEX = 0xF0;
const STEPPER = 0x72;
const ACCELSTEPPER = 0x62;
const STRING_DATA = 0x71;
const SYSTEM_RESET = 0xFF;

// Used by custom sysex tests
const NON_STANDARD_REPLY = 0x11;

const sandbox = sinon.sandbox.create();

describe("Board.requestPort", () => {

  const response = {
    error: null,
    port: {
      comName: null
    },
  };

  beforeEach(() => {
    sandbox.stub(com, "list").callsFake(callback => {
      process.nextTick(() => {
        callback(response.error, [response.port]);
      });
    });
  });

  afterEach(() => {
    sandbox.restore();
    response.error = null;
    response.port.comName = null;
  });

  it("can identify an acceptable port", done => {
    response.port.comName = "/dev/usb.whatever";
    assert.equal(Board.isAcceptablePort(response.port), true);

    response.port.comName = "/dev/ttyACM0";
    assert.equal(Board.isAcceptablePort(response.port), true);

    response.port.comName = "COM0";
    assert.equal(Board.isAcceptablePort(response.port), true);

    done();
  });

  it("can identify an unacceptable port", done => {
    response.port.comName = "/dev/tty.Bluetooth-Incoming-Port";
    assert.equal(Board.isAcceptablePort(response.port), false);

    response.port.comName = "/dev/someotherthing";
    assert.equal(Board.isAcceptablePort(response.port), false);

    done();
  });

  it("invokes callback with an acceptable port: usb", done => {
    response.port.comName = "/dev/usb.whatever";

    Board.requestPort((error, port) => {
      assert.equal(port, response.port);
      done();
    });
  });

  it("invokes callback with an acceptable port: acm", done => {
    response.port.comName = "/dev/ttyACM0";

    Board.requestPort((error, port) => {
      assert.equal(port, response.port);
      done();
    });
  });

  it("invokes callback with an acceptable port: com", done => {
    response.port.comName = "COM0";

    Board.requestPort((error, port) => {
      assert.equal(port, response.port);
      done();
    });
  });

  it("doesn't call callback with an unacceptable port: Bluetooth-Incoming-Port", done => {
    response.port.comName = "/dev/tty.Bluetooth-Incoming-Port";

    Board.requestPort((error, port) => {
      assert.equal(port, null);
      assert.equal(error.message, "No Acceptable Port Found");
      done();
    });
  });

  it("produces an error when there is no Transfer.list method", done => {
    com.list = null;

    Board.requestPort((error, port) => {
      assert.equal(port, null);
      assert.equal(error.message, "No Transport provided");
      done();
    });
  });

  it("produces an error when there is no Transfer", done => {
    Board.test.transport = null;

    Board.requestPort((error, port) => {
      assert.equal(port, null);
      assert.equal(error.message, "No Transport provided");
      Board.test.restoreTransport();
      done();
    });
  });
});


describe("Board: data handling", () => {

  let SerialPort;
  let transportWrite;
  let transport;
  let initCallback;
  let board;

  beforeEach(() => {
    initCallback = sandbox.spy();
    SerialPort = sandbox.spy(com, "SerialPort");
    transportWrite = sandbox.spy(SerialPort.prototype, "write");
    transport = new SerialPort("/path/to/fake/usb");
    board = new Board(transport, initCallback);
  });

  afterEach(() => {
    Board.test.i2cActive.clear();
    sandbox.restore();
  });

  describe("MIDI_RESPONSE", () => {

    it("must discard a bad response that meets 3 byte MIDI_RESPONSE criteria", done => {
      transport.emit("data", [NaN, NaN, NaN]);
      assert.equal(board.buffer.length, 0);
      done();
    });

    describe("REPORT_VERSION", () => {

      it("must ignore unexpected adc data until REPORT_VERSION", done => {

        const parts = [
          fixtures.unexpected.adc.slice(0, 200),
          fixtures.unexpected.adc.slice(200, 400),
          fixtures.unexpected.adc.slice(400, 513),
        ];

        const am = sandbox.spy(Board.MIDI_RESPONSE, ANALOG_MESSAGE);
        const rv = sandbox.spy(Board.MIDI_RESPONSE, REPORT_VERSION);

        assert.equal(am.callCount, 0);
        assert.equal(rv.callCount, 0);
        assert.equal(board.buffer.length, 0);

        for (let i = 0; i < parts[0].length; i++) {
          transport.emit("data", [parts[0][i]]);
        }

        // There are several I2C_REPLY messages in this data,
        // none should trigger the I2C_REPLY handler.
        assert.equal(am.callCount, 0);
        assert.equal(rv.callCount, 0);


        // The REPORT_VERSION byte is at index 38
        const reportVersionAtByteIndex = 38;
        // We won't know it's been seen until all three
        // bytes have been read and processed.
        let reportVersionCalledAtIndex = -1;
        let isVersioned = false;
        // This contains a valid REPORT_VERSION message
        //
        for (let j = 0; j < parts[1].length; j++) {
          transport.emit("data", [parts[1][j]]);

          if (rv.callCount === 1 && !isVersioned) {
            isVersioned = true;
            reportVersionCalledAtIndex = j;
          }
        }

        // There are several I2C_REPLY messages in this data,
        // none should trigger the I2C_REPLY handler.
        assert.equal(am.callCount, 0);

        // The REPORT_VERSION was received near the end (index 38)
        assert.equal(rv.callCount, 1);
        assert.equal(reportVersionCalledAtIndex - 2, reportVersionAtByteIndex);


        for (let k = 0; k < parts[2].length; k++) {
          transport.emit("data", [parts[2][k]]);

          if (rv.callCount === 1 && !isVersioned) {
            isVersioned = true;
            reportVersionCalledAtIndex = k;
          }
        }

        // A single I2C_REPLY exists in the third data set
        assert.equal(am.callCount, 1);
        // No more REPORT_VERSION calls arrived
        assert.equal(rv.callCount, 1);
        // The buffer is empty
        assert.equal(board.buffer.length, 0);

        // Another complete I2C_REPLY arrives...
        transport.emit("data", [0xe0, 0x7f, 0x03]);

        assert.equal(am.callCount, 2);
        assert.equal(board.buffer.length, 0);

        done();
      });

      it("must ignore unexpected i2c data until REPORT_VERSION", done => {

        const parts = [
          fixtures.unexpected.i2c.slice(0, 200),
          fixtures.unexpected.i2c.slice(200, 400),
          fixtures.unexpected.i2c.slice(400, 697),
        ];

        const ir = sandbox.spy(Board.SYSEX_RESPONSE, I2C_REPLY);
        const rv = sandbox.spy(Board.MIDI_RESPONSE, REPORT_VERSION);

        assert.equal(ir.callCount, 0);
        assert.equal(rv.callCount, 0);
        assert.equal(board.buffer.length, 0);

        for (let i = 0; i < parts[0].length; i++) {
          transport.emit("data", [parts[0][i]]);
        }

        // There are several I2C_REPLY messages in this data,
        // none should trigger the I2C_REPLY handler.
        assert.equal(ir.callCount, 0);
        assert.equal(rv.callCount, 0);


        // The REPORT_VERSION byte is at index 194
        const reportVersionAtByteIndex = 194;
        // We won't know it's been seen until all three
        // bytes have been read and processed.
        let reportVersionCalledAtIndex = -1;
        let isVersioned = false;
        // This contains a valid REPORT_VERSION message
        //
        for (let j = 0; j < parts[1].length; j++) {
          transport.emit("data", [parts[1][j]]);

          if (rv.callCount === 1 && !isVersioned) {
            isVersioned = true;
            reportVersionCalledAtIndex = j;
          }
        }

        // There are several I2C_REPLY messages in this data,
        // none should trigger the I2C_REPLY handler.
        assert.equal(ir.callCount, 0);

        // The REPORT_VERSION was received near the end (index 194)
        assert.equal(rv.callCount, 1);
        assert.equal(reportVersionCalledAtIndex - 2, reportVersionAtByteIndex);


        for (let k = 0; k < parts[2].length; k++) {
          transport.emit("data", [parts[2][k]]);

          if (rv.callCount === 1 && !isVersioned) {
            isVersioned = true;
            reportVersionCalledAtIndex = k;
          }
        }

        // A single I2C_REPLY exists in the third data set
        assert.equal(ir.callCount, 1);
        // No more REPORT_VERSION calls arrived
        assert.equal(rv.callCount, 1);
        // The buffer is empty
        assert.equal(board.buffer.length, 0);

        // Another complete I2C_REPLY arrives...
        transport.emit("data", [0xf0, 0x77, 0x0a, 0x00, 0x00, 0x00, 0x06, 0x00, 0x5e, 0x00, 0x05, 0x00, 0x48, 0x01, 0x05, 0x00, 0x1b, 0x01, 0x05, 0x00, 0x3f, 0x01, 0x04, 0x00, 0x16, 0x00, 0x05, 0x00, 0x42, 0x01, 0xf7]);

        assert.equal(ir.callCount, 2);
        assert.equal(board.buffer.length, 0);

        done();
      });

      it("must ignore unexpected serial data until REPORT_VERSION", done => {

        const parts = [
          fixtures.unexpected.serial.slice(0, 200),
          fixtures.unexpected.serial.slice(200, 400),
          fixtures.unexpected.serial.slice(400, 697),
        ];

        const sr = sandbox.spy(Board.SYSEX_RESPONSE, SERIAL_MESSAGE);
        const rv = sandbox.spy(Board.MIDI_RESPONSE, REPORT_VERSION);

        assert.equal(sr.callCount, 0);
        assert.equal(rv.callCount, 0);
        assert.equal(board.buffer.length, 0);

        for (let i = 0; i < parts[0].length; i++) {
          transport.emit("data", [parts[0][i]]);
        }

        // There are several SERIAL_MESSAGE messages in this data,
        // none should trigger the SERIAL_MESSAGE handler.
        assert.equal(sr.callCount, 0);
        assert.equal(rv.callCount, 0);


        // The REPORT_VERSION byte is at index 86
        const reportVersionAtByteIndex = 86;
        // We won't know it's been seen until all three
        // bytes have been read and processed.
        let reportVersionCalledAtIndex = -1;
        let isVersioned = false;
        // This contains a valid REPORT_VERSION message
        //
        for (let j = 0; j < parts[1].length; j++) {
          transport.emit("data", [parts[1][j]]);

          if (rv.callCount === 1 && !isVersioned) {
            isVersioned = true;
            reportVersionCalledAtIndex = j;
          }
        }

        // There are several SERIAL_MESSAGE messages in this data,
        // none should trigger the SERIAL_MESSAGE handler.
        assert.equal(sr.callCount, 0);

        // The REPORT_VERSION was received near the end (index 86)
        assert.equal(rv.callCount, 1);
        assert.equal(reportVersionCalledAtIndex - 2, reportVersionAtByteIndex);


        for (let k = 0; k < parts[2].length; k++) {
          transport.emit("data", [parts[2][k]]);

          if (rv.callCount === 1 && !isVersioned) {
            isVersioned = true;
            reportVersionCalledAtIndex = k;
          }
        }

        // A single SERIAL_MESSAGE exists in the third data set
        assert.equal(sr.callCount, 1);
        // No more REPORT_VERSION calls arrived
        assert.equal(rv.callCount, 1);
        // The buffer is empty
        assert.equal(board.buffer.length, 0);

        // Another complete SERIAL_MESSAGE arrives...
        transport.emit("data", [0xf0, 0x60, 0x48, 0x19, 0x01, 0xf7]);

        assert.equal(sr.callCount, 2);
        assert.equal(board.buffer.length, 0);

        done();
      });
    });
  });

  describe("SYSEX_RESPONSE", () => {
    it("QUERY_FIRMWARE", done => {
      const qf = sandbox.spy(Board.SYSEX_RESPONSE, QUERY_FIRMWARE);

      board.versionReceived = true;

      transport.emit("data", [
        START_SYSEX,
        QUERY_FIRMWARE,
        // Version
        2,
        3,
        // Firmware name
        // "StandardFirmata"
        83, 0,
        116, 0,
        97, 0,
        110, 0,
        100, 0,
        97, 0,
        114, 0,
        100, 0,
        70, 0,
        105, 0,
        114, 0,
        109, 0,
        97, 0,
        116, 0,
        97, 0,
        END_SYSEX
     ]);

      assert.equal(qf.callCount, 1);
      assert.deepEqual(board.firmware, {
        name: "StandardFirmata",
        version: {
          major: 2,
          minor: 3
        }
      });
      done();
    });

    it("CAPABILITY_RESPONSE", done => {
      const cr = sandbox.spy(Board.SYSEX_RESPONSE, CAPABILITY_RESPONSE);

      board.versionReceived = true;

      // Received over multiple data events
      transport.emit("data", [
        START_SYSEX,
        CAPABILITY_RESPONSE,
        0, 1, 1, 1, 4, 14, 127,
        0, 1, 1, 1, 3, 8, 4, 14, 127,
     ]);
      transport.emit("data", [
        0, 1, 1, 1, 3, 8, 4, 14, 127,
        0, 1, 1, 1, 4, 14, 127,
        END_SYSEX
     ]);

      assert.equal(cr.callCount, 1);
      done();
    });

    it("ONEWIRE_DATA", done => {
      board.versionReceived = true;
      const handler = sandbox.spy(Board.SYSEX_RESPONSE, ONEWIRE_SEARCH_REPLY);
      const emit = sandbox.spy();
      const bogusSubCommand = 0xE7;

      // No such sub command exists. This will hit the early return condition
      Board.SYSEX_RESPONSE[ONEWIRE_DATA]({
        buffer: [0, 0, bogusSubCommand],
        emit,
      });

      Board.SYSEX_RESPONSE[ONEWIRE_DATA]({
        buffer: [0, 0, ONEWIRE_SEARCH_REPLY],
        emit,
      });

      assert.equal(handler.callCount, 1);
      assert.equal(emit.callCount, 1);
      done();
    });

    it("PIN_STATE_RESPONSE", done => {
      const cr = sandbox.spy(Board.SYSEX_RESPONSE, PIN_STATE_RESPONSE);

      board.versionReceived = true;

      transport.emit("data", [
        START_SYSEX,
        CAPABILITY_RESPONSE,
        0, 1, 1, 1, 4, 14, 127,
        0, 1, 1, 1, 3, 8, 4, 14, 127,
        0, 1, 1, 1, 3, 8, 4, 14, 127,
        0, 1, 1, 1, 4, 14, 127,
        END_SYSEX
     ]);

      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        0, 1,
        END_SYSEX
     ]);

      // Garbage data...
      transport.emit("data", [
        1, 1, 1, 1,
     ]);

      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        1, 1,
        END_SYSEX
     ]);

      // Garbage data followed by valid data
      transport.emit("data", [
        1, 1, 1, 1,
        START_SYSEX,
        PIN_STATE_RESPONSE,
        2, 1,
        END_SYSEX
     ]);

      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        3, 1,
        END_SYSEX
     ]);

      // minimum state response to set pin 0
      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        // pin, mode, state
        0, 1, 1,
        END_SYSEX
     ]);

      assert.equal(board.pins[0].mode, 1);
      assert.equal(board.pins[0].state, 1);

      // minimum state response to change pin 0
      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        // pin, mode, state
        0, 2, 2,
        END_SYSEX
     ]);

      assert.equal(board.pins[0].mode, 2);
      assert.equal(board.pins[0].state, 2);

      // > 6 bytes of data:
      //
      // the 5 byte will be shifted 7 bits to the right
      // and or'ed with state.
      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        // pin, mode, state, state 2
        0, 2, 2, 1,
        END_SYSEX
     ]);

      assert.equal(board.pins[0].mode, 2);
      assert.equal(board.pins[0].state, 130); // 2 | (1 << 7)

      // > 7 bytes of data:
      //
      // the 6 byte will be shifted 14 bits to the right
      // and or'ed with state.
      transport.emit("data", [
        START_SYSEX,
        PIN_STATE_RESPONSE,
        // pin, mode, state, state 2
        0, 2, 2, 1, 1,
        END_SYSEX
     ]);

      assert.equal(board.pins[0].mode, 2);
      assert.equal(board.pins[0].state, 16514); // 130 | (1 << 14)

      assert.equal(cr.callCount, 8);
      done();
    });

    it("ANALOG_MAPPING_RESPONSE", done => {
      const amr = sandbox.spy(Board.SYSEX_RESPONSE, ANALOG_MAPPING_RESPONSE);

      board.versionReceived = true;

      transport.emit("data", [
        START_SYSEX,
        CAPABILITY_RESPONSE,
        0, 1, 1, 1, 4, 14, 127,
        0, 1, 1, 1, 3, 8, 4, 14, 127,
        0, 1, 1, 1, 3, 8, 4, 14, 127,
        0, 1, 1, 1, 4, 14, 127,
        END_SYSEX
     ]);

      transport.emit("data", [
        START_SYSEX,
        ANALOG_MAPPING_RESPONSE,
        127, 127, 0, 1,
        END_SYSEX
     ]);

      // Garbage data...
      transport.emit("data", [
        1, 1, 1, 1,
     ]);

      transport.emit("data", [
        START_SYSEX,
        ANALOG_MAPPING_RESPONSE,
        0, 1,
     ]);

      transport.emit("data", [
        2, 3,
        END_SYSEX
     ]);

      // Garbage data followed by valid data
      transport.emit("data", [
        1, 1, 1, 1,
        START_SYSEX,
        ANALOG_MAPPING_RESPONSE,
        2, 1,
        END_SYSEX
     ]);

      assert.equal(amr.callCount, 3);
      done();
    });
  });
});

describe("Board: initialization", () => {
  it("Always returns a Board instance", done => {
    assert.equal(new Board("/path/to/fake1") instanceof Board, true);
    done();
  });

  it("Is a subclass of EventEmitter", done => {
    assert.equal(new Board("/path/to/fake1") instanceof Emitter, true);
    done();
  });

  it("Default RESOLUTION.* values are null", done => {
    const board = new Board("/path/to/fake1");

    assert.equal(typeof board.RESOLUTION, "object");
    assert.notEqual(board.RESOLUTION, null);
    assert.equal(board.RESOLUTION.ADC, null);
    assert.equal(board.RESOLUTION.PWM, null);
    assert.equal(board.RESOLUTION.DAC, null);
    done();
  });
});

describe("Board: lifecycle", function() {

  let SerialPort = sandbox.spy(com, "SerialPort");
  let transportWrite = sandbox.spy(SerialPort.prototype, "write");
  let initCallback = sandbox.spy(error => {
    assert.equal(typeof error, "undefined");
  });
  let initNoop = sandbox.spy();

  let transport = new SerialPort("/path/to/fake/usb");
  let board = new Board(transport, initCallback);

  const context = this;

  beforeEach(() => {
    Board.test.i2cActive.clear();

    transport.spy = sandbox.spy(com, "SerialPort");

    board._events.length = 0;
  });

  afterEach(() => {
    Board.SYSEX_RESPONSE[NON_STANDARD_REPLY] = undefined;
    sandbox.restore();
  });

  describe("Writing To Transport", () => {

    beforeEach(() => {
      board.pending = 0;
    });

    afterEach(() => {
      board.pending = 0;
    });

    it("increments pending on writeToTransport", done => {
      sandbox.spy(board.transport, "write");

      assert.equal(board.pending, 0);
      Board.test.writeToTransport(board, [1, 2, 3, 4]);
      assert.equal(board.pending, 1);

      const args = board.transport.write.lastCall.args;

      assert.ok(args[0].equals(Buffer.from([1, 2, 3, 4])));

      args[1]();
      assert.equal(board.pending, 0);
      done();
    });
  });


  it("has a name", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);

    assert.equal(board.name, "Firmata");
    done();
  });

  // Legacy
  it("emits 'connect' event when transport emits 'open'.", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);

    board.on("connect", () => done());

    transport.emit("open");
  });

  it("forwards 'open' events from transport.", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);

    board.on("open", () => done());

    transport.emit("open");
  });

  it("emits 'ready' after handshakes complete (skipCapabilities)", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, {skipCapabilities: true}, initNoop);
    let oc = 0;

    board.on("open", () => {
      assert.ok(true);
      oc++;
    });

    board.on("connect", () => {
      assert.ok(true);
      oc++;
    });

    board.on("ready", function() {
      assert.equal(oc, 2);
      assert.equal(this.isReady, true);
      done();
    });

    transport.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");
  });

  it("emits 'ready' after handshakes complete", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);
    let oc = 0;

    board.on("open", () => {
      assert.ok(true);
      oc++;
    });

    board.on("connect", () => {
      assert.ok(true);
      oc++;
    });

    board.on("ready", function() {
      assert.equal(oc, 2);
      assert.equal(this.isReady, true);
      done();
    });

    transport.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");
    board.emit("capability-query");
    board.emit("analog-mapping-query");
  });

  it("reports errors during connect/ready", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, err => {
      assert.equal("test error", err);
      done();
    });

    transport.emit("error", "test error");
  });

  it("forwards 'close' events from transport", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);

    board.on("close", done);

    transport.emit("close");
  });

  it("forwards 'disconnect' events from transport", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);

    board.on("disconnect", done);

    // https://github.com/node-serialport/node-serialport/blob/5.0.0/UPGRADE_GUIDE.md#opening-and-closing
    transport.emit("close", {
      disconnect: true,
      disconnected: true,
    });
  });

  it("forwards 'error' event from transport", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, initNoop);

    board.on("error", done);

    board.isReady = true;
    transport.emit("error");
  });

  it("When reportVersion and queryFirmware timeout, call noop", done => {
    context.timeout(50);
    sandbox.stub(Board.prototype, "reportVersion");
    sandbox.stub(Board.prototype, "queryFirmware");
    const clock = sandbox.useFakeTimers();
    const transport = new SerialPort("/path/to/fake/usb");
    const opt = {
      reportVersionTimeout: 1
    };
    const board = new Board(transport, opt, initNoop);
    board.versionReceived = false;

    clock.tick(2);

    assert.equal(board.reportVersion.callCount, 1);
    assert.equal(board.queryFirmware.callCount, 1);

    assert.equal(board.reportVersion.getCall(0).args[0](), undefined);
    assert.equal(board.queryFirmware.getCall(0).args[0](), undefined);

    done();
  });

  it("sends 'REPORT_VERSION' and 'QUERY_FIRMWARE' if it hasnt received the version within the timeout", done => {
    context.timeout(50000);
    const transport = new SerialPort("/path/to/fake/usb");
    const opt = {
      reportVersionTimeout: 1
    };
    const board = new Board(transport, opt, initNoop);

    // rcheck for report version
    transport.once("write", data => {
      assert.deepEqual(data, [REPORT_VERSION]);
      // check for query firmware
      transport.once("write", data => {
        assert.deepEqual(data, [240, 121, 247]);
        done();
      });
    });
  });

  it("receives the version on startup", done => {
    //"send" report version command back from arduino
    transport.emit("data", [REPORT_VERSION]);
    transport.emit("data", [0x02]);

    //subscribe to the "data" event to capture the event
    transport.once("data", buffer => {
      assert.equal(board.version.major, 2);
      assert.equal(board.version.minor, 3);
      done();
    });

    //send the last byte of command to get "data" event to fire when the report version function is called
    transport.emit("data", [0x03]);
  });

  it("receives the firmware after the version", done => {
    board.once("queryfirmware", () => {
      assert.equal(board.firmware.version.major, 2);
      assert.equal(board.firmware.version.minor, 3);
      assert.equal(board.firmware.name, "StandardFirmata");
      done();
    });
    transport.emit("data", [240]);
    transport.emit("data", [121]);
    transport.emit("data", [2]);
    transport.emit("data", [3]);
    transport.emit("data", [83]);
    transport.emit("data", [0]);
    transport.emit("data", [116]);
    transport.emit("data", [0]);
    transport.emit("data", [97]);
    transport.emit("data", [0]);
    transport.emit("data", [110]);
    transport.emit("data", [0]);
    transport.emit("data", [100]);
    transport.emit("data", [0]);
    transport.emit("data", [97]);
    transport.emit("data", [0]);
    transport.emit("data", [114]);
    transport.emit("data", [0]);
    transport.emit("data", [100]);
    transport.emit("data", [0]);
    transport.emit("data", [70]);
    transport.emit("data", [0]);
    transport.emit("data", [105]);
    transport.emit("data", [0]);
    transport.emit("data", [114]);
    transport.emit("data", [0]);
    transport.emit("data", [109]);
    transport.emit("data", [0]);
    transport.emit("data", [97]);
    transport.emit("data", [0]);
    transport.emit("data", [116]);
    transport.emit("data", [0]);
    transport.emit("data", [97]);
    transport.emit("data", [0]);
    transport.emit("data", [247]);
  });

  it("Optionally call setSamplingInterval after queryfirmware", done => {
    sandbox.spy(Board.prototype, "setSamplingInterval");
    sandbox.spy(SerialPort.prototype, "write");

    const transport = new SerialPort("/path/to/fake/usb");
    const options = {
      skipCapabilities: true,
      samplingInterval: 100
    };
    const board = new Board(transport, options, error => {
      assert.deepEqual(Array.from(transport.write.lastCall.args[0]), [
        0xf0, 0x7a, 0x64, 0x00, 0xf7
     ]);
      assert.equal(board.setSamplingInterval.callCount, 1);
      assert.ok(board.setSamplingInterval.calledWith(100));
      done();
    });

    // Trigger fake "reportversion"
    transport.emit("data", [REPORT_VERSION, 0x02, 0x03]);

    // Trigger fake "queryfirmware"
    transport.emit("data", [
      240, 121, 2, 3, 83, 0, 116, 0, 97, 0, 110, 0, 100, 0,
      97, 0, 114, 0, 100, 0, 70, 0, 105, 0, 114, 0, 109, 0,
      97, 0, 116, 0, 97, 0, 247
   ]);
  });

  it("Does not call setSamplingInterval after queryfirmware by default", done => {
    sandbox.spy(Board.prototype, "setSamplingInterval");
    sandbox.spy(SerialPort.prototype, "write");

    const transport = new SerialPort("/path/to/fake/usb");
    const options = {
      skipCapabilities: true,
    };

    const board = new Board(transport, options, () => {
      assert.equal(board.setSamplingInterval.callCount, 0);
      assert.equal(transport.write.callCount, 0);
      done();
    });

    // Trigger fake "reportversion"
    transport.emit("data", [REPORT_VERSION, 0x02, 0x03]);

    // Trigger fake "queryfirmware"
    transport.emit("data", [
      240, 121, 2, 3, 83, 0, 116, 0, 97, 0, 110, 0, 100, 0,
      97, 0, 114, 0, 100, 0, 70, 0, 105, 0, 114, 0, 109, 0,
      97, 0, 116, 0, 97, 0, 247
   ]);
  });

  it("Returns the present samplingInterval", done => {
    board.settings.samplingInterval = Infinity;

    assert.equal(board.getSamplingInterval(), Infinity);
    done();
  });

  it("gets the capabilities after the firmware", done => {
    //[START_SYSEX, CAPABILITY_QUERY, END_SYSEX]
    assert.deepEqual(transport.lastWrite, [START_SYSEX, CAPABILITY_QUERY, END_SYSEX]);

    //report back mock capabilities
    //taken from boards.h for arduino uno
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [CAPABILITY_RESPONSE]);

    for (let i = 0; i < 20; i++) {
      // if "pin" is digital it can be input and output
      if (i >= 2 && i <= 19) {
        //input is on
        transport.emit("data", [0]);
        transport.emit("data", [1]);
        //output is on
        transport.emit("data", [1]);
        transport.emit("data", [1]);
      }
      //if pin is analog
      if (i >= 14 && i <= 19) {
        transport.emit("data", [0x02]);
        transport.emit("data", [10]);
      }
      //if pin is PWM
      if ([3, 5, 6, 10, 11].includes(i)) {
        transport.emit("data", [0x03]);
        transport.emit("data", [8]);
      }
      //all pins are servo
      if (i >= 2) {
        transport.emit("data", [0x04]);
        transport.emit("data", [14]);
      }
      //signal end of command for pin
      transport.emit("data", [127]);
    }

    //capture the event once to make all pin modes are set correctly
    transport.once("data", () => {
      assert.equal(board.pins.length, 20);
      board.pins.forEach((pin, index) => {
        if (index >= 2 && index <= 19) {

          assert.notEqual(pin.supportedModes.indexOf(0), -1);
          assert.notEqual(pin.supportedModes.indexOf(1), -1);
        } else {
          assert.equal(pin.supportedModes.length, 0);
        }
        if (index >= 14 && index <= 19) {
          assert.notEqual(pin.supportedModes.indexOf(0x02), -1);
        } else {
          assert.equal(pin.supportedModes.indexOf(0x02), -1);
        }
        if ([3, 5, 6, 10, 11].includes(index)) {
          assert.notEqual(pin.supportedModes.indexOf(0x03), -1);
        } else {
          assert.equal(pin.supportedModes.indexOf(0x03), -1);
        }
        if (index >= 2) {
          assert.notEqual(pin.supportedModes.indexOf(0x04), -1);
        }
      });
      done();
    });
    //end the sysex message
    transport.emit("data", [END_SYSEX]);
  });

  it("capabilities response is an idempotent operation", done => {

    let count = 0;
    let i = 0;

    transport.on("data", function data() {
      count++;

      // Should be 20 after both responses.
      assert.equal(board.pins.length, 20);

      if (count === 2) {
        transport.removeListener("data", data);
        done();
      }
    });

    // Fake two capabilities responses...
    // 1
    transport.emit("data", [START_SYSEX, CAPABILITY_RESPONSE]);
    for (i = 0; i < 20; i++) {
      transport.emit("data", [0, 1, 1, 1, 127]);
    }
    transport.emit("data", [END_SYSEX]);
    // 2
    transport.emit("data", [START_SYSEX, CAPABILITY_RESPONSE]);
    for (i = 0; i < 20; i++) {
      transport.emit("data", [0, 1, 1, 1, 127]);
    }
    transport.emit("data", [END_SYSEX]);
  });

  it("board.RESOLUTION.* properties recieve values via CAPABILITY_RESPONSE", done => {
    assert.equal(board.RESOLUTION.ADC, 0x3FF);
    assert.equal(board.RESOLUTION.PWM, 0x0FF);
    done();
  });


  it("querys analog mappings after capabilities", done => {
    //[START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]
    assert.deepEqual(transport.lastWrite, [START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ANALOG_MAPPING_RESPONSE]);
    for (let i = 0; i < 20; i++) {
      if (i >= 14 && i < 20) {
        transport.emit("data", [i - 14]);
      } else {
        transport.emit("data", [127]);
      }
    }

    transport.once("data", () => {
      assert.equal(board.pins[14].analogChannel, 0);
      assert.equal(board.pins[15].analogChannel, 1);
      assert.equal(board.pins[16].analogChannel, 2);
      assert.equal(board.pins[17].analogChannel, 3);
      assert.equal(board.pins[18].analogChannel, 4);
      assert.equal(board.pins[19].analogChannel, 5);
      assert.equal(board.analogPins.length, 6);
      assert.equal(board.analogPins[0], 14);
      assert.equal(board.analogPins[1], 15);
      assert.equal(board.analogPins[2], 16);
      assert.equal(board.analogPins[3], 17);
      assert.equal(board.analogPins[4], 18);
      assert.equal(board.analogPins[5], 19);
      done();
    });
    transport.emit("data", [END_SYSEX]);
  });

  it("must be ready", done => {
    assert.equal(board.isReady, true);
    assert.equal(initCallback.callCount, 1);
    done();
  });

  it("allows setting a valid sampling interval", done => {
    const spy = sandbox.spy(board.transport, "write");

    // Valid sampling interval
    board.setSamplingInterval(20);
    assert.ok(Buffer.from([0xf0, 0x7a, 0x14, 0x00, 0xf7]).equals(spy.lastCall.args[0]));

    // Invalid sampling interval is constrained to a valid interval
    // > 65535 => 65535
    board.setSamplingInterval(65540);
    assert.ok(Buffer.from([0xf0, 0x7a, 0x7f, 0x7f, 0xf7]).equals(spy.lastCall.args[0]));

    // Invalid sampling interval is constrained to a valid interval
    // < 10 => 10
    board.setSamplingInterval(0);
    assert.ok(Buffer.from([0xf0, 0x7a, 0x0a, 0x00, 0xf7]).equals(spy.lastCall.args[0]));

    spy.restore();
    done();
  });

  it("must be able to reset (SYSTEM_RESET)", done => {
    board.reset();
    assert.equal(transport.lastWrite[0], SYSTEM_RESET);
    done();
  });

  it("must be able to set pin mode on digital pin (INPUT)", done => {
    board.pinMode(2, board.MODES.INPUT);
    assert.equal(transport.lastWrite[0], PIN_MODE);
    assert.equal(transport.lastWrite[1], 2);
    assert.equal(transport.lastWrite[2], board.MODES.INPUT);
    assert.equal(board.pins[2].mode, board.MODES.INPUT);
    done();
  });

  it("must be able to read value of digital pin (INPUT)", done => {
    let counter = 0;
    const order = [1, 0, 1, 0];
    board.digitalRead(2, value => {
      if (value === 1) {
        counter++;
      }
      if (value === 0) {
        counter++;
      }
      if (order[0] === value) {
        order.shift();
      }
      if (counter === 4) {
        assert.equal(order.length, 0);
        done();
      }
    });

    // Digital reporting turned on...
    assert.deepEqual(transport.lastWrite, [208, 1]);

    // Single Byte
    transport.emit("data", [DIGITAL_MESSAGE]);
    transport.emit("data", [4 % 128]);
    transport.emit("data", [4 >> 7]);

    transport.emit("data", [DIGITAL_MESSAGE]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x00]);

    // Multi Byte
    transport.emit("data", [DIGITAL_MESSAGE, 4 % 128, 4 >> 7]);
    transport.emit("data", [DIGITAL_MESSAGE, 0x00, 0x00]);
  });

  it("must be able to set pin mode on digital pin (PULLUP)", done => {
    board.pinMode(3, board.MODES.PULLUP);
    assert.equal(transport.lastWrite[0], PIN_MODE);
    assert.equal(transport.lastWrite[1], 3);
    assert.equal(transport.lastWrite[2], board.MODES.PULLUP);
    assert.equal(board.pins[3].mode, board.MODES.PULLUP);
    done();
  });

  it("must be able to read value of digital pin (PULLUP)", done => {
    let counter = 0;
    const order = [1, 0, 1, 0];
    board.pinMode(2, board.MODES.PULLUP);
    board.digitalRead(2, value => {
      if (value === 1) {
        counter++;
      }
      if (value === 0) {
        counter++;
      }
      if (order[0] === value) {
        order.shift();
      }
      if (counter === 4) {
        assert.equal(order.length, 0);
        done();
      }
    });

    // Digital reporting turned on...
    assert.deepEqual(transport.lastWrite, [208, 1]);

    // Single Byte
    transport.emit("data", [DIGITAL_MESSAGE]);
    transport.emit("data", [4 % 128]);
    transport.emit("data", [4 >> 7]);

    transport.emit("data", [DIGITAL_MESSAGE]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x00]);

    // Multi Byte
    transport.emit("data", [DIGITAL_MESSAGE, 4 % 128, 4 >> 7]);
    transport.emit("data", [DIGITAL_MESSAGE, 0x00, 0x00]);
  });

  it("must be able to set mode on analog pins", done => {
    board.pinMode(board.analogPins[0], board.MODES.INPUT);
    assert.equal(transport.lastWrite[0], PIN_MODE);
    assert.equal(transport.lastWrite[1], board.analogPins[0]);
    assert.equal(transport.lastWrite[2], board.MODES.INPUT);
    done();
  });

  it("must be able to read value of analog pin", done => {
    let counter = 0;
    const order = [1023, 0, 1023, 0];
    board.analogRead(1, value => {
      if (value === 1023) {
        counter++;
      }
      if (value === 0) {
        counter++;
      }
      if (order[0] === value) {
        order.shift();
      }
      if (counter === 4) {
        assert.equal(order.length, 0);
        done();
      }
    });

    // Analog reporting turned on...
    assert.deepEqual(transport.lastWrite, [193, 1]);

    // Single Byte
    transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
    transport.emit("data", [1023 % 128]);
    transport.emit("data", [1023 >> 7]);

    transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
    transport.emit("data", [0 % 128]);
    transport.emit("data", [0 >> 7]);

    // Multi Byte
    transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 1023 % 128, 1023 >> 7]);
    transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 0 % 128, 0 >> 7]);
  });


  it("must be able to read value of analog pin on a board that skipped capabilities check", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, {skipCapabilities: true, analogPins: [14,15,16,17,18,19]}, initNoop);

    board.on("ready", () => {
      let counter = 0;
      let order = [1023, 0, 1023, 0];
      board.analogRead(1, value => {
        if (value === 1023) {
          counter++;
        }
        if (value === 0) {
          counter++;
        }
        if (order[0] === value) {
          order.shift();
        }
        if (counter === 4) {
          assert.equal(order.length, 0);
          done();
        }
      });

      // Analog reporting turned on...
      assert.deepEqual(transport.lastWrite, [193, 1]);

      // Single Byte
      transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
      transport.emit("data", [1023 % 128]);
      transport.emit("data", [1023 >> 7]);

      transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF)]);
      transport.emit("data", [0 % 128]);
      transport.emit("data", [0 >> 7]);

      // Multi Byte
      transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 1023 % 128, 1023 >> 7]);
      transport.emit("data", [ANALOG_MESSAGE | (1 & 0xF), 0 % 128, 0 >> 7]);
    });

    transport.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");
  });

  it("must be able to write a value to a digital output", done => {

    const write = sandbox.stub(SerialPort.prototype, "write");
    const expect = [
      [ 144, 1, 0 ],
      [ 144, 2, 0 ],
      [ 144, 4, 0 ],
      [ 144, 8, 0 ],
      [ 144, 16, 0 ],
      [ 144, 32, 0 ],
      [ 144, 64, 0 ],
      [ 144, 0, 1 ],
      [ 145, 1, 0 ],
      [ 145, 2, 0 ],
      [ 145, 4, 0 ],
      [ 145, 8, 0 ],
      [ 145, 16, 0 ],
      [ 145, 32, 0 ],
      [ 145, 64, 0 ],
      [ 145, 0, 1 ],
      [ 146, 1, 0 ],
      [ 146, 2, 0 ],
      [ 146, 4, 0 ],
      [ 146, 8, 0 ],
    ];

    for (let i = 0; i < board.pins.length; i++) {
      board.digitalWrite(i, board.HIGH);
      assert.deepEqual(Array.from(write.lastCall.args[0]), expect[i]);

      board.digitalWrite(i, board.LOW);
    }
    done();
  });

  it("must be able to enqueue a series of digital writes and then update the ports on demand", done => {

    const write = sandbox.stub(SerialPort.prototype, "write");
    const expect = [
      [ 144, 20, 0 ],
      [ 145, 5, 0 ]
    ];

    board.digitalWrite(2, board.HIGH, true);
    board.digitalWrite(3, board.LOW, true);
    board.digitalWrite(4, board.HIGH, true);
    board.digitalWrite(5, board.LOW, true);

    // Should not call write yet
    assert.equal(write.callCount, 0);

    board.digitalWrite(8, board.HIGH, true);
    board.digitalWrite(9, board.LOW, true);
    board.digitalWrite(10, board.HIGH, true);
    board.digitalWrite(11, board.LOW, true);

    // Should not call write yet
    assert.equal(write.callCount, 0);

    // Write the ports
    board.flushDigitalPorts();

    // We are updating both ports 0 and 1
    assert.equal(write.callCount, 2);

    assert.deepEqual(Array.from(write.getCall(0).args[0]), expect[0]);
    assert.deepEqual(Array.from(write.getCall(1).args[0]), expect[1]);

    // Reset pins to low
    [2, 4, 8, 10].forEach(pin => {
      board.digitalWrite(pin, board.LOW);
    });

    done();
  });

  it("must be able to track digital writes via ports property", done => {
    for (let i = 0; i < board.pins.length; i++) {
      board.pins[i].mode = board.MODES.UNKNOWN;
    }

    const write = sandbox.stub(SerialPort.prototype, "write");
    const expecting = [
      1,
      2,
      4,
      8,
      16,
      32,
      64,
      128,
      1,
      2,
      4,
      8,
      16,
      32,
      64,
      128,
      1,
      2,
      4,
      8,
    ];

    for (let j = 0; j < board.pins.length; j++) {
      const port = j >> 3;
      const expect = expecting[j];

      board.digitalWrite(j, board.HIGH);

      assert.equal(board.ports[port], expect);

      board.digitalWrite(j, board.LOW);
    }
    done();
  });

  it("must be able to write and read to a digital port without garbling state", done => {
    /* This test will change the value of port 1 as follows:

      0b00000001
      0b00000000
      0b00000001
      0b00000101
      0b00000000
      0b00000101
      0b00000001
    */

    const write = sandbox.stub(SerialPort.prototype, "write");
    const state = 0;
    let calls = 0;
    const expecting = [
      // 10 is high, 9 is low, 8 is high
      "101",
      // 10 is low, 9 is low, 8 is low
      "0",
      // 10 is high, 9 is low, 8 is (still) low
      "100",
      // 10 is low, 9 is low, 8 is high
      "1"
    ];

    for (let i = 0; i < board.pins.length; i++) {
      board.pins[i].mode = board.MODES.UNKNOWN;
    }

    for (let j = 0; j < board.ports.length; j++) {
      board.ports[j] = 0;
    }

    // No Pins are high on this port
    assert.equal(board.ports[1].toString(2), "0");


    board.pinMode(8, board.MODES.OUTPUT);
    board.pinMode(10, board.MODES.INPUT);
    board.digitalRead(10, data => {
      assert.equal(board.ports[1].toString(2), expecting[calls++]);

      if (calls === 4) {
        done();
      }
    });
    /*
      Pin   Byte high   Value
      8     0b00000001  1
      9     0b00000010  2
      10    0b00000100  4
      11    0b00001000  8
      12    0b00010000  16
      13    0b00100000  32
      14    0b01000000  64
      15    0b10000000  128
     */

    // Pin 8 is bit 0 of port byte 1, it should now be ON
    board.digitalWrite(8, 1);
    assert.equal(board.ports[1].toString(2), "1");


    // Pin 8 is bit 0 of port byte 1, it should now be OFF
    board.digitalWrite(8, 0);
    assert.equal(board.ports[1].toString(2), "0");


    // Pin 8 is bit 0 of port byte 1, it should now be ON
    board.digitalWrite(8, 1);
    assert.equal(board.ports[1].toString(2), "1");


    transport.emit("data", [DIGITAL_MESSAGE | 1, 4, 0]);
    board.digitalWrite(8, 0);
    // Pin 10 is bit 2 (value = 4) of port byte 1, it should now be ON
    // Pin 8  is bit 0 (value = 1) of port byte 1, it should now be OFF
    assert.equal(board.ports[1].toString(2), "100");


    transport.emit("data", [DIGITAL_MESSAGE | 1, 0, 0]);
    // Pin 10 is bit 2 (value = 4) of port byte 1, it should now be OFF
    // Pin 8  is bit 0 (value = 1) of port byte 1, it should now be OFF
    assert.equal(board.ports[1].toString(2), "0");


    // Pin 10 is bit 2 (value = 4) of port byte 1, it should now be ON
    // Pin 8  is bit 0 (value = 1) of port byte 1, it should now be ON
    transport.emit("data", [DIGITAL_MESSAGE | 1, 4, 0]);
    board.digitalWrite(8, 1);
    assert.equal(board.ports[1].toString(2), "101");


    // Pin 10 is bit 2 (value = 4) of port byte 1, it should now be OFF
    // Pin 8  is bit 0 (value = 1) of port byte 1, it should now be ON
    transport.emit("data", [DIGITAL_MESSAGE | 1, 0, 0]);
    board.digitalWrite(8, 1);
    assert.equal(board.ports[1].toString(2), "1");
  });

  it("must be able to write a value to a digital output to a board that skipped capabilities check", done => {
    const transport = new SerialPort("/path/to/fake/usb");
    const board = new Board(transport, {skipCapabilities: true}, initNoop);

    board.on("ready", () => {
      board.digitalWrite(3, board.HIGH);
      assert.deepEqual(transport.lastWrite, [DIGITAL_MESSAGE, 8, 0]);

      board.digitalWrite(3, board.LOW);
      assert.deepEqual(transport.lastWrite, [DIGITAL_MESSAGE, 0, 0]);
      done();
    });

    transport.emit("open");
    board.emit("reportversion");
    board.emit("queryfirmware");

  });

  it("must be able to write a value to an analog pin being used as a digital output", done => {
    board.ports[2] = 0;

    // `DIGITAL_MESSAGE | 2` => Digital Message on Port 2
    //
    board.digitalWrite(19, board.HIGH);
    assert.deepEqual(transport.lastWrite, [DIGITAL_MESSAGE | 2, 8, 0]);

    board.digitalWrite(19, board.LOW);
    assert.deepEqual(transport.lastWrite, [DIGITAL_MESSAGE | 2, 0, 0]);

    done();
  });

  it("analogWrite is an alias of pwmWrite (for backward compatibility)", done => {
    assert.ok(board.pwmWrite === board.analogWrite);
    done();
  });

  it("must be able to write a PWM value to a capable output", done => {
    board.pwmWrite(board.analogPins[1], 1023);
    assert.deepEqual(transport.lastWrite, [ANALOG_MESSAGE | board.analogPins[1], 127, 7]);

    board.pwmWrite(board.analogPins[1], 0);
    assert.deepEqual(transport.lastWrite, [ANALOG_MESSAGE | board.analogPins[1], 0, 0]);
    done();
  });

  it("must be able to write a value to an extended analog output", done => {
    const length = board.pins.length;

    board.pins[46] = {
      supportedModes: [0, 1, 4],
      mode: 4,
      value: 0,
      report: 1,
      analogChannel: 127
    };

    board.pwmWrite(46, 180);
    assert.deepEqual(transport.lastWrite, [
      START_SYSEX,
      EXTENDED_ANALOG,
      46, 52, 1,
      END_SYSEX,
   ]);

    board.pwmWrite(46, 0);
    assert.deepEqual(transport.lastWrite, [
      START_SYSEX,
      EXTENDED_ANALOG,
      46, 0, 0,
      END_SYSEX,
   ]);

    board.pwmWrite(46, 0x00004001);
    assert.deepEqual(transport.lastWrite, [
      START_SYSEX,
      EXTENDED_ANALOG,
      46, 1, 0, 1,
      END_SYSEX,
   ]);

    board.pwmWrite(46, 0x00200001);
    assert.deepEqual(transport.lastWrite, [
      START_SYSEX,
      EXTENDED_ANALOG,
      46, 1, 0, 0, 1,
      END_SYSEX,
   ]);

    board.pwmWrite(46, 0x10000001);
    assert.deepEqual(transport.lastWrite, [
      START_SYSEX,
      EXTENDED_ANALOG,
      46, 1, 0, 0, 0, 1,
      END_SYSEX,
   ]);

    // Restore to original length
    board.pins.length = length;

    done();
  });


  it("must be able to send a string", done => {
    const bytes = Buffer.from("test string", "utf8");
    const length = bytes.length;
    board.sendString(bytes);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], STRING_DATA);
    for (let i = 0; i < length; i++) {
      assert.equal(transport.lastWrite[i * 2 + 2], bytes[i] & 0x7F);
      assert.equal(transport.lastWrite[i * 2 + 3], (bytes[i + 1] >> 7) & 0x7F);
    }
    assert.equal(transport.lastWrite[length * 2 + 2], 0);
    assert.equal(transport.lastWrite[length * 2 + 3], 0);
    assert.equal(transport.lastWrite[length * 2 + 4], END_SYSEX);
    done();
  });
  it("must emit a string event", done => {
    board.on("string", string => {
      assert.equal(string, "test string");
      done();
    });
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [STRING_DATA]);
    const bytes = Buffer.from("test string", "utf8");
    Array.prototype.forEach.call(bytes, (value, index) => {
      transport.emit("data", [value]);
    });
    transport.emit("data", [END_SYSEX]);
  });

  it("can query pin state", done => {
    board.queryPinState(2, () => {
      assert.equal(board.pins[2].state, 1024);
      done();
    });
    assert.deepEqual(transport.lastWrite, [START_SYSEX, PIN_STATE_QUERY, 2, END_SYSEX]);
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [PIN_STATE_RESPONSE]);
    transport.emit("data", [2]);
    transport.emit("data", [board.MODES.INPUT]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x08]);
    transport.emit("data", [END_SYSEX]);
  });

  it("must ignore invalid query firmware data", done => {
    board.once("queryfirmware", () => {
      assert.equal(board.firmware.version.major, 2);
      assert.equal(board.firmware.version.minor, 5);
      assert.equal(board.firmware.name.substring(0, 3), "Sta");
      done();
    });

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [QUERY_FIRMWARE]);
    transport.emit("data", [0x02]);
    transport.emit("data", [0x05]);
    transport.emit("data", [0x53]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x74]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x61]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x6e]); //<<<
    transport.emit("data", [0x61]); //<<<
    transport.emit("data", [0x00]);
    transport.emit("data", [0x2e]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x69]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x6e]);
    transport.emit("data", [0x00]);
    transport.emit("data", [0x6f]);
    transport.emit("data", [0x1]);
    transport.emit("data", [0x00]);
    transport.emit("data", [END_SYSEX]);
  });

  it("cannot pingRead without PingFirmata", done => {
    assert.throws(() => {
      board.pingRead({
        pin: 3
      });
    });

    done();
  });

  it("can send a pingRead without a timeout and without a pulse out", done => {
    board.pins[3].supportedModes.push(PING_READ);
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      timeout: 1000000
    }, duration => {
      assert.equal(duration, 0);
      done();
    });
    assert.deepEqual(transport.lastWrite, [START_SYSEX, PING_READ, 3, board.HIGH, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 66, 0, 64, 0, END_SYSEX]);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [PING_READ]);
    transport.emit("data", [3]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);
  });

  it("can send a pingRead with a timeout and a pulse out", done => {
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      pulseOut: 5,
      timeout: 1000000
    }, duration => {
      assert.equal(duration, 1000000);
      done();
    });
    assert.deepEqual(transport.lastWrite, [START_SYSEX, PING_READ, 3, board.HIGH, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 15, 0, 66, 0, 64, 0, END_SYSEX]);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [PING_READ]);
    transport.emit("data", [3]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [15]);
    transport.emit("data", [0]);
    transport.emit("data", [66]);
    transport.emit("data", [0]);
    transport.emit("data", [64]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);
  });
  it("can send a pingRead with a pulse out and without a timeout ", done => {
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      pulseOut: 5
    }, duration => {
      assert.equal(duration, 1000000);
      done();
    });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PING_READ);
    assert.equal(transport.lastWrite[2], 3);
    assert.equal(transport.lastWrite[3], board.HIGH);
    assert.equal(transport.lastWrite[4], 0);
    assert.equal(transport.lastWrite[5], 0);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], 0);
    assert.equal(transport.lastWrite[10], 5);
    assert.equal(transport.lastWrite[11], 0);
    assert.equal(transport.lastWrite[12], 0);
    assert.equal(transport.lastWrite[13], 0);
    assert.equal(transport.lastWrite[14], 15);
    assert.equal(transport.lastWrite[15], 0);
    assert.equal(transport.lastWrite[16], 66);
    assert.equal(transport.lastWrite[17], 0);
    assert.equal(transport.lastWrite[18], 64);
    assert.equal(transport.lastWrite[19], 0);
    assert.equal(transport.lastWrite[20], END_SYSEX);
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [PING_READ]);
    transport.emit("data", [3]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [15]);
    transport.emit("data", [0]);
    transport.emit("data", [66]);
    transport.emit("data", [0]);
    transport.emit("data", [64]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);
  });

  it("can send a stepper config for a driver configuration", done => {
    board.stepperConfig(0, board.STEPPER.TYPE.DRIVER, 200, 2, 3);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], STEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], board.STEPPER.TYPE.DRIVER);
    assert.equal(transport.lastWrite[5], 200 & 0x7F);
    assert.equal(transport.lastWrite[6], (200 >> 7) & 0x7F);
    assert.equal(transport.lastWrite[7], 2);
    assert.equal(transport.lastWrite[8], 3);
    assert.equal(transport.lastWrite[9], END_SYSEX);
    done();
  });

  it("can send a stepper config for a two wire configuration", done => {
    board.stepperConfig(0, board.STEPPER.TYPE.TWO_WIRE, 200, 2, 3);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], STEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], board.STEPPER.TYPE.TWO_WIRE);
    assert.equal(transport.lastWrite[5], 200 & 0x7F);
    assert.equal(transport.lastWrite[6], (200 >> 7) & 0x7F);
    assert.equal(transport.lastWrite[7], 2);
    assert.equal(transport.lastWrite[8], 3);
    assert.equal(transport.lastWrite[9], END_SYSEX);
    done();
  });

  it("can send a stepper config for a four wire configuration", done => {
    board.stepperConfig(0, board.STEPPER.TYPE.FOUR_WIRE, 200, 2, 3, 4, 5);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], STEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], board.STEPPER.TYPE.FOUR_WIRE);
    assert.equal(transport.lastWrite[5], 200 & 0x7F);
    assert.equal(transport.lastWrite[6], (200 >> 7) & 0x7F);
    assert.equal(transport.lastWrite[7], 2);
    assert.equal(transport.lastWrite[8], 3);
    assert.equal(transport.lastWrite[9], 4);
    assert.equal(transport.lastWrite[10], 5);
    assert.equal(transport.lastWrite[11], END_SYSEX);
    done();
  });

  it("can send a stepper move without acceleration or deceleration", done => {
    board.stepperStep(2, board.STEPPER.DIRECTION.CCW, 10000, 2000, complete => {
      assert.equal(complete, true);
      done();
    });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], STEPPER);
    assert.equal(transport.lastWrite[2], 1);
    assert.equal(transport.lastWrite[3], 2);
    assert.equal(transport.lastWrite[4], board.STEPPER.DIRECTION.CCW);
    assert.equal(transport.lastWrite[5], 10000 & 0x7F);
    assert.equal(transport.lastWrite[6], (10000 >> 7) & 0x7F);
    assert.equal(transport.lastWrite[7], (10000 >> 14) & 0x7F);
    assert.equal(transport.lastWrite[8], 2000 & 0x7F);
    assert.equal(transport.lastWrite[9], (2000 >> 7) & 0x7F);
    assert.equal(transport.lastWrite[9], (2000 >> 7) & 0x7F);
    assert.equal(transport.lastWrite[10], END_SYSEX);
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [STEPPER]);
    transport.emit("data", [2]);
    transport.emit("data", [END_SYSEX]);
  });

  it("can send a stepper move with acceleration and deceleration", done => {
    board.stepperStep(3, board.STEPPER.DIRECTION.CCW, 10000, 2000, 3000, 8000, complete => {
      assert.equal(complete, true);
      done();
    });

    const message = [START_SYSEX, STEPPER, 1, 3, board.STEPPER.DIRECTION.CCW, 10000 & 0x7F, (10000 >> 7) & 0x7F, (10000 >> 14) & 0x7F, 2000 & 0x7F, (2000 >> 7) & 0x7F, 3000 & 0x7F, (3000 >> 7) & 0x7F, 8000 & 0x7F, (8000 >> 7) & 0x7F, END_SYSEX];
    assert.deepEqual(transport.lastWrite, message);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [STEPPER]);
    transport.emit("data", [3]);
    transport.emit("data", [END_SYSEX]);
  });

  it("can send a accelStepper config for a driver configuration with enable and invert", done => {
    board.accelStepperConfig({ deviceNum: 0, type: board.STEPPER.TYPE.DRIVER, stepPin: 5, directionPin: 6, enablePin: 2, invertPins: [2] });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0x11);
    assert.equal(transport.lastWrite[5], 5);
    assert.equal(transport.lastWrite[6], 6);
    assert.equal(transport.lastWrite[7], 2);
    assert.equal(transport.lastWrite[8], 16);
    assert.equal(transport.lastWrite[9], END_SYSEX);
    done();
  });

  it("can send a accelStepper config for a two wire configuration", done => {
    board.accelStepperConfig({ deviceNum: 0, type: board.STEPPER.TYPE.TWO_WIRE, motorPin1: 5, motorPin2: 6, invertPins: [5, 6] });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0x20);
    assert.equal(transport.lastWrite[5], 5);
    assert.equal(transport.lastWrite[6], 6);
    assert.equal(transport.lastWrite[7], 3);
    assert.equal(transport.lastWrite[8], END_SYSEX);
    done();
  });

  it("can send a accelStepper config for a four wire configuration", done => {
    board.accelStepperConfig({ deviceNum: 0, type: board.STEPPER.TYPE.FOUR_WIRE, motorPin1: 5, motorPin2: 6, motorPin3: 3, motorPin4: 4 });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0x40);
    assert.equal(transport.lastWrite[5], 5);
    assert.equal(transport.lastWrite[6], 6);
    assert.equal(transport.lastWrite[7], 3);
    assert.equal(transport.lastWrite[8], 4);
    assert.equal(transport.lastWrite[9], 0);
    assert.equal(transport.lastWrite[10], END_SYSEX);
    done();
  });

  it("can send a accelStepper config for a four wire, half step configuration", done => {
    board.accelStepperConfig({ deviceNum: 0, type: board.STEPPER.TYPE.FOUR_WIRE, stepSize: board.STEPPER.STEP_SIZE.HALF, motorPin1: 5, motorPin2: 6, motorPin3: 3, motorPin4: 4 });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0x42);
    assert.equal(transport.lastWrite[5], 5);
    assert.equal(transport.lastWrite[6], 6);
    assert.equal(transport.lastWrite[7], 3);
    assert.equal(transport.lastWrite[8], 4);
    assert.equal(transport.lastWrite[9], 0);
    assert.equal(transport.lastWrite[10], END_SYSEX);
    done();
  });

  it("can send a accelStepper config with four wire and whole step as defaults", done => {
    board.accelStepperConfig({ deviceNum: 0, motorPin1: 5, motorPin2: 6, motorPin3: 3, motorPin4: 4 });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0x40);
    assert.equal(transport.lastWrite[5], 5);
    assert.equal(transport.lastWrite[6], 6);
    assert.equal(transport.lastWrite[7], 3);
    assert.equal(transport.lastWrite[8], 4);
    assert.equal(transport.lastWrite[9], 0);
    assert.equal(transport.lastWrite[10], END_SYSEX);
    done();
  });

  it("can send a accelStepper config for a default four wire configuration with inverted motor and enable pins", done => {
    board.accelStepperConfig({ deviceNum: 0, motorPin1: 5, motorPin2: 6, motorPin3: 3, motorPin4: 4, enablePin: 2, invertPins: [2, 3, 4, 5, 6] });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0x41);
    assert.equal(transport.lastWrite[5], 5);
    assert.equal(transport.lastWrite[6], 6);
    assert.equal(transport.lastWrite[7], 3);
    assert.equal(transport.lastWrite[8], 4);
    assert.equal(transport.lastWrite[9], 2);
    assert.equal(transport.lastWrite[10], 31);
    assert.equal(transport.lastWrite[11], END_SYSEX);
    done();
  });

  it("can send a accelStepper step", done => {
    board.accelStepperStep(0, 12345, value => {
      assert.equal(value, 12345);
      done();
    });

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 2);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 57);
    assert.equal(transport.lastWrite[5], 96);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], END_SYSEX);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ACCELSTEPPER]);
    transport.emit("data", [0x0A]);
    transport.emit("data", [0]);
    transport.emit("data", [57]);
    transport.emit("data", [96]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);
  });

  it("can send a accelStepper step w/o a callback", done => {
    board.accelStepperStep(0, 12345);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 2);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 57);
    assert.equal(transport.lastWrite[5], 96);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], END_SYSEX);

    done();
  });

  it("can send a accelStepper zero", done => {
    board.accelStepperZero(0);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 1);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], END_SYSEX);
    done();
  });

  it("can send a accelStepper enable", done => {
    board.accelStepperEnable(0, true);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 4);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 1);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });

  it("can send a accelStepper enable using default value", done => {
    board.accelStepperEnable(0);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 4);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 1);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });

  it("can can send a accelStepper disable", done => {
    board.accelStepperEnable(0, false);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 4);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });

  it("can send a accelStepper move to as specified position", done => {
    board.accelStepperTo(0, 2000, value => {
      assert.equal(value, 2000);
      done();
    });

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 3);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 80);
    assert.equal(transport.lastWrite[5], 15);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], END_SYSEX);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ACCELSTEPPER]);
    transport.emit("data", [0x0A]);
    transport.emit("data", [0]);
    transport.emit("data", [80]);
    transport.emit("data", [15]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);
  });

  it("can send a accelStepper move to as specified position w/o a callback", done => {
    board.accelStepperTo(0, 2000);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 3);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 80);
    assert.equal(transport.lastWrite[5], 15);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], END_SYSEX);

    done();
  });

  it("can send an accelStepper stop", done => {

    board.accelStepperStop(0);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 5);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], END_SYSEX);

    done();

  });

  it("can send a accelStepper reportPosition", done => {
    board.accelStepperReportPosition(0, () => done());

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 6);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], END_SYSEX);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ACCELSTEPPER]);
    transport.emit("data", [0x06]);
    transport.emit("data", [0]);
    transport.emit("data", [80]);
    transport.emit("data", [15]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);

  });

  it("can send a accelStepper set speed", done => {
    board.accelStepperSpeed(0, 123.4);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 9);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 82);
    assert.equal(transport.lastWrite[5], 9);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 40);
    assert.equal(transport.lastWrite[8], END_SYSEX);
    done();
  });

  it("can send a accelStepper set acceleration", done => {
    board.accelStepperAcceleration(0, 199.9);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 8);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 24);
    assert.equal(transport.lastWrite[5], 1);
    assert.equal(transport.lastWrite[6], 122);
    assert.equal(transport.lastWrite[7], 28);
    assert.equal(transport.lastWrite[8], END_SYSEX);
    done();
  });

  it("can configure a multiStepper", done => {
    board.multiStepperConfig({ groupNum: 0, devices: [0, 1, 2] });

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0x20);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 0);
    assert.equal(transport.lastWrite[5], 1);
    assert.equal(transport.lastWrite[6], 2);
    assert.equal(transport.lastWrite[7], END_SYSEX);
    done();
  });

  it("can send a multiStepper stop", done => {
    board.multiStepperStop(0);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0x23);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], END_SYSEX);
    done();
  });

  it("multiStepperStop(-1)", done => {
    assert.throws(() => {
      board.multiStepperStop(-1);
    });
    done();
  });

  it("multiStepperStop(6)", done => {
    assert.throws(() => {
      board.multiStepperStop(6);
    });
    done();
  });

  it("can send a multiStepper to", done => {
    board.multiStepperTo(0, [200, 400, 600], () => done());

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0x21);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 72);
    assert.equal(transport.lastWrite[5], 1);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], 16);
    assert.equal(transport.lastWrite[10], 3);
    assert.equal(transport.lastWrite[11], 0);
    assert.equal(transport.lastWrite[12], 0);
    assert.equal(transport.lastWrite[13], 0);
    assert.equal(transport.lastWrite[14], 88);
    assert.equal(transport.lastWrite[15], 4);
    assert.equal(transport.lastWrite[16], 0);
    assert.equal(transport.lastWrite[17], 0);
    assert.equal(transport.lastWrite[18], 0);
    assert.equal(transport.lastWrite[19], END_SYSEX);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ACCELSTEPPER]);
    transport.emit("data", [0x24]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);

  });

  it("can send a multiStepper to w/o a callback", done => {
    board.multiStepperTo(0, [200, 400, 600]);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], ACCELSTEPPER);
    assert.equal(transport.lastWrite[2], 0x21);
    assert.equal(transport.lastWrite[3], 0);
    assert.equal(transport.lastWrite[4], 72);
    assert.equal(transport.lastWrite[5], 1);
    assert.equal(transport.lastWrite[6], 0);
    assert.equal(transport.lastWrite[7], 0);
    assert.equal(transport.lastWrite[8], 0);
    assert.equal(transport.lastWrite[9], 16);
    assert.equal(transport.lastWrite[10], 3);
    assert.equal(transport.lastWrite[11], 0);
    assert.equal(transport.lastWrite[12], 0);
    assert.equal(transport.lastWrite[13], 0);
    assert.equal(transport.lastWrite[14], 88);
    assert.equal(transport.lastWrite[15], 4);
    assert.equal(transport.lastWrite[16], 0);
    assert.equal(transport.lastWrite[17], 0);
    assert.equal(transport.lastWrite[18], 0);
    assert.equal(transport.lastWrite[19], END_SYSEX);

    done();

  });

  it("multiStepperTo(-1)", done => {
    assert.throws(() => {
      board.multiStepperTo(-1);
    });
    done();
  });

  it("multiStepperTo(6)", done => {
    assert.throws(() => {
      board.multiStepperStop(6);
    });
    done();
  });

  it("can receive a stepper position", done => {
    board.once("stepper-position-0", value => {
      assert.equal(value, 1234);
      done();
    });

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ACCELSTEPPER]);
    transport.emit("data", [0x06]);
    transport.emit("data", [0]);
    transport.emit("data", [82]);
    transport.emit("data", [9]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);

  });

  it("can receive a multStepper done", done => {
    board.once("multi-stepper-done-0", () => done());

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ACCELSTEPPER]);
    transport.emit("data", [0x24]);
    transport.emit("data", [0]);
    transport.emit("data", [END_SYSEX]);

  });

  it("must be able to send a 1-wire config with parasitic power enabled", done => {
    board.sendOneWireConfig(1, true);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_CONFIG_REQUEST);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[4], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });
  it("must be able to send a 1-wire config with parasitic power disabled", done => {
    board.sendOneWireConfig(1, false);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_CONFIG_REQUEST);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[4], 0x00);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });
  it("must be able to send a 1-wire search request and recieve a reply", done => {
    board.sendOneWireSearch(1, (error, devices) => {
      assert.equal(devices.length, 1);
      done();
    });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_SEARCH_REQUEST);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[4], END_SYSEX);

    transport.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_SEARCH_REPLY, ONEWIRE_RESET_REQUEST_BIT, 0x28, 0x36, 0x3F, 0x0F, 0x52, 0x00, 0x00, 0x00, 0x5D, 0x00, END_SYSEX]);
  });
  it("must be able to send a 1-wire search alarm request and recieve a reply", done => {
    board.sendOneWireAlarmsSearch(1, (error, devices) => {
      assert.equal(devices.length, 1);
      done();
    });
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_SEARCH_ALARMS_REQUEST);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[4], END_SYSEX);

    transport.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_SEARCH_ALARMS_REPLY, ONEWIRE_RESET_REQUEST_BIT, 0x28, 0x36, 0x3F, 0x0F, 0x52, 0x00, 0x00, 0x00, 0x5D, 0x00, END_SYSEX]);
  });
  it("must be able to send a 1-wire write read", done => {
    sandbox.spy(board, Board.test.symbols.SYM_sendOneWireRequest);
    board.sendOneWireRead(1, 1, 1, () => {});

    board[Board.test.symbols.SYM_sendOneWireRequest].lastCall.args[8]();
    done();
  });
  it("must be able to send a 1-wire reset request", done => {
    board.sendOneWireReset(1);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    done();
  });
  it("must be able to send a 1-wire delay request", done => {
    const delay = 1000;

    board.sendOneWireDelay(1, delay);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    const request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));
    const sentDelay = request[12] | (request[13] << 8) | (request[14] << 12) | request[15] << 24;
    assert.equal(sentDelay, delay);

    done();
  });

  it("must be able to send a 1-wire write request", done => {
    const device = [40, 219, 239, 33, 5, 0, 0, 93];
    const data = 0x33;

    board.sendOneWireWrite(1, device, data);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    const request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));

    // should select the passed device
    assert.equal(request[0], device[0]);
    assert.equal(request[1], device[1]);
    assert.equal(request[2], device[2]);
    assert.equal(request[3], device[3]);
    assert.equal(request[4], device[4]);
    assert.equal(request[5], device[5]);
    assert.equal(request[6], device[6]);
    assert.equal(request[7], device[7]);

    // and send the passed data
    assert.equal(request[16], data);

    done();
  });

  it("must be able to send a 1-wire write request (Array)", done => {
    const device = [40, 219, 239, 33, 5, 0, 0, 93];
    const data = 0x33;

    board.sendOneWireWrite(1, device, [data]);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    const request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));

    // should select the passed device
    assert.equal(request[0], device[0]);
    assert.equal(request[1], device[1]);
    assert.equal(request[2], device[2]);
    assert.equal(request[3], device[3]);
    assert.equal(request[4], device[4]);
    assert.equal(request[5], device[5]);
    assert.equal(request[6], device[6]);
    assert.equal(request[7], device[7]);

    // and send the passed data
    assert.equal(request[16], data);

    done();
  });
  it("must be able to send a 1-wire write and read request and recieve a reply", done => {
    const device = [40, 219, 239, 33, 5, 0, 0, 93];
    const data = 0x33;
    const output = [ONEWIRE_RESET_REQUEST_BIT, 0x02];

    board.sendOneWireWriteAndRead(1, device, data, 2, (error, received) => {

      assert.deepEqual(received, output);
      done();
    });

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    const request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));

    // should select the passed device
    assert.equal(request[0], device[0]);
    assert.equal(request[1], device[1]);
    assert.equal(request[2], device[2]);
    assert.equal(request[3], device[3]);
    assert.equal(request[4], device[4]);
    assert.equal(request[5], device[5]);
    assert.equal(request[6], device[6]);
    assert.equal(request[7], device[7]);

    // and send the passed data
    assert.equal(request[16], data);

    const dataSentFromBoard = [];

    // respond with the same correlation id
    dataSentFromBoard[0] = request[10];
    dataSentFromBoard[1] = request[11];

    // data "read" from the 1-wire device
    dataSentFromBoard[2] = output[0];
    dataSentFromBoard[3] = output[1];

    transport.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_READ_REPLY, ONEWIRE_RESET_REQUEST_BIT].concat(Encoder7Bit.to7BitArray(dataSentFromBoard)).concat([END_SYSEX]));
  });

  it("must be able to send a 1-wire write and read request and recieve a reply (array)", done => {
    const device = [40, 219, 239, 33, 5, 0, 0, 93];
    const data = 0x33;
    const output = [ONEWIRE_RESET_REQUEST_BIT, 0x02];

    board.sendOneWireWriteAndRead(1, device, [data], 2, (error, received) => {
      assert.deepEqual(received, output);
      done();
    });

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    const request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));

    // should select the passed device
    assert.equal(request[0], device[0]);
    assert.equal(request[1], device[1]);
    assert.equal(request[2], device[2]);
    assert.equal(request[3], device[3]);
    assert.equal(request[4], device[4]);
    assert.equal(request[5], device[5]);
    assert.equal(request[6], device[6]);
    assert.equal(request[7], device[7]);

    // and send the passed data
    assert.equal(request[16], data);

    const dataSentFromBoard = [];

    // respond with the same correlation id
    dataSentFromBoard[0] = request[10];
    dataSentFromBoard[1] = request[11];

    // data "read" from the 1-wire device
    dataSentFromBoard[2] = output[0];
    dataSentFromBoard[3] = output[1];

    transport.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_READ_REPLY, ONEWIRE_RESET_REQUEST_BIT].concat(Encoder7Bit.to7BitArray(dataSentFromBoard)).concat([END_SYSEX]));
  });

  describe("Servo", () => {
    it("can configure a servo pwm range", done => {
      board.servoConfig(3, 1000, 2000);
      assert.equal(transport.lastWrite[0], START_SYSEX);
      assert.equal(transport.lastWrite[1], SERVO_CONFIG);
      assert.equal(transport.lastWrite[2], 0x03);

      assert.equal(transport.lastWrite[3], 1000 & 0x7F);
      assert.equal(transport.lastWrite[4], (1000 >> 7) & 0x7F);

      assert.equal(transport.lastWrite[5], 2000 & 0x7F);
      assert.equal(transport.lastWrite[6], (2000 >> 7) & 0x7F);
      done();
    });

    it("can configure a servo pwm range, with object", done => {
      board.servoConfig({
        pin: 3,
        min: 1000,
        max: 2000,
      });
      assert.equal(transport.lastWrite[0], START_SYSEX);
      assert.equal(transport.lastWrite[1], SERVO_CONFIG);
      assert.equal(transport.lastWrite[2], 0x03);

      assert.equal(transport.lastWrite[3], 1000 & 0x7F);
      assert.equal(transport.lastWrite[4], (1000 >> 7) & 0x7F);

      assert.equal(transport.lastWrite[5], 2000 & 0x7F);
      assert.equal(transport.lastWrite[6], (2000 >> 7) & 0x7F);
      done();
    });

    it("will throw if servoConfig is missing any parameters", done => {

      assert.throws(() => {
        board.servoConfig();
      });

      assert.throws(() => {
        board.servoConfig(3, 1000);
      });

      assert.throws(() => {
        board.servoConfig({
          min: 1000,
          max: 2000,
        });
      });

      assert.throws(() => {
        board.servoConfig({
          pin: 3,
          max: 2000,
        });
      });

      assert.throws(() => {
        board.servoConfig({
          pin: 3,
          min: 1000,
        });
      });

      assert.throws(() => {
        board.servoConfig({});
      });
      done();
    });

    it("calls analogWrite with arguments", done => {
      const aw = sandbox.stub(board, "analogWrite");

      board.servoWrite(9, 180);
      assert.deepEqual(aw.lastCall.args, [9, 180]);

      board.servoWrite(9, 600);
      assert.deepEqual(aw.lastCall.args, [9, 600]);
      done();
    });

  });

  describe("I2C", () => {

    it("throws if i2c not enabled", done => {

      assert.throws(() => {
        board.i2cRead(1, 1, initNoop);
      });
      assert.throws(() => {
        board.i2cReadOnce(1, 1, initNoop);
      });
      assert.throws(() => {
        board.i2cWrite(1, [1, 2, 3]);
      });
      assert.throws(() => {
        board.i2cWriteReg(1, 1, 1);
      });
      done();
    });

    it("must be able to send an i2c config (empty)", done => {
      board.i2cConfig();
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_CONFIG, 0, 0, END_SYSEX]);
      done();
    });

    it("calls i2cConfig (sendI2CConfig)", done => {

      const ic = sandbox.stub(board, "i2cConfig");

      board.sendI2CConfig();
      assert.equal(ic.callCount, 1);
      done();
    });

    it("must be able to send an i2c config (number)", done => {
      board.i2cConfig(1);
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_CONFIG, 1 & 0xFF, (1 >> 8) & 0xFF, END_SYSEX]);
      done();
    });

    it("must be able to send an i2c config (object with delay property)", done => {
      board.i2cConfig({ delay: 1 });
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_CONFIG, 1 & 0xFF, (1 >> 8) & 0xFF, END_SYSEX]);
      done();
    });

    it("must be able to send an i2c request", done => {
      board.i2cConfig(1);
      board.sendI2CWriteRequest(0x68, [1, 2, 3]);
      const request = [START_SYSEX, I2C_REQUEST, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F, 2 & 0x7F, (2 >> 7) & 0x7F, 3 & 0x7F, (3 >> 7) & 0x7F, END_SYSEX];
      assert.deepEqual(transport.lastWrite, request);
      done();
    });

    it("must be able to receive an i2c reply", done => {
      const handler = sandbox.spy(() => {});
      board.i2cConfig(1);
      board.sendI2CReadRequest(0x68, 4, handler);
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_REQUEST, 0x68, 1 << 3, 4 & 0x7F, (4 >> 7) & 0x7F, END_SYSEX]);

      // Start
      transport.emit("data", [START_SYSEX]);
      // Reply
      transport.emit("data", [I2C_REPLY]);
      // Address
      transport.emit("data", [0x68 % 128]);
      transport.emit("data", [0x68 >> 7]);
      // Register
      transport.emit("data", [0]);
      transport.emit("data", [0]);
      // Data 0
      transport.emit("data", [1 & 0x7F]);
      transport.emit("data", [(1 >> 7) & 0x7F]);
      // Data 1
      transport.emit("data", [2 & 0x7F]);
      transport.emit("data", [(2 >> 7) & 0x7F]);
      // Data 2
      transport.emit("data", [3 & 0x7F]);
      transport.emit("data", [(3 >> 7) & 0x7F]);
      // Data 3
      transport.emit("data", [4 & 0x7F]);
      transport.emit("data", [(4 >> 7) & 0x7F]);
      // End
      transport.emit("data", [END_SYSEX]);

      assert.equal(handler.callCount, 1);
      assert.deepEqual(handler.getCall(0).args[0], [1, 2, 3, 4]);
      done();
    });

    it("does not create default settings for an i2c peripheral, when call to i2cConfig does not include address", done => {
      board.i2cConfig();

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), { delay: 0 });
      done();
    });

    it("creates default settings for an i2c peripheral, with call to i2cConfig that includes address", done => {
      board.i2cConfig({
        address: 0x00
      });

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cWrite)", done => {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cWrite(0x00, [0x01, 0x02]);
      board.i2cWrite(0x05, [0x06, 0x07]);

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cWriteReg)", done => {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cWriteReg(0x00, 0x01, 0x02);
      board.i2cWriteReg(0x05, 0x06, 0x07);

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cRead w/ Register)", done => {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cRead(0x00, 0x01, 1, initNoop);
      board.i2cRead(0x05, 0x06, 1, initNoop);

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cRead w/o Register)", done => {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cRead(0x00, 1, initNoop);
      board.i2cRead(0x05, 1, initNoop);

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("does nothing when i2cStop()", done => {
      board.i2cConfig();

      assert.equal(transportWrite.callCount, 0);

      board.i2cRead(0x00, 1, initNoop);
      board.i2cStop();
      assert.equal(transportWrite.callCount, 0);
      done();
    });

    it("can stop a continuous read with i2cStop(address)", done => {
      board.i2cConfig();

      Object.keys(board._events).forEach(event => {
        if (event.startsWith("I2C-reply-")) {
          board.removeAllListeners(event);
        }
      });
      const removeAllListeners = sandbox.spy(board, "removeAllListeners");


      board.i2cRead(0x00, 1, initNoop);
      board.i2cStop(0x00);

      assert.equal(transport.lastWrite[2], 0x00);
      assert.equal(transport.lastWrite[3], board.I2C_MODES.STOP_READING << 3);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      assert.equal(removeAllListeners.callCount, 1);
      done();
    });

    it("can stop a continuous read with i2cStop({address})", done => {
      board.i2cConfig();

      Object.keys(board._events).forEach(event => {
        if (event.startsWith("I2C-reply-")) {
          board.removeAllListeners(event);
        }
      });
      const removeAllListeners = sandbox.spy(board, "removeAllListeners");

      board.i2cRead(0x00, 1, initNoop);
      board.i2cStop({ address: 0x00 });

      assert.equal(transport.lastWrite[2], 0x00);
      assert.equal(transport.lastWrite[3], board.I2C_MODES.STOP_READING << 3);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      assert.equal(removeAllListeners.callCount, 1);
      done();
    });


    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cReadOnce w/ Register)", done => {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cReadOnce(0x00, 0x01, 1, initNoop);
      board.i2cReadOnce(0x05, 0x06, 1, initNoop);

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cReadOnce w/o Register)", done => {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cReadOnce(0x00, 1, initNoop);
      board.i2cReadOnce(0x05, 1, initNoop);

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: true,
        },
        5: {
          stopTX: true,
        },
        delay: 0,
      });
      done();
    });

    it("can store arbitrary settings for an i2c peripheral via i2cConfig", done => {
      board.i2cConfig({
        address: 0x00,
        settings: {
          whatever: true,
        }
      });

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        delay: 0,
        0: {
          stopTX: true,
          whatever: true,
        }
      });
      done();
    });

    it("allows stored i2c peripheral settings to be reconfigured via i2cConfig", done => {
      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: false,
        }
      });

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: false,
        },
        delay: 0,
      });

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: true,
        }
      });

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        delay: 0,
        0: {
          stopTX: true,
        }
      });
      done();
    });

    it("allows an i2c peripheral's stopTX to be overridden", done => {
      // var spy = sandbox.spy(board.transport, "write");
      const mask = 0x48; // 01001000

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: true,
        }
      });

      board.i2cReadOnce(0x00, 0x01, 1, initNoop);

      assert.deepEqual(transport.lastWrite, [240, 118, 0, 8, 1, 0, 1, 0, 247]);

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: false,
        }
      });

      assert.deepEqual(Board.test.i2cPeripheralSettings(board), {
        0: {
          stopTX: false,
        },
        delay: 0,
      });

      board.i2cReadOnce(0x00, 0x01, 1, initNoop);

      assert.deepEqual(transport.lastWrite, [240, 118, 0, 72, 1, 0, 1, 0, 247]);

      board.i2cRead(0x00, 0x01, 1, initNoop);

      assert.deepEqual(transport.lastWrite, [240, 118, 0, 80, 1, 0, 1, 0, 247]);
      done();
    });

    it("has an i2cWrite method, that writes a data array", done => {
      const spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, [1, 2]);

      assert.deepEqual(transport.lastWrite, [240, 118, 83, 0, 1, 0, 2, 0, 247]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a byte", done => {
      const spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 1);

      assert.deepEqual(transport.lastWrite, [240, 118, 83, 0, 1, 0, 247]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a data array to a register", done => {
      const spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, [1, 2]);

      assert.deepEqual(transport.lastWrite, [240, 118, 83, 0, 50, 1, 1, 0, 2, 0, 247]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a data byte to a register", done => {
      const spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, 1);

      assert.deepEqual(transport.lastWrite, [240, 118, 83, 0, 50, 1, 1, 0, 247]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWriteReg method, that writes a data byte to a register", done => {
      const spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, 1);

      assert.deepEqual(transport.lastWrite, [240, 118, 83, 0, 50, 1, 1, 0, 247]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cRead method that reads continuously", done => {
      const handler = sandbox.spy(() => {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0x04, handler);

      for (let i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
       ]);
      }

      assert.equal(handler.callCount, 5);
      assert.equal(handler.getCall(0).args[0].length, 4);
      assert.equal(handler.getCall(1).args[0].length, 4);
      assert.equal(handler.getCall(2).args[0].length, 4);
      assert.equal(handler.getCall(3).args[0].length, 4);
      assert.equal(handler.getCall(4).args[0].length, 4);
      done();
    });

    it("has an i2cRead method that reads a register continuously", done => {
      const handler = sandbox.spy(() => {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0xB2, 0x04, handler);

      for (let i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
       ]);
      }

      assert.equal(handler.callCount, 5);
      assert.equal(handler.getCall(0).args[0].length, 4);
      assert.equal(handler.getCall(1).args[0].length, 4);
      assert.equal(handler.getCall(2).args[0].length, 4);
      assert.equal(handler.getCall(3).args[0].length, 4);
      assert.equal(handler.getCall(4).args[0].length, 4);
      done();
    });


    it("has an i2cRead method that reads continuously", done => {
      const handler = sandbox.spy(() => {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0x04, handler);

      for (let i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
       ]);
      }

      assert.equal(handler.callCount, 5);
      assert.equal(handler.getCall(0).args[0].length, 4);
      assert.equal(handler.getCall(1).args[0].length, 4);
      assert.equal(handler.getCall(2).args[0].length, 4);
      assert.equal(handler.getCall(3).args[0].length, 4);
      assert.equal(handler.getCall(4).args[0].length, 4);
      done();
    });

    it("has an i2cReadOnce method that reads a register once", done => {
      const handler = sandbox.spy(() => {});

      board.i2cConfig(0);
      board.i2cReadOnce(0x53, 0xB2, 0x04, handler);

      // Emit data enough times to potentially break it.
      for (let i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
       ]);
      }

      assert.equal(handler.callCount, 1);
      assert.equal(handler.getCall(0).args[0].length, 4);
      done();
    });

    it("has an i2cReadOnce method that reads a register once", done => {
      const handler = sandbox.spy(() => {});

      board.i2cConfig(0);
      board.i2cReadOnce(0x53, 0xB2, 0x04, handler);

      // Emit data enough times to potentially break it.
      for (let i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
       ]);
      }

      assert.equal(handler.callCount, 1);
      assert.equal(handler.getCall(0).args[0].length, 4);
      done();
    });
  });

  describe("Serial", () => {

    it("has a SERIAL_MODES property", done => {

      assert.deepEqual(board.SERIAL_MODES, {
        CONTINUOUS_READ: 0x00,
        STOP_READING: 0x01,
      });
      done();
    });

    it("has a SERIAL_PORT_IDs property", done => {

      assert.deepEqual(board.SERIAL_PORT_IDs, {
        HW_SERIAL0: 0x00,
        HW_SERIAL1: 0x01,
        HW_SERIAL2: 0x02,
        HW_SERIAL3: 0x03,
        SW_SERIAL0: 0x08,
        SW_SERIAL1: 0x09,
        SW_SERIAL2: 0x10,
        SW_SERIAL3: 0x11,
        DEFAULT: 0x08,
      });
      done();
    });

    // SERIAL_PIN_TYPES is currently unused.
    // it("has a SERIAL_PIN_TYPES property", done => {

    //   assert.deepEqual(board.SERIAL_PORT_IDs, {
    //     RES_RX0: 0x00,
    //     RES_TX0: 0x01,
    //     RES_RX1: 0x02,
    //     RES_TX1: 0x03,
    //     RES_RX2: 0x04,
    //     RES_TX2: 0x05,
    //     RES_RX3: 0x06,
    //     RES_TX3: 0x07,
    //   });

    //   done();
    // });

    it("can configure a software serial port", done => {
      board.serialConfig({
        portId: 0x08,
        baud: 9600,
        rxPin: 10,
        txPin: 11
      });
      assert.equal(transport.lastWrite[0], START_SYSEX);
      assert.equal(transport.lastWrite[2], SERIAL_CONFIG | 0x08);

      assert.equal(transport.lastWrite[3], 9600 & 0x007F);
      assert.equal(transport.lastWrite[4], (9600 >> 7) & 0x007F);
      assert.equal(transport.lastWrite[5], (9600 >> 14) & 0x007F);

      assert.equal(transport.lastWrite[6], 10);
      assert.equal(transport.lastWrite[7], 11);

      assert.equal(transport.lastWrite[8], END_SYSEX);
      done();
    });

    it("can configure a hardware serial port", done => {
      board.serialConfig({
        portId: 0x01,
        buad: 57600
      });
      assert.equal(transport.lastWrite[2], SERIAL_CONFIG | 0x01);

      assert.equal(transport.lastWrite[3], 57600 & 0x007F);
      assert.equal(transport.lastWrite[4], (57600 >> 7) & 0x007F);
      assert.equal(transport.lastWrite[5], (57600 >> 14) & 0x007F);

      assert.equal(transport.lastWrite[6], END_SYSEX);
      done();
    });

    it("throws an error if no serial port id is passed", done => {
      assert.throws(() => {
        board.serialConfig({
          buad: 57600
        });
      });
      done();
    });

    it("throws an error if both RX and TX pins are not defined when using Software Serial", done => {
      // throw error if both pins are not specified
      assert.throws(() => {
        board.serialConfig({
          portId: 8,
          buad: 57600
        });
      });

      // throw error if only one serial pin is specified
      assert.throws(() => {
        board.serialConfig({
          portId: 8,
          buad: 57600,
          txPin: 0
        });
      });
      done();
    });

    it("can write a single byte to a serial port", done => {
      board.serialWrite(0x08, [1]);
      assert.equal(transport.lastWrite[2], SERIAL_WRITE | 0x08);
      assert.equal(transport.lastWrite[3], 1 & 0x7F);
      assert.equal(transport.lastWrite[4], (1 >> 7) & 0x7F);
      assert.equal(transport.lastWrite[5], END_SYSEX);
      done();
    });

    it("can write a byte array to a serial port", done => {
      board.serialWrite(0x08, [252, 253, 254]);
      assert.equal(transport.lastWrite[2], SERIAL_WRITE | 0x08);
      assert.equal(transport.lastWrite[3], 252 & 0x7F);
      assert.equal(transport.lastWrite[4], (252 >> 7) & 0x7F);
      assert.equal(transport.lastWrite[7], 254 & 0x7F);
      assert.equal(transport.lastWrite[8], (254 >> 7) & 0x7F);
      assert.equal(transport.lastWrite[9], END_SYSEX);
      done();
    });

    it("has a serialRead method that sets READ_CONTINUOUS mode", done => {
      const handler = sandbox.spy(() => {});
      board.serialRead(0x08, handler);

      assert.equal(transport.lastWrite[2], SERIAL_READ | 0x08);
      assert.equal(transport.lastWrite[3], 0);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      done();
    });

    it("has a serialRead method that reads continuously", done => {
      const inBytes = [
        242 & 0x7F,
        (242 >> 7) & 0x7F,
        243 & 0x7F,
        (243 >> 7) & 0x7F,
        244 & 0x7F,
        (244 >> 7) & 0x7F,
      ];

      const handler = sandbox.spy(() => {});
      board.serialRead(0x08, handler);

      for (let i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX,
          SERIAL_MESSAGE,
          SERIAL_REPLY | 0x08,
          inBytes[0],
          inBytes[1],
          inBytes[2],
          inBytes[3],
          inBytes[4],
          inBytes[5],
          END_SYSEX
       ]);
      }

      assert.equal(handler.callCount, 5);
      assert.equal(handler.getCall(0).args[0].length, 3);
      assert.equal(handler.getCall(0).args[0][0], 242);
      assert.equal(handler.getCall(0).args[0][2], 244);
      assert.equal(handler.getCall(1).args[0].length, 3);
      assert.equal(handler.getCall(2).args[0].length, 3);
      assert.equal(handler.getCall(3).args[0].length, 3);
      assert.equal(handler.getCall(4).args[0].length, 3);
      done();
    });

    it("serialRead accepts an optional maxBytesToRead parameter", done => {
      const maxBytesToRead = 4;
      const handler = sandbox.spy(() => {});
      board.serialRead(0x08, maxBytesToRead, handler);

      assert.equal(transport.lastWrite[4], 4);
      assert.equal(transport.lastWrite[5], 0);
      assert.equal(transport.lastWrite[6], END_SYSEX);
      done();
    });

    it("has a serialStop method that sets STOP_READING mode", done => {
      board.serialStop(0x08);
      assert.equal(transport.lastWrite[2], SERIAL_READ | 0x08);
      assert.equal(transport.lastWrite[3], 1);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      done();
    });

    it("has a serialClose method", done => {
      board.serialClose(0x09);
      assert.equal(transport.lastWrite[2], SERIAL_CLOSE | 0x09);
      done();
    });

    it("has a serialFlush method", done => {
      board.serialFlush(0x02);
      assert.equal(transport.lastWrite[2], SERIAL_FLUSH | 0x02);
      done();
    });

    it("has a serialListen method that switches software serial port", done => {
      const spy = sandbox.spy(transport, "write");
      board.serialListen(0x08);
      assert.equal(transport.lastWrite[2], SERIAL_LISTEN | 0x08);
      assert.equal(transport.lastWrite[3], END_SYSEX);
      assert.equal(spy.callCount, 1);
      spy.restore();
      done();
    });

    it("must not send a SERIAL_LISTEN message for a hardware serial port", done => {
      const spy = sandbox.spy(transport, "write");
      board.serialListen(0x01);
      assert.equal(spy.callCount, 0);
      spy.restore();
      done();
    });

  });

  describe("sysex: custom messages and response handlers", () => {

    it("must allow custom SYSEX_RESPONSE handlers", done => {

      assert.equal(Board.SYSEX_RESPONSE[NON_STANDARD_REPLY], undefined);

      Board.SYSEX_RESPONSE[NON_STANDARD_REPLY] = board => {
        const payload = [];
        const sub = board.buffer[2];

        for (let i = 3, length = board.buffer.length - 1; i < length; i += 2) {
          payload.push(board.buffer[i] | (board.buffer[i + 1] << 7));
        }

        board.emit(`non-standard-reply-${sub}`, payload);
      };

      // User code may add this emitter
      board.on("non-standard-reply-4", payload => {
        assert.deepEqual(payload, [0, 1, 2, 3, 4]);
        done();
      });

      // Emit mock data to trigger the NON_STANDARD_REPLY handler
      transport.emit("data", [
        //                               SUB   Data...
        START_SYSEX, NON_STANDARD_REPLY, 0x04, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
     ]);
    });

    it("must provide a SAFE API to define custom SYSEX_RESPONSE handlers", done => {

      const incoming = [START_SYSEX, NON_STANDARD_REPLY, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX];

      board.sysexResponse(NON_STANDARD_REPLY, data => {
        // Data does NOT include:
        // [0] START_SYSEX
        // [1] NON_STANDARD_REPLY
        // [n] END_SYSEX

        assert.deepEqual(data, [0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
        assert.deepEqual(Board.decode(data), [0, 1, 2, 3, 4]);

        done();
      });

      transport.emit("data", incoming);
    });

    it("SYSEX_RESPONSE handler context is board", done => {

      const incoming = [START_SYSEX, NON_STANDARD_REPLY, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX];

      board.sysexResponse(NON_STANDARD_REPLY, function(data) {
        assert.equal(this, board);
        done();
      });

      transport.emit("data", incoming);
    });

    it("fail when overwriting SYSEX_RESPONSE command byte", done => {
      Board.SYSEX_RESPONSE[0xFF] = () => {};

      assert.throws(() => {
        board.sysexResponse(0xFF);
      });
      done();
    });

    it("fail when calling sysexCommand with empty array", done => {
      assert.throws(() => {
        board.sysexCommand();
      });
      assert.throws(() => {
        board.sysexCommand([]);
      });
      done();
    });

    it("must allow sending arbitrary sysex commands", done => {

      const write = sandbox.stub(transport, "write");

      board.sysexCommand([
        I2C_REQUEST, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F,
     ]);

      const sent = write.lastCall.args[0];

      assert.equal(sent[0], START_SYSEX);
      assert.equal(sent[1], I2C_REQUEST);
      assert.equal(sent[2], 0x68);
      assert.equal(sent[3], 0 << 3);
      assert.equal(sent[4], 1 & 0x7F);
      assert.equal(sent[5], (1 >> 7) & 0x7F);
      assert.equal(sent[6], END_SYSEX);
      done();
    });

    it("allows clearing handler for SYSEX_RESPONSE command byte", done => {
      Board.SYSEX_RESPONSE[0xFF] = () => {};

      board.clearSysexResponse(0xFF);

      assert.doesNotThrow(() => {
        board.sysexResponse(0xFF);
      });
      done();
    });
  });

  describe("parser", () => {

    beforeEach(() => {
      board.buffer = [];
    });

    it("must parse a command from the beginning of a data packet", done => {
      const spy = sandbox.spy();
      const incoming = [REPORT_VERSION, 0x02, 0x03];
      board.versionReceived = false;
      board.on("reportversion", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a command from the middle of a data packet", done => {
      const spy = sandbox.spy();
      // includes: analog input, report version, query firmware (incomplete)
      const incoming = [
        0xe0, 0x07, 0x07, 0xf9, 0x02, 0x05, 0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74, 0x00, 0x61,
        0x00, 0x6e, 0x00, 0x64, 0x00
      ];
      board.versionReceived = false;
      board.on("reportversion", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must not emit command events until REPORT_VERSION is received", done => {
      const spyAnalog = sandbox.spy();
      const spyVersion = sandbox.spy();
      // includes: analog input, report version, query firmware (incomplete) and junk
      // between analog input and report version
      const incoming = [
        0xe0, 0x00, 0x71, 0xf9, 0x02, 0x05, 0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74,
        0x00, 0x61, 0x00, 0x6e, 0x00, 0x64, 0x00
      ];
      board.versionReceived = false;
      board.on("analog-read-0", spyAnalog);
      board.on("reportversion", spyVersion);
      transport.emit("data", incoming);
      assert.equal(spyAnalog.callCount, 0);
      assert.equal(spyVersion.callCount, 1);
      done();
    });

    it("must parse multiple commands from a single packet", done => {
      const spyAnalog = sandbox.spy();
      const spyVersion = sandbox.spy();
      // includes: report version, analog input, query firmware (incomplete) and junk
      // between analog input and report version
      const incoming = [
        0xf9, 0x02, 0x05, 0xe0, 0x00, 0x71, 0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74,
        0x00, 0x61, 0x00, 0x6e, 0x00, 0x64, 0x00
      ];
      board.versionReceived = false;
      board.on("reportversion", spyVersion);
      board.on("analog-read-0", spyAnalog);
      transport.emit("data", incoming);
      assert.equal(spyVersion.callCount, 1);
      assert.equal(spyAnalog.callCount, 1);
      done();
    });

    it("must parse a complete sysex command after an incomplete sysex command", done => {
      const spy = sandbox.spy();
      // includes: query firmware (incomplete sysex), pin state response (pin 2)
      const incoming = [
        0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74, 0x00, 0x61, 0x00, 0x6e, 0x00, 0x64, 0x00,
        0xf0, 0x6e, 0x02, 0x01, 0x01, 0xf7
      ];
      board.versionReceived = true;
      board.on("pin-state-2", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a non-sysex command after an incomplete sysex command", done => {
      const spy = sandbox.spy();
      // includes: query firmware (incomplete sysex), analog input
      const incoming = [
        0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74, 0x00, 0x61, 0x00, 0x6e, 0x00, 0x64, 0x00,
        0xe0, 0x00, 0x71
      ];
      board.versionReceived = true;
      board.on("analog-read-0", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a command spread across multiple data packets", done => {
      const spy = sandbox.spy();
      // query firmware split across 3 packets with first packet preceeded by junk
      const incoming1 = [0x07, 0x04, 240, 121, 2, 3, 83, 0, 116, 0, 97, 0, 110, 0, 100, 0];
      const incoming2 = [97, 0, 114, 0, 100, 0, 70, 0, 105, 0, 114, 0, 109, 0];
      const incoming3 = [97, 0, 116, 0, 97, 0, 247];

      board.versionReceived = true;
      board.on("queryfirmware", spy);
      transport.emit("data", incoming1);
      transport.emit("data", incoming2);
      transport.emit("data", incoming3);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a command spread across multiple single byte transfers", done => {
      const spy = sandbox.spy();
      const incoming = [REPORT_VERSION, 0x02, 0x03];

      board.versionReceived = true;
      board.on("reportversion", spy);
      for (let i = 0; i < incoming.length; i++) {
        transport.emit("data", [incoming[i]]);
      }
      assert.equal(spy.callCount, 1);
      done();
    });
  });
});

describe("Numeric encoding/decoding and formatting", () => {

  it("must encode 32 bit signed integers", done => {
    assert.deepEqual(Board.test.encode32BitSignedInteger(5786), [26, 45, 0, 0, 0]);
    done();
  });

  it("must encode 32 bit signed integers when they are negative", done => {
    assert.deepEqual(Board.test.encode32BitSignedInteger(-5786), [26, 45, 0, 0, 8]);
    done();
  });

  it("must decode 32 bit signed integers", done => {
    assert.equal(Board.test.decode32BitSignedInteger([26, 45, 0, 0, 0]), 5786);
    done();
  });

  it("must decode 32 bit signed integers when they are negative", done => {
    assert.equal(Board.test.decode32BitSignedInteger([26, 45, 0, 0, 8]), -5786);
    done();
  });

  it("must encode custom floats", done => {
    assert.deepEqual(Board.test.encodeCustomFloat(123.456), [0, 45, 75, 28]);
    done();
  });

  it("must encode custom floats (even when they are integers)", done => {
    assert.deepEqual(Board.test.encodeCustomFloat(100), [1, 0, 0, 52]);
    done();
  });

  it("must encode custom floats when they are negative", done => {
    assert.deepEqual(Board.test.encodeCustomFloat(-7321.783), [54, 113, 62, 99]);
    done();
  });

  it("must encode custom floats when they are less than 1", done => {
    assert.deepEqual(Board.test.encodeCustomFloat(0.000325), [79, 46, 70, 5]);
    done();
  });

  it("must decode custom floats", done => {
    assert.equal(Board.test.decodeCustomFloat([110, 92, 44, 32]), 732.782);
    done();
  });

  it("must decode custom floats when they are negative", done => {
    assert.equal(Board.test.decodeCustomFloat([110, 92, 44, 96]), -732.782);
    done();
  });
});

describe("Board.encode/Board.decode", () => {

  describe("Board.encode", () => {
    it("must encode arbitrary data", done => {
      assert.deepEqual(Board.encode([0, 1, 2, 3, 4]), [0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
      done();
    });
    it("returns a fresh array", done => {
      const data = [];
      assert.notEqual(Board.encode(data), data);
      done();
    });
  });

  describe("Board.decode", () => {
    it("must decode arbitrary data", done => {
      assert.deepEqual(Board.decode([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]), [0, 1, 2, 3, 4]);
      done();
    });

    it("must fail to decode uneven data", done => {
      assert.throws(() => {
        Board.decode([0, 0, 1, 0, 2, 0, 3, 0, 4]);
      });
      done();
    });

    it("returns a fresh array", done => {
      const data = [];
      assert.notEqual(Board.decode(data), data);
      done();
    });
  });
});
