/**
 * Global Environment Dependencies
 */
/* jshint -W079 */
var Map = require("es6-map");
var assign = require("object-assign");

/**
 * @author Julian Gautier
 */
/**
 * Module Dependencies
 */
var util = require("util"),
  Emitter = require("events").EventEmitter,
  chrome = chrome || undefined,
  Encoder7Bit = require("./encoder7bit"),
  OneWireUtils = require("./onewireutils"),
  SerialPort = null,
  i2cActive = new Map();


try {
  if (process.browser) {
    SerialPort = require("browser-serialport").SerialPort;
  } else {
    SerialPort = require("serialport").SerialPort;
  }
} catch (err) {
  SerialPort = null;
}

if (SerialPort == null) {
  console.log("It looks like serialport didn't compile properly. This is a common problem and its fix is well documented here https://github.com/voodootikigod/node-serialport#to-install");
  throw "Missing serialport dependency";
}

/**
 * constants
 */

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
var START_SYSEX = 0xF0;
var STEPPER = 0x72;
var STRING_DATA = 0x71;
var SYSTEM_RESET = 0xFF;

var MAX_PIN_COUNT = 128;

/**
 * MIDI_RESPONSE contains functions to be called when we receive a MIDI message from the arduino.
 * used as a switch object as seen here http://james.padolsey.com/javascript/how-to-avoid-switch-case-syndrome/
 * @private
 */

var MIDI_RESPONSE = {};

/**
 * Handles a REPORT_VERSION response and emits the reportversion event.  Also turns on all pins to start reporting
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

MIDI_RESPONSE[REPORT_VERSION] = function(board) {
  board.version.major = board.currentBuffer[1];
  board.version.minor = board.currentBuffer[2];
  board.emit("reportversion");
};

/**
 * Handles a ANALOG_MESSAGE response and emits "analog-read" and "analog-read-"+n events where n is the pin number.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

MIDI_RESPONSE[ANALOG_MESSAGE] = function(board) {
  var value = board.currentBuffer[1] | (board.currentBuffer[2] << 7);
  var pin = board.currentBuffer[0] & 0x0F;

  if (board.pins[board.analogPins[pin]]) {
    board.pins[board.analogPins[pin]].value = value;
  }

  board.emit("analog-read-" + pin, value);
  board.emit("analog-read", {
    pin: pin,
    value: value
  });
};

/**
 * Handles a DIGITAL_MESSAGE response and emits:
 * "digital-read"
 * "digital-read-"+n
 *
 * Where n is the pin number.
 *
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

MIDI_RESPONSE[DIGITAL_MESSAGE] = function(board) {
  var port = (board.currentBuffer[0] & 0x0F);
  var portValue = board.currentBuffer[1] | (board.currentBuffer[2] << 7);

  for (var i = 0; i < 8; i++) {
    var pinNumber = 8 * port + i;
    var pin = board.pins[pinNumber];
    if (pin && (pin.mode === board.MODES.INPUT)) {
      pin.value = (portValue >> (i & 0x07)) & 0x01;
      board.emit("digital-read-" + pinNumber, pin.value);
      board.emit("digital-read", {
        pin: pinNumber,
        value: pin.value
      });
    }
  }
};

/**
 * SYSEX_RESPONSE contains functions to be called when we receive a SYSEX message from the arduino.
 * used as a switch object as seen here http://james.padolsey.com/javascript/how-to-avoid-switch-case-syndrome/
 * @private
 */

var SYSEX_RESPONSE = {};

