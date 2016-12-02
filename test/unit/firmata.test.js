// Test specific internals
//
var Board = firmata.Board;

var ANALOG_MAPPING_QUERY = 0x69;
var ANALOG_MAPPING_RESPONSE = 0x6A;
var ANALOG_MESSAGE = 0xE0;
var CAPABILITY_QUERY = 0x6B;
var CAPABILITY_RESPONSE = 0x6C;
var DIGITAL_MESSAGE = 0x90;
var END_SYSEX = 0xF7;
var EXTENDED_ANALOG = 0x6F;
var I2C_CONFIG = 0x78;
var I2C_REPLY = 0x77;
var I2C_REQUEST = 0x76;
var I2C_READ_MASK = 0x18;   // 0b00011000
var I2C_END_TX_MASK = 0x40; // 0b01000000
var ONEWIRE_CONFIG_REQUEST = 0x41;
var ONEWIRE_DATA = 0x73;
var ONEWIRE_DELAY_REQUEST_BIT = 0x10;
var ONEWIRE_READ_REPLY = 0x43;
var ONEWIRE_READ_REQUEST_BIT = 0x08;
var ONEWIRE_RESET_REQUEST_BIT = 0x01;
var ONEWIRE_SEARCH_ALARMS_REPLY = 0x45;
var ONEWIRE_SEARCH_ALARMS_REQUEST = 0x44;
var ONEWIRE_SEARCH_REPLY = 0x42;
var ONEWIRE_SEARCH_REQUEST = 0x40;
var ONEWIRE_WITHDATA_REQUEST_BITS = 0x3C;
var ONEWIRE_WRITE_REQUEST_BIT = 0x20;
var PIN_MODE = 0xF4;
var PIN_STATE_QUERY = 0x6D;
var PIN_STATE_RESPONSE = 0x6E;
var PING_READ = 0x75;
var PULSE_IN = 0x74;
var PULSE_OUT = 0x73;
var QUERY_FIRMWARE = 0x79;
var REPORT_ANALOG = 0xC0;
var REPORT_DIGITAL = 0xD0;
var REPORT_VERSION = 0xF9;
var SAMPLING_INTERVAL = 0x7A;
var SERVO_CONFIG = 0x70;
var SERIAL_MESSAGE = 0x60;
var SERIAL_CONFIG = 0x10;
var SERIAL_WRITE = 0x20;
var SERIAL_READ = 0x30;
var SERIAL_REPLY = 0x40;
var SERIAL_CLOSE = 0x50;
var SERIAL_FLUSH = 0x60;
var SERIAL_LISTEN = 0x70;
var START_SYSEX = 0xF0;
var STEPPER = 0x72;
var STRING_DATA = 0x71;
var SYSTEM_RESET = 0xFF;

// Used by custom sysex tests
var NON_STANDARD_REPLY = 0x11;

var sandbox = sinon.sandbox.create();

describe("Board.requestPort", function() {

  var response = {
    error: null,
    port: {
      comName: null
    },
  };

  beforeEach(function() {
    sandbox.stub(com, "list", function(callback) {
      process.nextTick(function() {
        callback(response.error, [response.port]);
      });
    });
  });

  afterEach(function() {
    sandbox.restore();
    response.error = null;
    response.port.comName = null;
  });

  it("can identify an acceptable port", function(done) {
    response.port.comName = "/dev/usb.whatever";
    assert.equal(Board.isAcceptablePort(response.port), true);

    response.port.comName = "/dev/ttyACM0";
    assert.equal(Board.isAcceptablePort(response.port), true);

    response.port.comName = "COM0";
    assert.equal(Board.isAcceptablePort(response.port), true);

    done();
  });

  it("can identify an unacceptable port", function(done) {
    response.port.comName = "/dev/tty.Bluetooth-Incoming-Port";
    assert.equal(Board.isAcceptablePort(response.port), false);

    response.port.comName = "/dev/someotherthing";
    assert.equal(Board.isAcceptablePort(response.port), false);

    done();
  });

  it("invokes callback with an acceptable port: usb", function(done) {
    response.port.comName = "/dev/usb.whatever";

    Board.requestPort(function(error, port) {
      assert.equal(port, response.port);
      done();
    });
  });

  it("invokes callback with an acceptable port: acm", function(done) {
    response.port.comName = "/dev/ttyACM0";

    Board.requestPort(function(error, port) {
      assert.equal(port, response.port);
      done();
    });
  });

  it("invokes callback with an acceptable port: com", function(done) {
    response.port.comName = "COM0";

    Board.requestPort(function(error, port) {
      assert.equal(port, response.port);
      done();
    });
  });

  it("doesn't call callback with an unacceptable port: Bluetooth-Incoming-Port", function(done) {
    response.port.comName = "/dev/tty.Bluetooth-Incoming-Port";

    Board.requestPort(function(error, port) {
      assert.equal(port, null);
      assert.equal(error.message, "No Acceptable Port Found");
      done();
    });
  });

});