/**
 * Handles a QUERY_FIRMWARE response and emits the "queryfirmware" event
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[QUERY_FIRMWARE] = function(board) {
  var firmwareBuf = [];
  board.firmware.version = {};
  board.firmware.version.major = board.currentBuffer[2];
  board.firmware.version.minor = board.currentBuffer[3];
  for (var i = 4, length = board.currentBuffer.length - 2; i < length; i += 2) {
    firmwareBuf.push((board.currentBuffer[i] & 0x7F) | ((board.currentBuffer[i + 1] & 0x7F) << 7));
  }

  board.firmware.name = new Buffer(firmwareBuf).toString("utf8", 0, firmwareBuf.length);
  board.emit("queryfirmware");
};

/**
 * Handles a CAPABILITY_RESPONSE response and emits the "capability-query" event
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[CAPABILITY_RESPONSE] = function(board) {
  var supportedModes = 0;

  function pushModes(modesArray, mode) {
    if (supportedModes & (1 << board.MODES[mode])) {
      modesArray.push(board.MODES[mode]);
    }
  }

  // Only create pins if none have been previously created on the instance.
  if (!board.pins.length) {
    for (var i = 2, n = 0; i < board.currentBuffer.length - 1; i++) {
      if (board.currentBuffer[i] === 127) {
        var modesArray = [];
        Object.keys(board.MODES).forEach(pushModes.bind(null, modesArray));
        board.pins.push({
          supportedModes: modesArray,
          mode: board.MODES.UNKNOWN,
          value: 0,
          report: 1
        });
        supportedModes = 0;
        n = 0;
        continue;
      }
      if (n === 0) {
        supportedModes |= (1 << board.currentBuffer[i]);
      }
      n ^= 1;
    }
  }

  board.emit("capability-query");
};

/**
 * Handles a PIN_STATE response and emits the 'pin-state-'+n event where n is the pin number.
 *
 * Note about pin state: For output modes, the state is any value that has been
 * previously written to the pin. For input modes, the state is the status of
 * the pullup resistor.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[PIN_STATE_RESPONSE] = function (board) {
  var pin = board.currentBuffer[2];
  board.pins[pin].mode = board.currentBuffer[3];
  board.pins[pin].state = board.currentBuffer[4];
  if (board.currentBuffer.length > 6) {
    board.pins[pin].state |= (board.currentBuffer[5] << 7);
  }
  if (board.currentBuffer.length > 7) {
    board.pins[pin].state |= (board.currentBuffer[6] << 14);
  }
  board.emit("pin-state-" + pin);
};

/**
 * Handles a ANALOG_MAPPING_RESPONSE response and emits the "analog-mapping-query" event.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[ANALOG_MAPPING_RESPONSE] = function(board) {
  var pin = 0;
  var currentValue;
  for (var i = 2; i < board.currentBuffer.length - 1; i++) {
    currentValue = board.currentBuffer[i];
    board.pins[pin].analogChannel = currentValue;
    if (currentValue !== 127) {
      board.analogPins.push(pin);
    }
    pin++;
  }
  board.emit("analog-mapping-query");
};

/**
 * Handles a I2C_REPLY response and emits the "I2C-reply-"+n event where n is the slave address of the I2C device.
 * The event is passed the buffer of data sent from the I2C Device
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[I2C_REPLY] = function(board) {
  var reply = [];
  var address = (board.currentBuffer[2] & 0x7F) | ((board.currentBuffer[3] & 0x7F) << 7);
  var register = (board.currentBuffer[4] & 0x7F) | ((board.currentBuffer[5] & 0x7F) << 7);

  for (var i = 6, length = board.currentBuffer.length - 1; i < length; i += 2) {
    reply.push(board.currentBuffer[i] | (board.currentBuffer[i + 1] << 7));
  }

  board.emit("I2C-reply-" + address + "-" + register, reply);
};

SYSEX_RESPONSE[ONEWIRE_DATA] = function(board) {
  var subCommand = board.currentBuffer[2];

  if (!SYSEX_RESPONSE[subCommand]) {
    return;
  }

  SYSEX_RESPONSE[subCommand](board);
};

SYSEX_RESPONSE[ONEWIRE_SEARCH_REPLY] = function(board) {
  var pin = board.currentBuffer[3];
  var replyBuffer = board.currentBuffer.slice(4, board.currentBuffer.length - 1);

  board.emit("1-wire-search-reply-" + pin, OneWireUtils.readDevices(replyBuffer));
};

SYSEX_RESPONSE[ONEWIRE_SEARCH_ALARMS_REPLY] = function(board) {
  var pin = board.currentBuffer[3];
  var replyBuffer = board.currentBuffer.slice(4, board.currentBuffer.length - 1);

  board.emit("1-wire-search-alarms-reply-" + pin, OneWireUtils.readDevices(replyBuffer));
};

SYSEX_RESPONSE[ONEWIRE_READ_REPLY] = function(board) {
  var encoded = board.currentBuffer.slice(4, board.currentBuffer.length - 1);
  var decoded = Encoder7Bit.from7BitArray(encoded);
  var correlationId = (decoded[1] << 8) | decoded[0];

  board.emit("1-wire-read-reply-" + correlationId, decoded.slice(2));
};

/**
 * Handles a STRING_DATA response and logs the string to the console.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[STRING_DATA] = function(board) {
  var string = new Buffer(board.currentBuffer.slice(2, -1)).toString("utf8").replace(/\0/g, "");
  board.emit("string", string);
};

/**
 * Response from pingRead
 */

SYSEX_RESPONSE[PING_READ] = function(board) {
  var pin = (board.currentBuffer[2] & 0x7F) | ((board.currentBuffer[3] & 0x7F) << 7);
  var durationBuffer = [
    (board.currentBuffer[4] & 0x7F) | ((board.currentBuffer[5] & 0x7F) << 7), (board.currentBuffer[6] & 0x7F) | ((board.currentBuffer[7] & 0x7F) << 7), (board.currentBuffer[8] & 0x7F) | ((board.currentBuffer[9] & 0x7F) << 7), (board.currentBuffer[10] & 0x7F) | ((board.currentBuffer[11] & 0x7F) << 7)
  ];
  var duration = ((durationBuffer[0] << 24) +
    (durationBuffer[1] << 16) +
    (durationBuffer[2] << 8) +
    (durationBuffer[3]));
  board.emit("ping-read-" + pin, duration);
};

/**
 * Handles the message from a stepper completing move
 * @param {Board} board
 */

SYSEX_RESPONSE[STEPPER] = function(board) {
  var deviceNum = board.currentBuffer[2];
  board.emit("stepper-done-" + deviceNum, true);
};


/**
 * @class The Board object represents an arduino board.
 * @augments EventEmitter
 * @param {String} port This is the serial port the arduino is connected to.
 * @param {function} function A function to be called when the arduino is ready to communicate.
 * @property MODES All the modes available for pins on this arduino board.
 * @property I2C_MODES All the I2C modes available.
 * @property HIGH A constant to set a pins value to HIGH when the pin is set to an output.
 * @property LOW A constant to set a pins value to LOW when the pin is set to an output.
 * @property pins An array of pin object literals.
 * @property analogPins An array of analog pins and their corresponding indexes in the pins array.
 * @property version An object indicating the major and minor version of the firmware currently running.
 * @property firmware An object indicateon the name, major and minor version of the firmware currently running.
 * @property currentBuffer An array holding the current bytes received from the arduino.
 * @property {SerialPort} sp The serial port object used to communicate with the arduino.
 */
var Board = function(port, options, callback) {
  Emitter.call(this);

  if (typeof options === "function" || typeof options === "undefined") {
    callback = options;
    options = {};
  }

  var board = this;
  var defaults = {
    reportVersionTimeout: 5000,
    samplingInterval: 19,
    serialport: {
      baudRate: 57600,
      bufferSize: 1
    }
  };

  var settings = assign({}, defaults, options);

  this.isReady = false;

  this.MODES = {
    INPUT: 0x00,
    OUTPUT: 0x01,
    ANALOG: 0x02,
    PWM: 0x03,
    SERVO: 0x04,
    SHIFT: 0x05,
    I2C: 0x06,
    ONEWIRE: 0x07,
    STEPPER: 0x08,
    IGNORE: 0x7F,
    UNKOWN: 0x10
  };

  this.I2C_MODES = {
    WRITE: 0x00,
    READ: 1,
    CONTINUOUS_READ: 2,
    STOP_READING: 3
  };

  this.STEPPER = {
    TYPE: {
      DRIVER: 1,
      TWO_WIRE: 2,
      FOUR_WIRE: 4
    },
    RUNSTATE: {
      STOP: 0,
      ACCEL: 1,
      DECEL: 2,
      RUN: 3
    },
    DIRECTION: {
      CCW: 0,
      CW: 1
    }
  };

  this.HIGH = 1;
  this.LOW = 0;
  this.pins = [];
  this.analogPins = [];
  this.version = {};
  this.firmware = {};
  this.currentBuffer = [];
  this.versionReceived = false;
  this.name = "Firmata";
  this.settings = settings;

  if (typeof port === "object") {
    this.transport = port;
  } else {
    this.transport = new SerialPort(port, settings.serialport);
  }

  // For backward compat
  this.sp = this.transport;

  this.transport.on("open", function() {
    this.emit("connect");
  }.bind(this));

  this.transport.on("error", function(string) {
    if (typeof callback === "function") {
      callback(string);
    }
  });

  this.transport.on("data", function(data) {
    var byt, cmd;

    if (!this.versionReceived && data[0] !== REPORT_VERSION) {
      return;
    } else {
      this.versionReceived = true;
    }

    for (var i = 0; i < data.length; i++) {
      byt = data[i];
      // we dont want to push 0 as the first byte on our buffer
      if (this.currentBuffer.length === 0 && byt === 0) {
        continue;
      } else {
        this.currentBuffer.push(byt);

        // [START_SYSEX, ... END_SYSEX]
        if (this.currentBuffer[0] === START_SYSEX &&
          SYSEX_RESPONSE[this.currentBuffer[1]] &&
          this.currentBuffer[this.currentBuffer.length - 1] === END_SYSEX) {

          SYSEX_RESPONSE[this.currentBuffer[1]](this);
          this.currentBuffer.length = 0;
        } else if (this.currentBuffer[0] !== START_SYSEX) {
          // Check if data gets out of sync: first byte in buffer
          // must be a valid command if not START_SYSEX
          // Identify command on first byte
          cmd = this.currentBuffer[0] < 240 ? this.currentBuffer[0] & 0xF0 : this.currentBuffer[0];

          // Check if it is not a valid command
          if (cmd !== REPORT_VERSION && cmd !== ANALOG_MESSAGE && cmd !== DIGITAL_MESSAGE) {
            // console.log("OUT OF SYNC - CMD: "+cmd);
            // Clean buffer
            this.currentBuffer.length = 0;
          }
        }

        // There are 3 bytes in the buffer and the first is not START_SYSEX:
        // Might have a MIDI Command
        if (this.currentBuffer.length === 3 && this.currentBuffer[0] !== START_SYSEX) {
          //commands under 0xF0 we have a multi byte command
          if (this.currentBuffer[0] < 240) {
            cmd = this.currentBuffer[0] & 0xF0;
          } else {
            cmd = this.currentBuffer[0];
          }

          if (MIDI_RESPONSE[cmd]) {
            MIDI_RESPONSE[cmd](this);
            this.currentBuffer.length = 0;
          } else {
            // A bad serial read must have happened.
            // Reseting the buffer will allow recovery.
            this.currentBuffer.length = 0;
          }
        }
      }
    }
  }.bind(this));

  // if we have not received the version within the alotted
  // time specified by the reportVersionTimeout (user or default),
  // then send an explicit request for it.
  this.reportVersionTimeoutId = setTimeout(function() {
    if (this.versionReceived === false) {
      this.reportVersion(function() {});
      this.queryFirmware(function() {});
    }
  }.bind(this), settings.reportVersionTimeout);

  function ready() {
    board.isReady = true;
    board.emit("ready");
    if (typeof callback === "function") {
      callback();
    }
  }

  // Await the reported version.
  this.once("reportversion", function() {
    clearTimeout(this.reportVersionTimeoutId);
    this.versionReceived = true;
    this.once("queryfirmware", function() {

      // Only preemptively set the sampling interval if `samplingInterval`
      // property was _explicitly_ set as a constructor option.
      if (options.samplingInterval !== undefined) {
        this.setSamplingInterval(options.samplingInterval);
      }
      if (settings.skipCapabilities) {
        this.analogPins = settings.analogPins || this.analogPins;
        this.pins = settings.pins || this.pins;
        if (!this.pins.length) {
          for (var i = 0; i < (settings.pinCount || MAX_PIN_COUNT); i++) {
            var analogChannel = this.analogPins.indexOf(i);
            if (analogChannel < 0) {
              analogChannel = 127;
            }
            this.pins.push({supportedModes: [], analogChannel: analogChannel});
          }
        }
        ready();
      } else {
        this.queryCapabilities(function() {
          this.queryAnalogMapping(ready);
        });
      }
    });
  });

  i2cActive.set(this, false);
};