describe("Board: data handling", function() {

  var SerialPort;
  var transportWrite;
  var transport;
  var initCallback;
  var board;

  beforeEach(function() {
    initCallback = sandbox.spy();
    SerialPort = sandbox.spy(com, "SerialPort");
    transportWrite = sandbox.spy(SerialPort.prototype, "write");
    transport = new SerialPort("/path/to/fake/usb");
    board = new Board(transport, initCallback);
  });

  afterEach(function() {
    Board.test.i2cActive.clear();
    sandbox.restore();
  });

  describe("MIDI_RESPONSE", function() {
    describe("REPORT_VERSION", function() {

      it("must ignore unexpected adc data until REPORT_VERSION", function(done) {

        var parts = [
          fixtures.unexpected.adc.slice(0, 200),
          fixtures.unexpected.adc.slice(200, 400),
          fixtures.unexpected.adc.slice(400, 513),
        ];

        var am = sandbox.spy(Board.MIDI_RESPONSE, ANALOG_MESSAGE);
        var rv = sandbox.spy(Board.MIDI_RESPONSE, REPORT_VERSION);

        assert.equal(am.callCount, 0);
        assert.equal(rv.callCount, 0);
        assert.equal(board.currentBuffer.length, 0);

        for (var i = 0; i < parts[0].length; i++) {
          transport.emit("data", [parts[0][i]]);
        }

        // There are several I2C_REPLY messages in this data,
        // none should trigger the I2C_REPLY handler.
        assert.equal(am.callCount, 0);
        assert.equal(rv.callCount, 0);


        // The REPORT_VERSION byte is at index 38
        var reportVersionAtByteIndex = 38;
        // We won't know it's been seen until all three
        // bytes have been read and processed.
        var reportVersionCalledAtIndex = -1;
        var isVersioned = false;
        // This contains a valid REPORT_VERSION message
        //
        for (var j = 0; j < parts[1].length; j++) {
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


        for (var k = 0; k < parts[2].length; k++) {
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
        assert.equal(board.currentBuffer.length, 0);

        // Another complete I2C_REPLY arrives...
        transport.emit("data", [0xe0, 0x7f, 0x03]);

        assert.equal(am.callCount, 2);
        assert.equal(board.currentBuffer.length, 0);

        done();
      });

      it("must ignore unexpected i2c data until REPORT_VERSION", function(done) {

        var parts = [
          fixtures.unexpected.i2c.slice(0, 200),
          fixtures.unexpected.i2c.slice(200, 400),
          fixtures.unexpected.i2c.slice(400, 697),
        ];

        var ir = sandbox.spy(Board.SYSEX_RESPONSE, I2C_REPLY);
        var rv = sandbox.spy(Board.MIDI_RESPONSE, REPORT_VERSION);

        assert.equal(ir.callCount, 0);
        assert.equal(rv.callCount, 0);
        assert.equal(board.currentBuffer.length, 0);

        for (var i = 0; i < parts[0].length; i++) {
          transport.emit("data", [parts[0][i]]);
        }

        // There are several I2C_REPLY messages in this data,
        // none should trigger the I2C_REPLY handler.
        assert.equal(ir.callCount, 0);
        assert.equal(rv.callCount, 0);


        // The REPORT_VERSION byte is at index 194
        var reportVersionAtByteIndex = 194;
        // We won't know it's been seen until all three
        // bytes have been read and processed.
        var reportVersionCalledAtIndex = -1;
        var isVersioned = false;
        // This contains a valid REPORT_VERSION message
        //
        for (var j = 0; j < parts[1].length; j++) {
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


        for (var k = 0; k < parts[2].length; k++) {
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
        assert.equal(board.currentBuffer.length, 0);

        // Another complete I2C_REPLY arrives...
        transport.emit("data", [0xf0, 0x77, 0x0a, 0x00, 0x00, 0x00, 0x06, 0x00, 0x5e, 0x00, 0x05, 0x00, 0x48, 0x01, 0x05, 0x00, 0x1b, 0x01, 0x05, 0x00, 0x3f, 0x01, 0x04, 0x00, 0x16, 0x00, 0x05, 0x00, 0x42, 0x01, 0xf7]);

        assert.equal(ir.callCount, 2);
        assert.equal(board.currentBuffer.length, 0);

        done();
      });

      it("must ignore unexpected serial data until REPORT_VERSION", function(done) {

        var parts = [
          fixtures.unexpected.serial.slice(0, 200),
          fixtures.unexpected.serial.slice(200, 400),
          fixtures.unexpected.serial.slice(400, 697),
        ];

        var sr = sandbox.spy(Board.SYSEX_RESPONSE, SERIAL_MESSAGE);
        var rv = sandbox.spy(Board.MIDI_RESPONSE, REPORT_VERSION);

        assert.equal(sr.callCount, 0);
        assert.equal(rv.callCount, 0);
        assert.equal(board.currentBuffer.length, 0);

        for (var i = 0; i < parts[0].length; i++) {
          transport.emit("data", [parts[0][i]]);
        }

        // There are several SERIAL_MESSAGE messages in this data,
        // none should trigger the SERIAL_MESSAGE handler.
        assert.equal(sr.callCount, 0);
        assert.equal(rv.callCount, 0);


        // The REPORT_VERSION byte is at index 86
        var reportVersionAtByteIndex = 86;
        // We won't know it's been seen until all three
        // bytes have been read and processed.
        var reportVersionCalledAtIndex = -1;
        var isVersioned = false;
        // This contains a valid REPORT_VERSION message
        //
        for (var j = 0; j < parts[1].length; j++) {
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


        for (var k = 0; k < parts[2].length; k++) {
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
        assert.equal(board.currentBuffer.length, 0);

        // Another complete SERIAL_MESSAGE arrives...
        transport.emit("data", [0xf0, 0x60, 0x48, 0x19, 0x01, 0xf7]);

        assert.equal(sr.callCount, 2);
        assert.equal(board.currentBuffer.length, 0);

        done();
      });
    });
  });

  describe("SYSEX_RESPONSE", function() {
    it("QUERY_FIRMWARE", function(done) {
      var qf = sandbox.spy(Board.SYSEX_RESPONSE, QUERY_FIRMWARE);

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

    it("CAPABILITY_RESPONSE", function(done) {
      var cr = sandbox.spy(Board.SYSEX_RESPONSE, CAPABILITY_RESPONSE);

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

    it("PIN_STATE_RESPONSE", function(done) {
      var cr = sandbox.spy(Board.SYSEX_RESPONSE, PIN_STATE_RESPONSE);

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

      assert.equal(cr.callCount, 4);

      done();
    });

    it("ANALOG_MAPPING_RESPONSE", function(done) {
      var amr = sandbox.spy(Board.SYSEX_RESPONSE, ANALOG_MAPPING_RESPONSE);

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

describe("Board: initialization", function() {
  it("Always returns a Board instance", function(done) {
    var boards = [
      new Board("/path/to/fake1"),
      Board("/path/to/fake2"),
    ];

    boards.forEach(function(board) {
      assert.equal(board instanceof Board, true);
    });

    done();
  });

  it("Is a subclass of EventEmitter", function(done) {

    var boards = [
      new Board("/path/to/fake1"),
      Board("/path/to/fake2"),
    ];

    boards.forEach(function(board) {
      assert.equal(board instanceof Emitter, true);
    });
    done();
  });
});

describe("Board: lifecycle", function() {

  var SerialPort = sandbox.spy(com, "SerialPort");
  var transportWrite = sandbox.spy(SerialPort.prototype, "write");
  var initCallback = sandbox.spy(function(error) {
    assert.equal(typeof error, "undefined");
  });
  var initNoop = sandbox.spy();

  var transport = new SerialPort("/path/to/fake/usb");
  var board = new Board(transport, initCallback);


  beforeEach(function() {
    Board.test.i2cActive.clear();

    transport.spy = sandbox.spy(com, "SerialPort");

    board._events.length = 0;
  });

  afterEach(function() {
    Board.SYSEX_RESPONSE[NON_STANDARD_REPLY] = undefined;
    sandbox.restore();
  });

  it("uses serialport defaults", function(done) {
    var a = new Board("/path/to/fake/usb1", initNoop);
    var b = new Board("/path/to/fake/usb2", initNoop);

    assert.equal(transport.spy.getCall(0).args[0], "/path/to/fake/usb1");
    assert.deepEqual(transport.spy.getCall(0).args[1], { baudRate: 57600, bufferSize: 256 });

    assert.equal(transport.spy.getCall(1).args[0], "/path/to/fake/usb2");
    assert.deepEqual(transport.spy.getCall(1).args[1], { baudRate: 57600, bufferSize: 256 });

    done();
  });

  it("uses default baud rate and buffer size", function(done) {
    var port = "fake port";
    var board = new Board(port, function(err) {});

    assert.deepEqual(
      transport.spy.args, [ [ "fake port", { baudRate: 57600, bufferSize: 256 } ] ]
    );

    done();
  });

  it("overrides baud rate and buffer size", function(done) {
    var port = "fake port";
    var opt = {
      reportVersionTimeout: 1,
      serialport: {
        baudRate: 5,
        bufferSize: 10
      }
    };
    var board = new Board(port, opt, function(err) {});

    assert.deepEqual(
      transport.spy.args, [ [ "fake port", { baudRate: 5, bufferSize: 10 } ] ]
    );

    done();
  });

  it("has a name", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);

    assert.equal(board.name, "Firmata");
    done();
  });

  // Legacy
  it("emits 'connect' event when transport emits 'open'.", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);

    board.on("connect", function() {
      done();
    });

    transport.emit("open");
  });

  it("forwards 'open' events from transport.", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);

    board.on("open", function() {
      done();
    });

    transport.emit("open");
  });

  it("emits 'ready' after handshakes complete (skipCapabilities)", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, {skipCapabilities: true}, initNoop);
    var oc = 0;

    board.on("open", function() {
      assert.ok(true);
      oc++;
    });

    board.on("connect", function() {
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

  it("emits 'ready' after handshakes complete", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);
    var oc = 0;

    board.on("open", function() {
      assert.ok(true);
      oc++;
    });

    board.on("connect", function() {
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

  it("reports errors during connect/ready", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, function(err) {
      assert.equal("test error", err);
      done();
    });

    transport.emit("error", "test error");
  });

  it("forwards 'close' events from transport", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);

    board.on("close", done);

    transport.emit("close");
  });

  it("forwards 'disconnect' events from transport", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);

    board.on("disconnect", done);

    transport.emit("disconnect");
  });

  it("forwards 'error' event from transport", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, initNoop);

    board.on("error", done);

    board.isReady = true;
    transport.emit("error");
  });

  it("sends 'REPORT_VERSION' and 'QUERY_FIRMWARE' if it hasnt received the version within the timeout", function(done) {
    this.timeout(50000);
    var transport = new SerialPort("/path/to/fake/usb");
    var opt = {
      reportVersionTimeout: 1
    };
    var board = new Board(transport, opt, initNoop);

    // rcheck for report version
    transport.once("write", function(data) {
      assert.deepEqual(data, [REPORT_VERSION]);
      // check for query firmware
      transport.once("write", function(data) {
        assert.deepEqual(data, [240, 121, 247]);
        done();
      });
    });
  });

  it("receives the version on startup", function(done) {
    //"send" report version command back from arduino
    transport.emit("data", [REPORT_VERSION]);
    transport.emit("data", [0x02]);

    //subscribe to the "data" event to capture the event
    transport.once("data", function(buffer) {
      assert.equal(board.version.major, 2);
      assert.equal(board.version.minor, 3);
      done();
    });

    //send the last byte of command to get "data" event to fire when the report version function is called
    transport.emit("data", [0x03]);
  });

  it("receives the firmware after the version", function(done) {
    board.once("queryfirmware", function() {
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

  it("Optionally call setSamplingInterval after queryfirmware", function(done) {
    var spy = sandbox.spy(Board.prototype, "setSamplingInterval");
    var transport = new SerialPort("/path/to/fake/usb");
    var options = {
      skipCapabilities: true,
      samplingInterval: 100
    };

    var board = new Board(transport, options, function(err) {
      assert.deepEqual(transport.lastWrite, [ 240, 122, 100, 0, 247 ]);
      assert.equal(spy.callCount, 1);
      assert.ok(spy.calledWith(100));

      spy.restore();
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

  it("Does not call setSamplingInterval after queryfirmware by default", function(done) {
    var spy = sandbox.spy(Board.prototype, "setSamplingInterval");
    var transport = new SerialPort("/path/to/fake/usb");
    var options = {
      skipCapabilities: true,
    };

    var board = new Board(transport, options, function() {
      assert.equal(spy.callCount, 0);
      spy.restore();
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

  it("gets the capabilities after the firmware", function(done) {
    //[START_SYSEX, CAPABILITY_QUERY, END_SYSEX]
    assert.deepEqual(transport.lastWrite, [START_SYSEX, CAPABILITY_QUERY, END_SYSEX]);

    //report back mock capabilities
    //taken from boards.h for arduino uno
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [CAPABILITY_RESPONSE]);

    for (var i = 0; i < 20; i++) {
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
      if ([3, 5, 6, 10, 11].indexOf(i) > -1) {
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
    transport.once("data", function() {
      assert.equal(board.pins.length, 20);
      board.pins.forEach(function(pin, index) {
        if (index >= 2 && index <= 19) {

          pin.supportedModes.indexOf(0).should.not.equal(-1);
          pin.supportedModes.indexOf(1).should.not.equal(-1);
        } else {
          assert.equal(pin.supportedModes.length, 0);
        }
        if (index >= 14 && index <= 19) {
          pin.supportedModes.indexOf(0x02).should.not.equal(-1);
          assert.equal(pin.analogResolution, 10);
        } else {
          assert.equal(pin.supportedModes.indexOf(0x02), -1);
        }
        if ([3, 5, 6, 10, 11].indexOf(index) > -1) {
          pin.supportedModes.indexOf(0x03).should.not.equal(-1);
          assert.equal(pin.pwmResolution, 8);
        } else {
          assert.equal(pin.supportedModes.indexOf(0x03), -1);
        }
        if (index >= 2) {
          pin.supportedModes.indexOf(0x04).should.not.equal(-1);
          assert.equal(pin.servoResolution, 14);
        }
      });
      done();
    });
    //end the sysex message
    transport.emit("data", [END_SYSEX]);
  });

  it("capabilities response is an idempotent operation", function(done) {

    var count = 0;
    var i = 0;

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


  it("querys analog mappings after capabilities", function(done) {
    //[START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]
    assert.deepEqual(transport.lastWrite, [START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [ANALOG_MAPPING_RESPONSE]);
    for (var i = 0; i < 20; i++) {
      if (i >= 14 && i < 20) {
        transport.emit("data", [i - 14]);
      } else {
        transport.emit("data", [127]);
      }
    }

    transport.once("data", function() {
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

  it("must be ready", function() {
    assert.equal(board.isReady, true);
    assert.equal(initCallback.callCount, 1);
  });

  it("allows setting a valid sampling interval", function(done) {
    var spy = sandbox.spy(board.transport, "write");

    // Valid sampling interval
    board.setSamplingInterval(20);
    assert.ok(Buffer([0xf0, 0x7a, 0x14, 0x00, 0xf7]).equals(spy.lastCall.args[0]));

    // Invalid sampling interval is constrained to a valid interval
    // > 65535 => 65535
    board.setSamplingInterval(65540);
    assert.ok(Buffer([0xf0, 0x7a, 0x7f, 0x7f, 0xf7]).equals(spy.lastCall.args[0]));

    // Invalid sampling interval is constrained to a valid interval
    // < 10 => 10
    board.setSamplingInterval(0);
    assert.ok(Buffer([0xf0, 0x7a, 0x0a, 0x00, 0xf7]).equals(spy.lastCall.args[0]));

    spy.restore();
    done();
  });

  it("must be able to set pin mode on digital pin (INPUT)", function(done) {
    board.pinMode(2, board.MODES.INPUT);
    assert.equal(transport.lastWrite[0], PIN_MODE);
    assert.equal(transport.lastWrite[1], 2);
    assert.equal(transport.lastWrite[2], board.MODES.INPUT);
    assert.equal(board.pins[2].mode, board.MODES.INPUT);
    done();
  });

  it("must be able to read value of digital pin (INPUT)", function(done) {
    var counter = 0;
    var order = [1, 0, 1, 0];
    board.digitalRead(2, function(value) {
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
    assert.deepEqual(transport.lastWrite, [ 208, 1 ]);

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

  it("must be able to set pin mode on digital pin (PULLUP)", function(done) {
    board.pinMode(3, board.MODES.PULLUP);
    assert.equal(transport.lastWrite[0], PIN_MODE);
    assert.equal(transport.lastWrite[1], 3);
    assert.equal(transport.lastWrite[2], board.MODES.PULLUP);
    assert.equal(board.pins[3].mode, board.MODES.PULLUP);
    done();
  });

  it("must be able to read value of digital pin (PULLUP)", function(done) {
    var counter = 0;
    var order = [1, 0, 1, 0];
    board.pinMode(2, board.MODES.PULLUP);
    board.digitalRead(2, function(value) {
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
    assert.deepEqual(transport.lastWrite, [ 208, 1 ]);

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

  it("must be able to set mode on analog pins", function(done) {
    board.pinMode(board.analogPins[0], board.MODES.INPUT);
    assert.equal(transport.lastWrite[0], PIN_MODE);
    assert.equal(transport.lastWrite[1], board.analogPins[0]);
    assert.equal(transport.lastWrite[2], board.MODES.INPUT);
    done();
  });

  it("must be able to read value of analog pin", function(done) {
    var counter = 0;
    var order = [1023, 0, 1023, 0];
    board.analogRead(1, function(value) {
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
    assert.deepEqual(transport.lastWrite, [ 193, 1 ]);

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


  it("must be able to read value of analog pin on a board that skipped capabilities check", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, {skipCapabilities: true, analogPins: [14,15,16,17,18,19]}, initNoop);

    board.on("ready", function() {
      var counter = 0;
      var order = [1023, 0, 1023, 0];
      board.analogRead(1, function(value) {
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
      assert.deepEqual(transport.lastWrite, [ 193, 1 ]);

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

  it("must be able to write a value to a digital output", function(done) {

    var write = sandbox.stub(SerialPort.prototype, "write");
    var expect = [
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

    for (var i = 0; i < board.pins.length; i++) {
      board.digitalWrite(i, board.HIGH);
      assert.deepEqual(Array.from(write.lastCall.args[0]), expect[i]);

      board.digitalWrite(i, board.LOW);
    }
    done();
  });

  it("must be able to track digital writes via ports property", function(done) {
    for (var i = 0; i < board.pins.length; i++) {
      board.pins[i].mode = board.MODES.UNKNOWN;
    }

    var write = sandbox.stub(SerialPort.prototype, "write");
    var expecting = [
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

    for (var j = 0; j < board.pins.length; j++) {
      var port = j >> 3;
      var expect = expecting[j];

      board.digitalWrite(j, board.HIGH);

      assert.equal(board.ports[port], expect);

      board.digitalWrite(j, board.LOW);
    }
    done();
  });

  it("must be able to write and read to a digital port without garbling state", function(done) {
    /* This test will change the value of port 1 as follows:

      0b00000001
      0b00000000
      0b00000001
      0b00000101
      0b00000000
      0b00000101
      0b00000001
    */

    var write = sandbox.stub(SerialPort.prototype, "write");
    var state = 0;
    var calls = 0;
    var expecting = [
      // 10 is high, 9 is low, 8 is high
      "101",
      // 10 is low, 9 is low, 8 is low
      "0",
      // 10 is high, 9 is low, 8 is (still) low
      "100",
      // 10 is low, 9 is low, 8 is high
      "1"
    ];

    for (var i = 0; i < board.pins.length; i++) {
      board.pins[i].mode = board.MODES.UNKNOWN;
    }

    for (var j = 0; j < board.ports.length; j++) {
      board.ports[j] = 0;
    }

    // No Pins are high on this port
    assert.equal(board.ports[1].toString(2), "0");


    board.pinMode(8, board.MODES.OUTPUT);
    board.pinMode(10, board.MODES.INPUT);
    board.digitalRead(10, function(data) {
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

  it("must be able to write a value to a digital output to a board that skipped capabilities check", function(done) {
    var transport = new SerialPort("/path/to/fake/usb");
    var board = new Board(transport, {skipCapabilities: true}, initNoop);

    board.on("ready", function() {
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

  it("must be able to write a value to an analog pin being used as a digital output", function(done) {
    board.ports[2] = 0;

    // `DIGITAL_MESSAGE | 2` => Digital Message on Port 2
    //
    board.digitalWrite(19, board.HIGH);
    assert.deepEqual(transport.lastWrite, [DIGITAL_MESSAGE | 2, 8, 0]);

    board.digitalWrite(19, board.LOW);
    assert.deepEqual(transport.lastWrite, [DIGITAL_MESSAGE | 2, 0, 0]);

    done();
  });

  it("must be able to write a value to a analog output", function(done) {
    board.analogWrite(board.analogPins[1], 1023);
    assert.deepEqual(transport.lastWrite, [ANALOG_MESSAGE | board.analogPins[1], 127, 7]);

    board.analogWrite(board.analogPins[1], 0);
    assert.deepEqual(transport.lastWrite, [ANALOG_MESSAGE | board.analogPins[1], 0, 0]);
    done();
  });

  it("must be able to write a value to an extended analog output", function(done) {
    var length = board.pins.length;

    board.pins[46] = {
      supportedModes: [0, 1, 4],
      mode: 4,
      value: 0,
      report: 1,
      analogChannel: 127
    };

    board.analogWrite(46, 180);
    assert.deepEqual(transport.lastWrite, [START_SYSEX, EXTENDED_ANALOG, 46, 52, 1, END_SYSEX]);

    board.analogWrite(46, 0);
    assert.deepEqual(transport.lastWrite, [START_SYSEX, EXTENDED_ANALOG, 46, 0, 0, END_SYSEX]);

    // Restore to original length
    board.pins.length = length;

    done();
  });


  it("must be able to send a string", function(done) {
    var bytes = new Buffer("test string", "utf8");
    var length = bytes.length;
    board.sendString(bytes);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], STRING_DATA);
    for (var i = 0; i < length; i++) {
      assert.equal(transport.lastWrite[i * 2 + 2], bytes[i] & 0x7F);
      assert.equal(transport.lastWrite[i * 2 + 3], (bytes[i + 1] >> 7) & 0x7F);
    }
    assert.equal(transport.lastWrite[length * 2 + 2], 0);
    assert.equal(transport.lastWrite[length * 2 + 3], 0);
    assert.equal(transport.lastWrite[length * 2 + 4], END_SYSEX);
    done();
  });
  it("must emit a string event", function(done) {
    board.on("string", function(string) {
      assert.equal(string, "test string");
      done();
    });
    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [STRING_DATA]);
    var bytes = new Buffer("test string", "utf8");
    Array.prototype.forEach.call(bytes, function(value, index) {
      transport.emit("data", [value]);
    });
    transport.emit("data", [END_SYSEX]);
  });

  it("can query pin state", function(done) {
    board.queryPinState(2, function() {
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

  it("must ignore invalid query firmware data", function(done) {
    board.once("queryfirmware", function() {
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

  it("cannot pingRead without PingFirmata", function(done) {
    assert.throws(function() {
      board.pingRead({
        pin: 3
      });
    });

    done();
  });

  it("can send a pingRead without a timeout and without a pulse out", function(done) {
    board.pins[3].supportedModes.push(PING_READ);
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      timeout: 1000000
    }, function(duration) {
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

  it("can send a pingRead with a timeout and a pulse out", function(done) {
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      pulseOut: 5,
      timeout: 1000000
    }, function(duration) {
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
  it("can send a pingRead with a pulse out and without a timeout ", function(done) {
    board.pingRead({
      pin: 3,
      value: board.HIGH,
      pulseOut: 5
    }, function(duration) {
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

  it("can send a stepper config for a driver configuration", function(done) {
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

  it("can send a stepper config for a two wire configuration", function(done) {
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

  it("can send a stepper config for a four wire configuration", function(done) {
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

  it("can send a stepper move without acceleration or deceleration", function(done) {
    board.stepperStep(2, board.STEPPER.DIRECTION.CCW, 10000, 2000, function(complete) {
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

  it("can send a stepper move with acceleration and deceleration", function(done) {
    board.stepperStep(3, board.STEPPER.DIRECTION.CCW, 10000, 2000, 3000, 8000, function(complete) {
      assert.equal(complete, true);
      done();
    });

    var message = [START_SYSEX, STEPPER, 1, 3, board.STEPPER.DIRECTION.CCW, 10000 & 0x7F, (10000 >> 7) & 0x7F, (10000 >> 14) & 0x7F, 2000 & 0x7F, (2000 >> 7) & 0x7F, 3000 & 0x7F, (3000 >> 7) & 0x7F, 8000 & 0x7F, (8000 >> 7) & 0x7F, END_SYSEX];
    assert.deepEqual(transport.lastWrite, message);

    transport.emit("data", [START_SYSEX]);
    transport.emit("data", [STEPPER]);
    transport.emit("data", [3]);
    transport.emit("data", [END_SYSEX]);
  });
  it("must be able to send a 1-wire config with parasitic power enabled", function(done) {
    board.sendOneWireConfig(1, true);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_CONFIG_REQUEST);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[4], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });
  it("must be able to send a 1-wire config with parasitic power disabled", function(done) {
    board.sendOneWireConfig(1, false);
    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_CONFIG_REQUEST);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[4], 0x00);
    assert.equal(transport.lastWrite[5], END_SYSEX);
    done();
  });
  it("must be able to send a 1-wire search request and recieve a reply", function(done) {
    board.sendOneWireSearch(1, function(error, devices) {
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
  it("must be able to send a 1-wire search alarm request and recieve a reply", function(done) {
    board.sendOneWireAlarmsSearch(1, function(error, devices) {
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
  it("must be able to send a 1-wire reset request", function(done) {
    board.sendOneWireReset(1);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_RESET_REQUEST_BIT);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    done();
  });
  it("must be able to send a 1-wire delay request", function(done) {
    var delay = 1000;

    board.sendOneWireDelay(1, delay);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    var request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));
    var sentDelay = request[12] | (request[13] << 8) | (request[14] << 12) | request[15] << 24;
    assert.equal(sentDelay, delay);

    done();
  });
  it("must be able to send a 1-wire write request", function(done) {
    var device = [40, 219, 239, 33, 5, 0, 0, 93];
    var data = 0x33;

    board.sendOneWireWrite(1, device, data);

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    var request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));

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
  it("must be able to send a 1-wire write and read request and recieve a reply", function(done) {
    var device = [40, 219, 239, 33, 5, 0, 0, 93];
    var data = 0x33;
    var output = [ONEWIRE_RESET_REQUEST_BIT, 0x02];

    board.sendOneWireWriteAndRead(1, device, data, 2, function(error, receieved) {
      receieved.should.eql(output);

      done();
    });

    assert.equal(transport.lastWrite[0], START_SYSEX);
    assert.equal(transport.lastWrite[1], PULSE_OUT);
    assert.equal(transport.lastWrite[2], ONEWIRE_WITHDATA_REQUEST_BITS);
    assert.equal(transport.lastWrite[3], ONEWIRE_RESET_REQUEST_BIT);

    // decode delay from request
    var request = Encoder7Bit.from7BitArray(transport.lastWrite.slice(4, transport.lastWrite.length - 1));

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

    var dataSentFromBoard = [];

    // respond with the same correlation id
    dataSentFromBoard[0] = request[10];
    dataSentFromBoard[1] = request[11];

    // data "read" from the 1-wire device
    dataSentFromBoard[2] = output[0];
    dataSentFromBoard[3] = output[1];

    transport.emit("data", [START_SYSEX, PULSE_OUT, ONEWIRE_READ_REPLY, ONEWIRE_RESET_REQUEST_BIT].concat(Encoder7Bit.to7BitArray(dataSentFromBoard)).concat([END_SYSEX]));
  });

  describe("servo", function() {
    it("can configure a servo pwm range", function(done) {
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

    it("can configure a servo pwm range, with object", function(done) {
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

    it("will throw if servoConfig is missing any parameters", function(done) {

      assert.throws(function() {
        board.servoConfig();
      });

      assert.throws(function() {
        board.servoConfig(3, 1000);
      });

      assert.throws(function() {
        board.servoConfig({
          min: 1000,
          max: 2000,
        });
      });

      assert.throws(function() {
        board.servoConfig({
          pin: 3,
          max: 2000,
        });
      });

      assert.throws(function() {
        board.servoConfig({
          pin: 3,
          min: 1000,
        });
      });

      assert.throws(function() {
        board.servoConfig({});
      });

      done();
    });
  });

  describe("I2C", function() {

    it("throws if i2c not enabled", function(done) {

      assert.throws(function() {
        board.i2cRead(1, 1, initNoop);
      });
      assert.throws(function() {
        board.i2cReadOnce(1, 1, initNoop);
      });
      assert.throws(function() {
        board.i2cWrite(1, [1, 2, 3]);
      });
      assert.throws(function() {
        board.i2cWriteReg(1, 1, 1);
      });

      done();
    });

    it("must be able to send an i2c config (empty)", function(done) {
      board.i2cConfig();
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_CONFIG, 0, 0, END_SYSEX]);
      done();
    });

    it("must be able to send an i2c config (number)", function(done) {
      board.i2cConfig(1);
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_CONFIG, 1 & 0xFF, (1 >> 8) & 0xFF, END_SYSEX]);
      done();
    });

    it("must be able to send an i2c config (object with delay property)", function(done) {
      board.i2cConfig({ delay: 1 });
      assert.deepEqual(transport.lastWrite, [START_SYSEX, I2C_CONFIG, 1 & 0xFF, (1 >> 8) & 0xFF, END_SYSEX]);
      done();
    });

    it("must be able to send an i2c request", function(done) {
      board.i2cConfig(1);
      board.sendI2CWriteRequest(0x68, [1, 2, 3]);
      var request = [START_SYSEX, I2C_REQUEST, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F, 2 & 0x7F, (2 >> 7) & 0x7F, 3 & 0x7F, (3 >> 7) & 0x7F, END_SYSEX];
      assert.deepEqual(transport.lastWrite, request);
      done();
    });

    it("must be able to receive an i2c reply", function(done) {
      var handler = sandbox.spy(function() {});
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
    it("does not create default settings for an i2c peripheral, when call to i2cConfig does not include address", function(done) {
      board.i2cConfig();

      assert.deepEqual(Board.test.i2cActive.get(board), { delay: 0 });

      done();
    });

    it("creates default settings for an i2c peripheral, with call to i2cConfig that includes address", function(done) {
      board.i2cConfig({
        address: 0x00
      });

      assert.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: true,
        },
        delay: 0,
      });

      done();
    });

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cWrite)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cWrite(0x00, [0x01, 0x02]);
      board.i2cWrite(0x05, [0x06, 0x07]);

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cWriteReg)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cWriteReg(0x00, 0x01, 0x02);
      board.i2cWriteReg(0x05, 0x06, 0x07);

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cRead w/ Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cRead(0x00, 0x01, 1, initNoop);
      board.i2cRead(0x05, 0x06, 1, initNoop);

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cRead w/o Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cRead(0x00, 1, initNoop);
      board.i2cRead(0x05, 1, initNoop);

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

    it("can stop a continuous read with i2cStop(address)", function(done) {
      board.i2cConfig();

      Object.keys(board._events).forEach(function(event) {
        if (event.startsWith("I2C-reply-")) {
          board.removeAllListeners(event);
        }
      });
      var removeAllListeners = sandbox.spy(board, "removeAllListeners");


      board.i2cRead(0x00, 1, initNoop);
      board.i2cStop(0x00);

      assert.equal(transport.lastWrite[2], 0x00);
      assert.equal(transport.lastWrite[3], board.I2C_MODES.STOP_READING << 3);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      assert.equal(removeAllListeners.callCount, 1);
      done();
    });

    it("can stop a continuous read with i2cStop({address})", function(done) {
      board.i2cConfig();

      Object.keys(board._events).forEach(function(event) {
        if (event.startsWith("I2C-reply-")) {
          board.removeAllListeners(event);
        }
      });
      var removeAllListeners = sandbox.spy(board, "removeAllListeners");

      board.i2cRead(0x00, 1, initNoop);
      board.i2cStop({ address: 0x00 });

      assert.equal(transport.lastWrite[2], 0x00);
      assert.equal(transport.lastWrite[3], board.I2C_MODES.STOP_READING << 3);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      assert.equal(removeAllListeners.callCount, 1);
      done();
    });


    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cReadOnce w/ Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cReadOnce(0x00, 0x01, 1, initNoop);
      board.i2cReadOnce(0x05, 0x06, 1, initNoop);

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

    it("creates default settings for an i2c peripheral, without call to i2cConfig for that peripheral (i2cReadOnce w/o Register)", function(done) {
      // This has to be called no matter what,
      // but it might be the case that it's called once in a program,
      // where there are several different i2c peripherals.
      board.i2cConfig();

      board.i2cReadOnce(0x00, 1, initNoop);
      board.i2cReadOnce(0x05, 1, initNoop);

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

    it("can store arbitrary settings for an i2c peripheral via i2cConfig", function(done) {
      board.i2cConfig({
        address: 0x00,
        settings: {
          whatever: true,
        }
      });

      assert.deepEqual(Board.test.i2cActive.get(board), {
        delay: 0,
        0: {
          stopTX: true,
          whatever: true,
        }
      });

      done();
    });

    it("allows stored i2c peripheral settings to be reconfigured via i2cConfig", function(done) {
      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: false,
        }
      });

      assert.deepEqual(Board.test.i2cActive.get(board), {
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

      assert.deepEqual(Board.test.i2cActive.get(board), {
        delay: 0,
        0: {
          stopTX: true,
        }
      });

      done();
    });

    it("allows an i2c peripheral's stopTX to be overridden", function(done) {
      // var spy = sandbox.spy(board.transport, "write");
      var mask = 0x48; // 01001000

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: true,
        }
      });

      board.i2cReadOnce(0x00, 0x01, 1, initNoop);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 0, 8, 1, 0, 1, 0, 247 ]);

      board.i2cConfig({
        address: 0x00,
        settings: {
          stopTX: false,
        }
      });

      assert.deepEqual(Board.test.i2cActive.get(board), {
        0: {
          stopTX: false,
        },
        delay: 0,
      });

      board.i2cReadOnce(0x00, 0x01, 1, initNoop);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 0, 72, 1, 0, 1, 0, 247 ]);

      board.i2cRead(0x00, 0x01, 1, initNoop);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 0, 80, 1, 0, 1, 0, 247 ]);

      done();
    });

    it("has an i2cWrite method, that writes a data array", function(done) {
      var spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, [1, 2]);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 83, 0, 1, 0, 2, 0, 247 ]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a byte", function(done) {
      var spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 1);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 83, 0, 1, 0, 247 ]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a data array to a register", function(done) {
      var spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, [1, 2]);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 83, 0, 50, 1, 1, 0, 2, 0, 247 ]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWrite method, that writes a data byte to a register", function(done) {
      var spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, 1);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 83, 0, 50, 1, 1, 0, 247 ]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cWriteReg method, that writes a data byte to a register", function(done) {
      var spy = sandbox.spy(transport, "write");

      board.i2cConfig(0);
      board.i2cWrite(0x53, 0xB2, 1);

      assert.deepEqual(transport.lastWrite, [ 240, 118, 83, 0, 50, 1, 1, 0, 247 ]);
      assert.equal(spy.callCount, 2);
      spy.restore();
      done();
    });

    it("has an i2cRead method that reads continuously", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0x04, handler);

      for (var i = 0; i < 5; i++) {
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

    it("has an i2cRead method that reads a register continuously", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0xB2, 0x04, handler);

      for (var i = 0; i < 5; i++) {
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


    it("has an i2cRead method that reads continuously", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cRead(0x53, 0x04, handler);

      for (var i = 0; i < 5; i++) {
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

    it("has an i2cReadOnce method that reads a register once", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cReadOnce(0x53, 0xB2, 0x04, handler);

      // Emit data enough times to potentially break it.
      for (var i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      assert.equal(handler.callCount, 1);
      assert.equal(handler.getCall(0).args[0].length, 4);
      done();
    });

    it("has an i2cReadOnce method that reads a register once", function(done) {
      var handler = sandbox.spy(function() {});

      board.i2cConfig(0);
      board.i2cReadOnce(0x53, 0xB2, 0x04, handler);

      // Emit data enough times to potentially break it.
      for (var i = 0; i < 5; i++) {
        transport.emit("data", [
          START_SYSEX, I2C_REPLY, 83, 0, 50, 1, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
        ]);
      }

      assert.equal(handler.callCount, 1);
      assert.equal(handler.getCall(0).args[0].length, 4);
      done();
    });
  });

  describe("serial", function() {

    it("has a SERIAL_MODES property", function(done) {

      assert.deepEqual(board.SERIAL_MODES, {
        CONTINUOUS_READ: 0x00,
        STOP_READING: 0x01,
      });

      done();
    });

    it("has a SERIAL_PORT_IDs property", function(done) {

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
    // it("has a SERIAL_PIN_TYPES property", function(done) {

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

    it("can configure a software serial port", function(done) {
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

    it("can configure a hardware serial port", function(done) {
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

    it("throws an error if no serial port id is passed", function(done) {
      assert.throws(function() {
        board.serialConfig({
          buad: 57600
        });
      });
      done();
    });

    it("throws an error if both RX and TX pins are not defined when using Software Serial", function(done) {
      // throw error if both pins are not specified
      assert.throws(function() {
        board.serialConfig({
          portId: 8,
          buad: 57600
        });
      });

      // throw error if only one serial pin is specified
      assert.throws(function() {
        board.serialConfig({
          portId: 8,
          buad: 57600,
          txPin: 0
        });
      });
      done();
    });

    it("can write a single byte to a serial port", function(done) {
      board.serialWrite(0x08, [1]);
      assert.equal(transport.lastWrite[2], SERIAL_WRITE | 0x08);
      assert.equal(transport.lastWrite[3], 1 & 0x7F);
      assert.equal(transport.lastWrite[4], (1 >> 7) & 0x7F);
      assert.equal(transport.lastWrite[5], END_SYSEX);
      done();
    });

    it("can write a byte array to a serial port", function(done) {
      board.serialWrite(0x08, [252, 253, 254]);
      assert.equal(transport.lastWrite[2], SERIAL_WRITE | 0x08);
      assert.equal(transport.lastWrite[3], 252 & 0x7F);
      assert.equal(transport.lastWrite[4], (252 >> 7) & 0x7F);
      assert.equal(transport.lastWrite[7], 254 & 0x7F);
      assert.equal(transport.lastWrite[8], (254 >> 7) & 0x7F);
      assert.equal(transport.lastWrite[9], END_SYSEX);
      done();
    });

    it("has a serialRead method that sets READ_CONTINUOUS mode", function(done) {
      var handler = sandbox.spy(function() {});
      board.serialRead(0x08, handler);

      assert.equal(transport.lastWrite[2], SERIAL_READ | 0x08);
      assert.equal(transport.lastWrite[3], 0);
      assert.equal(transport.lastWrite[4], END_SYSEX);

      done();
    });

    it("has a serialRead method that reads continuously", function(done) {
      var inBytes = [
        242 & 0x7F,
        (242 >> 7) & 0x7F,
        243 & 0x7F,
        (243 >> 7) & 0x7F,
        244 & 0x7F,
        (244 >> 7) & 0x7F,
      ];

      var handler = sandbox.spy(function() {});
      board.serialRead(0x08, handler);

      for (var i = 0; i < 5; i++) {
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

    it("serialRead accepts an optional maxBytesToRead parameter", function(done) {
      var maxBytesToRead = 4;
      var handler = sandbox.spy(function() {});
      board.serialRead(0x08, maxBytesToRead, handler);

      assert.equal(transport.lastWrite[4], 4);
      assert.equal(transport.lastWrite[5], 0);
      assert.equal(transport.lastWrite[6], END_SYSEX);
      done();
    });

    it("has a serialStop method that sets STOP_READING mode", function(done) {
      board.serialStop(0x08);
      assert.equal(transport.lastWrite[2], SERIAL_READ | 0x08);
      assert.equal(transport.lastWrite[3], 1);
      assert.equal(transport.lastWrite[4], END_SYSEX);
      done();
    });

    it("has a serialClose method", function(done) {
      board.serialClose(0x09);
      assert.equal(transport.lastWrite[2], SERIAL_CLOSE | 0x09);
      done();
    });

    it("has a serialFlush method", function(done) {
      board.serialFlush(0x02);
      assert.equal(transport.lastWrite[2], SERIAL_FLUSH | 0x02);
      done();
    });

    it("has a serialListen method that switches software serial port", function(done) {
      var spy = sandbox.spy(transport, "write");
      board.serialListen(0x08);
      assert.equal(transport.lastWrite[2], SERIAL_LISTEN | 0x08);
      assert.equal(transport.lastWrite[3], END_SYSEX);
      assert.equal(spy.callCount, 1);
      spy.restore();
      done();
    });

    it("must not send a SERIAL_LISTEN message for a hardware serial port", function(done) {
      var spy = sandbox.spy(transport, "write");
      board.serialListen(0x01);
      assert.equal(spy.callCount, 0);
      spy.restore();
      done();
    });

  });

  describe("sysex: custom messages and response handlers", function() {

    it("must allow custom SYSEX_RESPONSE handlers", function(done) {

      assert.equal(Board.SYSEX_RESPONSE[NON_STANDARD_REPLY], undefined);

      Board.SYSEX_RESPONSE[NON_STANDARD_REPLY] = function(board) {
        var payload = [];
        var sub = board.currentBuffer[2];

        for (var i = 3, length = board.currentBuffer.length - 1; i < length; i += 2) {
          payload.push(board.currentBuffer[i] | (board.currentBuffer[i + 1] << 7));
        }

        board.emit("non-standard-reply-" + sub, payload);
      };

      // User code may add this emitter
      board.on("non-standard-reply-4", function(payload) {
        assert.deepEqual(payload, [0, 1, 2, 3, 4]);
        done();
      });

      // Emit mock data to trigger the NON_STANDARD_REPLY handler
      transport.emit("data", [
        //                               SUB   Data...
        START_SYSEX, NON_STANDARD_REPLY, 0x04, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX
      ]);
    });

    it("must provide a SAFE API to define custom SYSEX_RESPONSE handlers", function(done) {

      var incoming = [START_SYSEX, NON_STANDARD_REPLY, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, END_SYSEX];

      board.sysexResponse(NON_STANDARD_REPLY, function(data) {
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

    it("must allow sending arbitrary sysex commands", function(done) {

      var write = sandbox.stub(transport, "write");

      board.sysexCommand([
        I2C_REQUEST, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F,
      ]);

      var sent = write.lastCall.args[0];

      assert.equal(sent[0], START_SYSEX);
      assert.equal(sent[1], I2C_REQUEST);
      assert.equal(sent[2], 0x68);
      assert.equal(sent[3], 0 << 3);
      assert.equal(sent[4], 1 & 0x7F);
      assert.equal(sent[5], (1 >> 7) & 0x7F);
      assert.equal(sent[6], END_SYSEX);

      done();
    });

  });

  describe("parser", function() {

    beforeEach(function() {
      board.currentBuffer = [];
    });

    it("must parse a command from the beginning of a data packet", function(done) {
      var spy = sandbox.spy();
      var incoming = [REPORT_VERSION, 0x02, 0x03];
      board.versionReceived = false;
      board.on("reportversion", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a command from the middle of a data packet", function(done) {
      var spy = sandbox.spy();
      // includes: analog input, report version, query firmware (incomplete)
      var incoming = [
        0xe0, 0x07, 0x07, 0xf9, 0x02, 0x05, 0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74, 0x00, 0x61,
        0x00, 0x6e, 0x00, 0x64, 0x00
      ];
      board.versionReceived = false;
      board.on("reportversion", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must not emit command events until REPORT_VERSION is received", function(done) {
      var spyAnalog = sandbox.spy();
      var spyVersion = sandbox.spy();
      // includes: analog input, report version, query firmware (incomplete) and junk
      // between analog input and report version
      var incoming = [
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

    it("must parse multiple commands from a single packet", function(done) {
      var spyAnalog = sandbox.spy();
      var spyVersion = sandbox.spy();
      // includes: report version, analog input, query firmware (incomplete) and junk
      // between analog input and report version
      var incoming = [
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

    it("must parse a complete sysex command after an incomplete sysex command", function(done) {
      var spy = sandbox.spy();
      // includes: query firmware (incomplete sysex), pin state response (pin 2)
      var incoming = [
        0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74, 0x00, 0x61, 0x00, 0x6e, 0x00, 0x64, 0x00,
        0xf0, 0x6e, 0x02, 0x01, 0x01, 0xf7
      ];
      board.versionReceived = true;
      board.on("pin-state-2", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a non-sysex command after an incomplete sysex command", function(done) {
      var spy = sandbox.spy();
      // includes: query firmware (incomplete sysex), analog input
      var incoming = [
        0xf0, 0x79, 0x02, 0x05, 0x53, 0x00, 0x74, 0x00, 0x61, 0x00, 0x6e, 0x00, 0x64, 0x00,
        0xe0, 0x00, 0x71
      ];
      board.versionReceived = true;
      board.on("analog-read-0", spy);
      transport.emit("data", incoming);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a command spread across multiple data packets", function(done) {
      var spy = sandbox.spy();
      // query firmware split across 3 packets with first packet preceeded by junk
      var incoming1 = [0x07, 0x04, 240, 121, 2, 3, 83, 0, 116, 0, 97, 0, 110, 0, 100, 0];
      var incoming2 = [97, 0, 114, 0, 100, 0, 70, 0, 105, 0, 114, 0, 109, 0];
      var incoming3 = [97, 0, 116, 0, 97, 0, 247];

      board.versionReceived = true;
      board.on("queryfirmware", spy);
      transport.emit("data", incoming1);
      transport.emit("data", incoming2);
      transport.emit("data", incoming3);
      assert.equal(spy.callCount, 1);
      done();
    });

    it("must parse a command spread across multiple single byte transfers", function(done) {
      var spy = sandbox.spy();
      var incoming = [REPORT_VERSION, 0x02, 0x03];

      board.versionReceived = true;
      board.on("reportversion", spy);
      for (var i = 0; i < incoming.length; i++) {
        transport.emit("data", [incoming[i]]);
      }
      assert.equal(spy.callCount, 1);
      done();
    });

  });
});

describe("Board.encode/Board.decode", function() {

  describe("Board.encode", function() {
    it("must encode arbitrary data", function(done) {
      assert.deepEqual(Board.encode([0, 1, 2, 3, 4]), [0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
      done();
    });
    it("returns a fresh array", function(done) {
      var data = [];
      assert.notEqual(Board.encode(data), data);
      done();
    });
  });
  describe("Board.decode", function() {
    it("must decode arbitrary data", function(done) {
      assert.deepEqual(Board.decode([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]), [0, 1, 2, 3, 4]);
      done();
    });

    it("must fail to decode uneven data", function(done) {
      assert.throws(function() {
        Board.decode([0, 0, 1, 0, 2, 0, 3, 0, 4]);
      });
      done();
    });

    it("returns a fresh array", function(done) {
      var data = [];
      assert.notEqual(Board.decode(data), data);
      done();
    });
  });
});