util.inherits(Board, Emitter);

/**
 * Asks the arduino to tell us its version.
 * @param {function} callback A function to be called when the arduino has reported its version.
 */

Board.prototype.reportVersion = function(callback) {
  this.once("reportversion", callback);
  this.transport.write(new Buffer([REPORT_VERSION]));
};

/**
 * Asks the arduino to tell us its firmware version.
 * @param {function} callback A function to be called when the arduino has reported its firmware version.
 */

Board.prototype.queryFirmware = function(callback) {
  this.once("queryfirmware", callback);
  this.transport.write(new Buffer([START_SYSEX, QUERY_FIRMWARE, END_SYSEX]));
};

/**
 * Asks the arduino to read analog data. Turn on reporting for this pin.
 * @param {number} pin The pin to read analog data
 * @param {function} callback A function to call when we have the analag data.
 */

Board.prototype.analogRead = function(pin, callback) {
  this.reportAnalogPin(pin, 1);
  this.addListener("analog-read-" + pin, callback);
};

/**
 * Asks the arduino to write an analog message.
 * @param {number} pin The pin to write analog data to.
 * @param {nubmer} value The data to write to the pin between 0 and 255.
 */

Board.prototype.analogWrite = function(pin, value) {
  var data = [];

  this.pins[pin].value = value;

  if (pin > 15) {
    data[0] = START_SYSEX;
    data[1] = EXTENDED_ANALOG;
    data[2] = pin;
    data[3] = value & 0x7F;
    data[4] = (value >> 7) & 0x7F;

    if (value > 0x00004000) {
      data[data.length] = (value >> 14) & 0x7F;
    }

    if (value > 0x00200000) {
      data[data.length] = (value >> 21) & 0x7F;
    }

    if (value > 0x10000000) {
      data[data.length] = (value >> 28) & 0x7F;
    }

    data[data.length] = END_SYSEX;
  } else {
    data.push(ANALOG_MESSAGE | pin, value & 0x7F, (value >> 7) & 0x7F);
  }

  this.transport.write(new Buffer(data));
};

Board.prototype.pwmWrite = Board.prototype.analogWrite;

/**
 * Set a pin to SERVO mode with an explicit PWM range.
 *
 * @param {number} pin The pin the servo is connected to
 * @param {number} min A 14-bit signed int.
 * @param {number} max A 14-bit signed int.
 */

Board.prototype.servoConfig = function(pin, min, max) {
  // [0]  START_SYSEX  (0xF0)
  // [1]  SERVO_CONFIG (0x70)
  // [2]  pin number   (0-127)
  // [3]  minPulse LSB (0-6)
  // [4]  minPulse MSB (7-13)
  // [5]  maxPulse LSB (0-6)
  // [6]  maxPulse MSB (7-13)
  // [7]  END_SYSEX    (0xF7)

  var data = [
    START_SYSEX,
    SERVO_CONFIG,
    pin,
    min & 0x7F,
    (min >> 7) & 0x7F,
    max & 0x7F,
    (max >> 7) & 0x7F,
    END_SYSEX
  ];

  this.pins[pin].mode = this.MODES.SERVO;
  this.transport.write(new Buffer(data));
};

/**
 * Asks the arduino to move a servo
 * @param {number} pin The pin the servo is connected to
 * @param {number} value The degrees to move the servo to.
 */

Board.prototype.servoWrite = function(pin, value) {
  // Values less than 544 will be treated as angles in degrees
  // (valid values in microseconds are handled as microseconds)
  this.analogWrite.apply(this, arguments);
};

/**
 * Asks the arduino to set the pin to a certain mode.
 * @param {number} pin The pin you want to change the mode of.
 * @param {number} mode The mode you want to set. Must be one of board.MODES
 */

Board.prototype.pinMode = function(pin, mode) {
  this.pins[pin].mode = mode;
  this.transport.write(new Buffer([PIN_MODE, pin, mode]));
};

/**
 * Asks the arduino to write a value to a digital pin
 * @param {number} pin The pin you want to write a value to.
 * @param {value} value The value you want to write. Must be board.HIGH or board.LOW
 */

Board.prototype.digitalWrite = function(pin, value) {
  var port = Math.floor(pin / 8);
  var portValue = 0;
  var pinRecord;
  this.pins[pin].value = value;
  for (var i = 0; i < 8; i++) {
    pinRecord = this.pins[8 * port + i];
    if (pinRecord && pinRecord.value) {
      portValue |= (1 << i);
    }
  }
  this.transport.write(new Buffer([DIGITAL_MESSAGE | port, portValue & 0x7F, (portValue >> 7) & 0x7F]));
};

/**
 * Asks the arduino to read digital data. Turn on reporting for this pin's port.
 *
 * @param {number} pin The pin to read data from
 * @param {function} callback The function to call when data has been received
 */

Board.prototype.digitalRead = function(pin, callback) {
  this.reportDigitalPin(pin, 1);
  this.addListener("digital-read-" + pin, callback);
};

/**
 * Asks the arduino to tell us its capabilities
 * @param {function} callback A function to call when we receive the capabilities
 */

Board.prototype.queryCapabilities = function(callback) {
  this.once("capability-query", callback);
  this.transport.write(new Buffer([START_SYSEX, CAPABILITY_QUERY, END_SYSEX]));
};

/**
 * Asks the arduino to tell us its analog pin mapping
 * @param {function} callback A function to call when we receive the pin mappings.
 */

Board.prototype.queryAnalogMapping = function(callback) {
  this.once("analog-mapping-query", callback);
  this.transport.write(new Buffer([START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]));
};

/**
 * Asks the arduino to tell us the current state of a pin
 * @param {number} pin The pin we want to the know the state of
 * @param {function} callback A function to call when we receive the pin state.
 */

Board.prototype.queryPinState = function(pin, callback) {
  this.once("pin-state-" + pin, callback);
  this.transport.write(new Buffer([START_SYSEX, PIN_STATE_QUERY, pin, END_SYSEX]));
};

/**
 * Sends a string to the arduino
 * @param {String} string to send to the device
 */

Board.prototype.sendString = function(string) {
  var bytes = new Buffer(string + "\0", "utf8");
  var data = [];
  data.push(START_SYSEX);
  data.push(STRING_DATA);
  for (var i = 0, length = bytes.length; i < length; i++) {
    data.push(bytes[i] & 0x7F);
    data.push((bytes[i] >> 7) & 0x7F);
  }
  data.push(END_SYSEX);
  this.transport.write(data);
};

function i2cRequest(board, buffer) {

  if (!i2cActive.get(board)) {
    throw new Error("I2C is not enabled for this board. To enable, call the i2cConfig() method.");
  }

  board.transport.write(buffer);
}

/**
 * Sends a I2C config request to the arduino board with an optional
 * value in microseconds to delay an I2C Read.  Must be called before
 * an I2C Read or Write
 * @param {number} delay in microseconds to set for I2C Read
 */

Board.prototype.sendI2CConfig = function(delay) {
  return this.i2cConfig(delay);
};

/**
 * Enable I2C with an optional read delay. Must be called before
 * an I2C Read or Write
 *
 * Supersedes sendI2CConfig
 *
 * @param {number} delay in microseconds to set for I2C Read
 */

Board.prototype.i2cConfig = function(options) {
  var delay;

  if (typeof options === "number") {
    delay = options;
  } else {
    if (typeof options === "object" && options !== null) {
      delay = options.delay;
    }
  }

  delay = delay || 0;

  i2cActive.set(this, true);

  i2cRequest(this,
    new Buffer([
      START_SYSEX,
      I2C_CONFIG,
      delay & 0xFF, (delay >> 8) & 0xFF,
      END_SYSEX
    ])
  );

  return this;
};

/**
 * Asks the arduino to send an I2C request to a device
 * @param {number} slaveAddress The address of the I2C device
 * @param {Array} bytes The bytes to send to the device
 */

Board.prototype.sendI2CWriteRequest = function(slaveAddress, bytes) {
  var data = [];
  bytes = bytes || [];

  data.push(
    START_SYSEX,
    I2C_REQUEST,
    slaveAddress,
    this.I2C_MODES.WRITE << 3
  );

  for (var i = 0, length = bytes.length; i < length; i++) {
    data.push(
      bytes[i] & 0x7F, (bytes[i] >> 7) & 0x7F
    );
  }

  data.push(END_SYSEX);

  i2cRequest(this, new Buffer(data));
};

/**
 * Write data to a register
 *
 * @param {number} address      The address of the I2C device.
 * @param {array} cmdRegOrData  An array of bytes
 *
 * Write a command to a register
 *
 * @param {number} address      The address of the I2C device.
 * @param {number} cmdRegOrData The register
 * @param {array} inBytes       An array of bytes
 *
 */
Board.prototype.i2cWrite = function(address, registerOrData, inBytes) {
  /**
   * registerOrData:
   * [... arbitrary bytes]
   *
   * or
   *
   * registerOrData, inBytes:
   * command [, ...]
   *
   */
  var bytes;
  var data = [
    START_SYSEX,
    I2C_REQUEST,
    address,
    this.I2C_MODES.WRITE << 3
  ];


  // If i2cWrite was used for an i2cWriteReg call...
  if (arguments.length === 3 &&
      !Array.isArray(registerOrData) &&
      !Array.isArray(inBytes)) {

    return this.i2cWriteReg(address, registerOrData, inBytes);
  }

  // Fix arguments if called with Firmata.js API
  if (arguments.length === 2) {
    if (Array.isArray(registerOrData)) {
      inBytes = registerOrData.slice();
      registerOrData = inBytes.shift();
    } else {
      inBytes = [];
    }
  }

  bytes = new Buffer([registerOrData].concat(inBytes));

  for (var i = 0, length = bytes.length; i < length; i++) {
    data.push(
      bytes[i] & 0x7F, (bytes[i] >> 7) & 0x7F
    );
  }

  data.push(END_SYSEX);

  i2cRequest(this, new Buffer(data));

  return this;
};

/**
 * Write data to a register
 *
 * @param {number} address    The address of the I2C device.
 * @param {number} register   The register.
 * @param {number} byte       The byte value to write.
 *
 */

Board.prototype.i2cWriteReg = function(address, register, byte) {
  i2cRequest(this,
    new Buffer([
      START_SYSEX,
      I2C_REQUEST,
      address,
      this.I2C_MODES.WRITE << 3,
      // register
      register & 0x7F, (register >> 7) & 0x7F,
      // byte
      byte & 0x7F, (byte >> 7) & 0x7F,
      END_SYSEX
    ])
  );

  return this;
};


/**
 * Asks the arduino to request bytes from an I2C device
 * @param {number} slaveAddress The address of the I2C device
 * @param {number} numBytes The number of bytes to receive.
 * @param {function} callback A function to call when we have received the bytes.
 */

Board.prototype.sendI2CReadRequest = function(address, numBytes, callback) {
  i2cRequest(this,
    new Buffer([
      START_SYSEX,
      I2C_REQUEST,
      address,
      this.I2C_MODES.READ << 3,
      numBytes & 0x7F, (numBytes >> 7) & 0x7F,
      END_SYSEX
    ])
  );
  this.once("I2C-reply-" + address + "-0" , callback);
};

// TODO: Refactor i2cRead and i2cReadOnce
//      to share most operations.

/**
 * Initialize a continuous I2C read.
 *
 * @param {number} address    The address of the I2C device
 * @param {number} register   Optionally set the register to read from.
 * @param {number} numBytes   The number of bytes to receive.
 * @param {function} callback A function to call when we have received the bytes.
 */

Board.prototype.i2cRead = function(address, register, bytesToRead, callback) {

  if (arguments.length === 3 &&
      typeof register === "number" &&
      typeof bytesToRead === "function") {
    callback = bytesToRead;
    bytesToRead = register;
    register = null;
  }

  var event = "I2C-reply-" + address + "-";
  var data = [
    START_SYSEX,
    I2C_REQUEST,
    address,
    this.I2C_MODES.CONTINUOUS_READ << 3,
  ];

  if (register !== null) {
    data.push(
      register & 0x7F, (register >> 7) & 0x7F
    );
  } else {
    register = 0;
  }

  event += register;

  data.push(
    bytesToRead & 0x7F, (bytesToRead >> 7) & 0x7F,
    END_SYSEX
  );

  this.on(event, callback);

  i2cRequest(this, new Buffer(data));

  return this;
};

/**
 * Perform a single I2C read
 *
 * Supersedes sendI2CReadRequest
 *
 * Read bytes from address
 *
 * @param {number} address    The address of the I2C device
 * @param {number} register   Optionally set the register to read from.
 * @param {number} numBytes   The number of bytes to receive.
 * @param {function} callback A function to call when we have received the bytes.
 *
 */


Board.prototype.i2cReadOnce = function(address, register, bytesToRead, callback) {

  if (arguments.length === 3 &&
      typeof register === "number" &&
      typeof bytesToRead === "function") {
    callback = bytesToRead;
    bytesToRead = register;
    register = null;
  }

  var event = "I2C-reply-" + address + "-";
  var data = [
    START_SYSEX,
    I2C_REQUEST,
    address,
    this.I2C_MODES.READ << 3,
  ];

  if (register !== null) {
    data.push(
      register & 0x7F, (register >> 7) & 0x7F
    );
  } else {
    register = 0;
  }

  event += register;

  data.push(
    bytesToRead & 0x7F, (bytesToRead >> 7) & 0x7F,
    END_SYSEX
  );

  this.once(event, callback);

  i2cRequest(this, new Buffer(data));

  return this;
};

// CONTINUOUS_READ

/**
 * Configure the passed pin as the controller in a 1-wire bus.
 * Pass as enableParasiticPower true if you want the data pin to power the bus.
 * @param pin
 * @param enableParasiticPower
 */
Board.prototype.sendOneWireConfig = function(pin, enableParasiticPower) {
  this.transport.write(new Buffer([START_SYSEX, ONEWIRE_DATA, ONEWIRE_CONFIG_REQUEST, pin, enableParasiticPower ? 0x01 : 0x00, END_SYSEX]));
};

/**
 * Searches for 1-wire devices on the bus.  The passed callback should accept
 * and error argument and an array of device identifiers.
 * @param pin
 * @param callback
 */
Board.prototype.sendOneWireSearch = function(pin, callback) {
  this._sendOneWireSearch(ONEWIRE_SEARCH_REQUEST, "1-wire-search-reply-" + pin, pin, callback);
};

/**
 * Searches for 1-wire devices on the bus in an alarmed state.  The passed callback
 * should accept and error argument and an array of device identifiers.
 * @param pin
 * @param callback
 */
Board.prototype.sendOneWireAlarmsSearch = function(pin, callback) {
  this._sendOneWireSearch(ONEWIRE_SEARCH_ALARMS_REQUEST, "1-wire-search-alarms-reply-" + pin, pin, callback);
};

Board.prototype._sendOneWireSearch = function(type, event, pin, callback) {
  this.transport.write(new Buffer([START_SYSEX, ONEWIRE_DATA, type, pin, END_SYSEX]));

  var searchTimeout = setTimeout(function() {
    callback(new Error("1-Wire device search timeout - are you running ConfigurableFirmata?"));
  }, 5000);
  this.once(event, function(devices) {
    clearTimeout(searchTimeout);

    callback(null, devices);
  });
};

/**
 * Reads data from a device on the bus and invokes the passed callback.
 *
 * N.b. ConfigurableFirmata will issue the 1-wire select command internally.
 * @param pin
 * @param device
 * @param numBytesToRead
 * @param callback
 */
Board.prototype.sendOneWireRead = function(pin, device, numBytesToRead, callback) {
  var correlationId = Math.floor(Math.random() * 255);
  var readTimeout = setTimeout(function() {
    callback(new Error("1-Wire device read timeout - are you running ConfigurableFirmata?"));
  }, 5000);
  this._sendOneWireRequest(pin, ONEWIRE_READ_REQUEST_BIT, device, numBytesToRead, correlationId, null, null, "1-wire-read-reply-" + correlationId, function(data) {
    clearTimeout(readTimeout);

    callback(null, data);
  });
};

/**
 * Resets all devices on the bus.
 * @param pin
 */
Board.prototype.sendOneWireReset = function(pin) {
  this._sendOneWireRequest(pin, ONEWIRE_RESET_REQUEST_BIT);
};

/**
 * Writes data to the bus to be received by the passed device.  The device
 * should be obtained from a previous call to sendOneWireSearch.
 *
 * N.b. ConfigurableFirmata will issue the 1-wire select command internally.
 * @param pin
 * @param device
 * @param data
 */
Board.prototype.sendOneWireWrite = function(pin, device, data) {
  this._sendOneWireRequest(pin, ONEWIRE_WRITE_REQUEST_BIT, device, null, null, null, Array.isArray(data) ? data : [data]);
};

/**
 * Tells firmata to not do anything for the passed amount of ms.  For when you
 * need to give a device attached to the bus time to do a calculation.
 * @param pin
 */
Board.prototype.sendOneWireDelay = function(pin, delay) {
  this._sendOneWireRequest(pin, ONEWIRE_DELAY_REQUEST_BIT, null, null, null, delay);
};

/**
 * Sends the passed data to the passed device on the bus, reads the specified
 * number of bytes and invokes the passed callback.
 *
 * N.b. ConfigurableFirmata will issue the 1-wire select command internally.
 * @param pin
 * @param device
 * @param data
 * @param numBytesToRead
 * @param callback
 */
Board.prototype.sendOneWireWriteAndRead = function(pin, device, data, numBytesToRead, callback) {
  var correlationId = Math.floor(Math.random() * 255);
  var readTimeout = setTimeout(function() {
    callback(new Error("1-Wire device read timeout - are you running ConfigurableFirmata?"));
  }, 5000);
  this._sendOneWireRequest(pin, ONEWIRE_WRITE_REQUEST_BIT | ONEWIRE_READ_REQUEST_BIT, device, numBytesToRead, correlationId, null, Array.isArray(data) ? data : [data], "1-wire-read-reply-" + correlationId, function(data) {
    clearTimeout(readTimeout);

    callback(null, data);
  });
};

// see http://firmata.org/wiki/Proposals#OneWire_Proposal
Board.prototype._sendOneWireRequest = function(pin, subcommand, device, numBytesToRead, correlationId, delay, dataToWrite, event, callback) {
  var bytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  if (device || numBytesToRead || correlationId || delay || dataToWrite) {
    subcommand = subcommand | ONEWIRE_WITHDATA_REQUEST_BITS;
  }

  if (device) {
    bytes.splice.apply(bytes, [0, 8].concat(device));
  }

  if (numBytesToRead) {
    bytes[8] = numBytesToRead & 0xFF;
    bytes[9] = (numBytesToRead >> 8) & 0xFF;
  }

  if (correlationId) {
    bytes[10] = correlationId & 0xFF;
    bytes[11] = (correlationId >> 8) & 0xFF;
  }

  if (delay) {
    bytes[12] = delay & 0xFF;
    bytes[13] = (delay >> 8) & 0xFF;
    bytes[14] = (delay >> 16) & 0xFF;
    bytes[15] = (delay >> 24) & 0xFF;
  }

  if (dataToWrite) {
    dataToWrite.forEach(function(byte) {
      bytes.push(byte);
    });
  }

  var output = [START_SYSEX, ONEWIRE_DATA, subcommand, pin];
  output = output.concat(Encoder7Bit.to7BitArray(bytes));
  output.push(END_SYSEX);

  this.transport.write(new Buffer(output));

  if (event && callback) {
    this.once(event, callback);
  }
};

/**
 * Set sampling interval in millis. Default is 19 ms
 * @param {number} interval The sampling interval in ms > 10
 */

Board.prototype.setSamplingInterval = function(interval) {
  var safeint = interval < 10 ? 10 : (interval > 65535 ? 65535 : interval); // constrained
  this.settings.samplingInterval = safeint;
  this.transport.write(new Buffer([START_SYSEX, SAMPLING_INTERVAL, (safeint & 0x7F), ((safeint >> 7) & 0x7F), END_SYSEX]));
};

/**
 * Get sampling interval in millis. Default is 19 ms
 */

Board.prototype.getSamplingInterval = function(interval) {
  return this.settings.samplingInterval;
};

/**
 * Set reporting on pin
 * @param {number} pin The pin to turn on/off reporting
 * @param {number} value Binary value to turn reporting on/off
 */

Board.prototype.reportAnalogPin = function(pin, value) {
  if (value === 0 || value === 1) {
    this.pins[this.analogPins[pin]].report = value;
    this.transport.write(new Buffer([REPORT_ANALOG | pin, value]));
  }
};

/**
 * Set reporting on pin
 * @param {number} pin The pin to turn on/off reporting
 * @param {number} value Binary value to turn reporting on/off
 */

Board.prototype.reportDigitalPin = function(pin, value) {
  var port = Math.floor(pin / 8);
  if (value === 0 || value === 1) {
    this.pins[pin].report = value;
    this.transport.write(new Buffer([REPORT_DIGITAL | port, value]));
  }
};

/**
 *
 *
 */

Board.prototype.pingRead = function(opts, callback) {
  var pin = opts.pin;
  var value = opts.value;
  var pulseOut = opts.pulseOut || 0;
  var timeout = opts.timeout || 1000000;
  var pulseOutArray = [
    ((pulseOut >> 24) & 0xFF), ((pulseOut >> 16) & 0xFF), ((pulseOut >> 8) & 0XFF), ((pulseOut & 0xFF))
  ];
  var timeoutArray = [
    ((timeout >> 24) & 0xFF), ((timeout >> 16) & 0xFF), ((timeout >> 8) & 0XFF), ((timeout & 0xFF))
  ];
  var data = [
    START_SYSEX,
    PING_READ,
    pin,
    value,
    pulseOutArray[0] & 0x7F, (pulseOutArray[0] >> 7) & 0x7F,
    pulseOutArray[1] & 0x7F, (pulseOutArray[1] >> 7) & 0x7F,
    pulseOutArray[2] & 0x7F, (pulseOutArray[2] >> 7) & 0x7F,
    pulseOutArray[3] & 0x7F, (pulseOutArray[3] >> 7) & 0x7F,
    timeoutArray[0] & 0x7F, (timeoutArray[0] >> 7) & 0x7F,
    timeoutArray[1] & 0x7F, (timeoutArray[1] >> 7) & 0x7F,
    timeoutArray[2] & 0x7F, (timeoutArray[2] >> 7) & 0x7F,
    timeoutArray[3] & 0x7F, (timeoutArray[3] >> 7) & 0x7F,
    END_SYSEX
  ];
  this.transport.write(new Buffer(data));
  this.once("ping-read-" + pin, callback);
};

/**
 * Stepper functions to support AdvancedFirmata"s asynchronous control of stepper motors
 * https://github.com/soundanalogous/AdvancedFirmata
 */

/**
 * Asks the arduino to configure a stepper motor with the given config to allow asynchronous control of the stepper
 * @param {number} deviceNum Device number for the stepper (range 0-5, expects steppers to be setup in order from 0 to 5)
 * @param {number} type One of this.STEPPER.TYPE.*
 * @param {number} stepsPerRev Number of steps motor takes to make one revolution
 * @param {number} dirOrMotor1Pin If using EasyDriver type stepper driver, this is direction pin, otherwise it is motor 1 pin
 * @param {number} stepOrMotor2Pin If using EasyDriver type stepper driver, this is step pin, otherwise it is motor 2 pin
 * @param {number} [motor3Pin] Only required if type == this.STEPPER.TYPE.FOUR_WIRE
 * @param {number} [motor4Pin] Only required if type == this.STEPPER.TYPE.FOUR_WIRE
 */

Board.prototype.stepperConfig = function(deviceNum, type, stepsPerRev, dirOrMotor1Pin, stepOrMotor2Pin, motor3Pin, motor4Pin) {
  var data = [
    START_SYSEX,
    STEPPER,
    0x00, // STEPPER_CONFIG from firmware
    deviceNum,
    type,
    stepsPerRev & 0x7F, (stepsPerRev >> 7) & 0x7F,
    dirOrMotor1Pin,
    stepOrMotor2Pin
  ];
  if (type === this.STEPPER.TYPE.FOUR_WIRE) {
    data.push(motor3Pin, motor4Pin);
  }
  data.push(END_SYSEX);
  this.transport.write(new Buffer(data));
};

/**
 * Asks the arduino to move a stepper a number of steps at a specific speed
 * (and optionally with and acceleration and deceleration)
 * speed is in units of .01 rad/sec
 * accel and decel are in units of .01 rad/sec^2
 * TODO: verify the units of speed, accel, and decel
 * @param {number} deviceNum Device number for the stepper (range 0-5)
 * @param {number} direction One of this.STEPPER.DIRECTION.*
 * @param {number} steps Number of steps to make
 * @param {number} speed
 * @param {number|function} accel Acceleration or if accel and decel are not used, then it can be the callback
 * @param {number} [decel]
 * @param {function} [callback]
 */

Board.prototype.stepperStep = function(deviceNum, direction, steps, speed, accel, decel, callback) {
  if (typeof accel === "function") {
    callback = accel;
    accel = 0;
    decel = 0;
  }

  var data = [
    START_SYSEX,
    STEPPER,
    0x01, // STEPPER_STEP from firmware
    deviceNum,
    direction, // one of this.STEPPER.DIRECTION.*
    steps & 0x7F, (steps >> 7) & 0x7F, (steps >> 14) & 0x7f,
    speed & 0x7F, (speed >> 7) & 0x7F
  ];
  if (accel > 0 || decel > 0) {
    data.push(
      accel & 0x7F, (accel >> 7) & 0x7F,
      decel & 0x7F, (decel >> 7) & 0x7F
    );
  }
  data.push(END_SYSEX);
  this.transport.write(new Buffer(data));
  this.once("stepper-done-" + deviceNum, callback);
};

/**
 * Send SYSTEM_RESET to arduino
 */

Board.prototype.reset = function() {
  this.transport.write(new Buffer([SYSTEM_RESET]));
};

// For backwards compatibility
Board.Board = Board;
Board.SYSEX_RESPONSE = SYSEX_RESPONSE;
Board.MIDI_RESPONSE = MIDI_RESPONSE;

module.exports = Board;
