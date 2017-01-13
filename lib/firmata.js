"use strict";

// Built-in Dependencies
const Emitter = require("events").EventEmitter;

// Internal Dependencies
const Encoder7Bit = require("./encoder7bit");
const OneWireUtils = require("./onewireutils");
const com = require("./com");
// Program specifics
const i2cActive = new Map();

/**
 * constants
 */

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
const STRING_DATA = 0x71;
const SYSTEM_RESET = 0xFF;

const MAX_PIN_COUNT = 128;

/**
 * MIDI_RESPONSE contains functions to be called when we receive a MIDI message from the arduino.
 * used as a switch object as seen here http://james.padolsey.com/javascript/how-to-avoid-switch-case-syndrome/
 * @private
 */

const MIDI_RESPONSE = {};

/**
 * Handles a REPORT_VERSION response and emits the reportversion event.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

MIDI_RESPONSE[REPORT_VERSION] = board => {
  board.version.major = board.currentBuffer[1];
  board.version.minor = board.currentBuffer[2];
  board.emit("reportversion");
};

/**
 * Handles a ANALOG_MESSAGE response and emits "analog-read" and "analog-read-"+n events where n is the pin number.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

MIDI_RESPONSE[ANALOG_MESSAGE] = board => {
  const pin = board.currentBuffer[0] & 0x0F;
  const value = board.currentBuffer[1] | (board.currentBuffer[2] << 7);

  if (board.pins[board.analogPins[pin]]) {
    board.pins[board.analogPins[pin]].value = value;
  }

  board.emit(`analog-read-${pin}`, value);
  board.emit("analog-read", {
    pin,
    value,
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

MIDI_RESPONSE[DIGITAL_MESSAGE] = board => {
  const port = (board.currentBuffer[0] & 0x0F);
  const portValue = board.currentBuffer[1] | (board.currentBuffer[2] << 7);

  for (let i = 0; i < 8; i++) {
    const pinNumber = 8 * port + i;
    const pin = board.pins[pinNumber];
    const bit = 1 << i;

    if (pin && (pin.mode === board.MODES.INPUT || pin.mode === board.MODES.PULLUP)) {
      pin.value = (portValue >> (i & 0x07)) & 0x01;

      if (pin.value) {
        board.ports[port] |= bit;
      } else {
        board.ports[port] &= ~bit;
      }

      board.emit(`digital-read-${pinNumber}`, pin.value);
      board.emit("digital-read", {
        pin: pinNumber,
        value: pin.value,
      });
    }
  }
};

/**
 * SYSEX_RESPONSE contains functions to be called when we receive a SYSEX message from the arduino.
 * used as a switch object as seen here http://james.padolsey.com/javascript/how-to-avoid-switch-case-syndrome/
 * @private
 */

const SYSEX_RESPONSE = {};

/**
 * Handles a QUERY_FIRMWARE response and emits the "queryfirmware" event
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[QUERY_FIRMWARE] = board => {
  const length = board.currentBuffer.length - 2;
  const buffer = new Buffer(Math.round((length - 4) / 2));
  let byte = 0;
  let offset = 0;

  for (let i = 4; i < length; i += 2) {
    byte = ((board.currentBuffer[i] & 0x7F) | ((board.currentBuffer[i + 1] & 0x7F) << 7)) & 0xFF;
    buffer.writeUInt8(byte, offset++);
  }

  board.firmware = {
    name: buffer.toString(),
    version: {
      major: board.currentBuffer[2],
      minor: board.currentBuffer[3],
    },
  };

  board.emit("queryfirmware");
};

/**
 * Handles a CAPABILITY_RESPONSE response and emits the "capability-query" event
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[CAPABILITY_RESPONSE] = board => {
  const modes = Object.keys(board.MODES).map(key => board.MODES[key]);
  let capability = 0;

  function supportedModes(capability) {
    return modes.reduce((accum, mode, index) => {
      if (capability & (1 << mode)) {
        accum.push(mode);
      }
      return accum;
    }, []);
  }

  // Only create pins if none have been previously created on the instance.
  if (!board.pins.length) {
    for (let i = 2, n = 0; i < board.currentBuffer.length - 1; i++) {
      if (board.currentBuffer[i] === 127) {
        board.pins.push({
          supportedModes: supportedModes(capability),
          mode: undefined,
          value: 0,
          report: 1,
        });
        capability = 0;
        n = 0;
        continue;
      }
      if (n === 0) {
        capability |= (1 << board.currentBuffer[i]);
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

SYSEX_RESPONSE[PIN_STATE_RESPONSE] = board => {
  const pin = board.currentBuffer[2];
  board.pins[pin].mode = board.currentBuffer[3];
  board.pins[pin].state = board.currentBuffer[4];
  if (board.currentBuffer.length > 6) {
    board.pins[pin].state |= (board.currentBuffer[5] << 7);
  }
  if (board.currentBuffer.length > 7) {
    board.pins[pin].state |= (board.currentBuffer[6] << 14);
  }
  board.emit(`pin-state-${pin}`);
};

/**
 * Handles a ANALOG_MAPPING_RESPONSE response and emits the "analog-mapping-query" event.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[ANALOG_MAPPING_RESPONSE] = board => {
  let pin = 0;
  let currentValue;
  for (let i = 2; i < board.currentBuffer.length - 1; i++) {
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

SYSEX_RESPONSE[I2C_REPLY] = board => {
  const reply = [];
  const address = (board.currentBuffer[2] & 0x7F) | ((board.currentBuffer[3] & 0x7F) << 7);
  const register = (board.currentBuffer[4] & 0x7F) | ((board.currentBuffer[5] & 0x7F) << 7);

  for (let i = 6, length = board.currentBuffer.length - 1; i < length; i += 2) {
    reply.push(board.currentBuffer[i] | (board.currentBuffer[i + 1] << 7));
  }

  board.emit(`I2C-reply-${address}-${register}`, reply);
};

SYSEX_RESPONSE[ONEWIRE_DATA] = board => {
  const subCommand = board.currentBuffer[2];

  if (!SYSEX_RESPONSE[subCommand]) {
    return;
  }

  SYSEX_RESPONSE[subCommand](board);
};

SYSEX_RESPONSE[ONEWIRE_SEARCH_REPLY] = board => {
  const pin = board.currentBuffer[3];
  const replyBuffer = board.currentBuffer.slice(4, board.currentBuffer.length - 1);

  board.emit(`1-wire-search-reply-${pin}`, OneWireUtils.readDevices(replyBuffer));
};

SYSEX_RESPONSE[ONEWIRE_SEARCH_ALARMS_REPLY] = board => {
  const pin = board.currentBuffer[3];
  const replyBuffer = board.currentBuffer.slice(4, board.currentBuffer.length - 1);

  board.emit(`1-wire-search-alarms-reply-${pin}`, OneWireUtils.readDevices(replyBuffer));
};

SYSEX_RESPONSE[ONEWIRE_READ_REPLY] = board => {
  const encoded = board.currentBuffer.slice(4, board.currentBuffer.length - 1);
  const decoded = Encoder7Bit.from7BitArray(encoded);
  const correlationId = (decoded[1] << 8) | decoded[0];

  board.emit(`1-wire-read-reply-${correlationId}`, decoded.slice(2));
};

/**
 * Handles a STRING_DATA response and logs the string to the console.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[STRING_DATA] = board => {
  const string = new Buffer(board.currentBuffer.slice(2, -1)).toString("utf8").replace(/\0/g, "");
  board.emit("string", string);
};

/**
 * Response from pingRead
 */

SYSEX_RESPONSE[PING_READ] = board => {
  const pin = (board.currentBuffer[2] & 0x7F) | ((board.currentBuffer[3] & 0x7F) << 7);
  const durationBuffer = [
    (board.currentBuffer[4] & 0x7F) | ((board.currentBuffer[5] & 0x7F) << 7), (board.currentBuffer[6] & 0x7F) | ((board.currentBuffer[7] & 0x7F) << 7), (board.currentBuffer[8] & 0x7F) | ((board.currentBuffer[9] & 0x7F) << 7), (board.currentBuffer[10] & 0x7F) | ((board.currentBuffer[11] & 0x7F) << 7)
  ];
  const duration = ((durationBuffer[0] << 24) +
    (durationBuffer[1] << 16) +
    (durationBuffer[2] << 8) +
    (durationBuffer[3]));
  board.emit(`ping-read-${pin}`, duration);
};

/**
 * Handles the message from a stepper completing move
 * @param {Board} board
 */

SYSEX_RESPONSE[STEPPER] = board => {
  const deviceNum = board.currentBuffer[2];
  board.emit(`stepper-done-${deviceNum}`, true);
};

/**
 * Handles a SERIAL_REPLY response and emits the "serial-data-"+n event where n is the id of the
 * serial port.
 * The event is passed the buffer of data sent from the serial device
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[SERIAL_MESSAGE] = board => {
  const command = board.currentBuffer[2] & 0xF0;
  const portId = board.currentBuffer[2] & 0x0F;
  const reply = [];

  if (command === SERIAL_REPLY) {
    for (let i = 3, len = board.currentBuffer.length; i < len - 1; i += 2) {
      reply.push((board.currentBuffer[i + 1] << 7) | board.currentBuffer[i]);
    }
    board.emit(`serial-data-${portId}`, reply);
  }
};

/**
 * @class The Board object represents an arduino board.
 * @augments EventEmitter
 * @param {String} port This is the serial port the arduino is connected to.
 * @param {function} function A function to be called when the arduino is ready to communicate.
 * @property MODES All the modes available for pins on this arduino board.
 * @property I2C_MODES All the I2C modes available.
 * @property SERIAL_MODES All the Serial modes available.
 * @property SERIAL_PORT_ID ID values to pass as the portId parameter when calling serialConfig.
 * @property HIGH A constant to set a pins value to HIGH when the pin is set to an output.
 * @property LOW A constant to set a pins value to LOW when the pin is set to an output.
 * @property pins An array of pin object literals.
 * @property analogPins An array of analog pins and their corresponding indexes in the pins array.
 * @property version An object indicating the major and minor version of the firmware currently running.
 * @property firmware An object indicateon the name, major and minor version of the firmware currently running.
 * @property currentBuffer An array holding the current bytes received from the arduino.
 * @property {SerialPort} sp The serial port object used to communicate with the arduino.
 */

class Board extends Emitter {
  constructor(port, options, callback) {
    super();

    if (typeof options === "function" || typeof options === "undefined") {
      callback = options;
      options = {};
    }

    const board = this;
    const defaults = {
      reportVersionTimeout: 5000,
      samplingInterval: 19,
      serialport: {
        baudRate: 57600,
        bufferSize: 256,
      },
    };

    const settings = Object.assign({}, defaults, options);

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
      SERIAL: 0x0A,
      PULLUP: 0x0B,
      IGNORE: 0x7F,
      PING_READ: 0x75,
      UNKOWN: 0x10,
    };

    this.I2C_MODES = {
      WRITE: 0,
      READ: 1,
      CONTINUOUS_READ: 2,
      STOP_READING: 3,
    };

    this.STEPPER = {
      TYPE: {
        DRIVER: 1,
        TWO_WIRE: 2,
        FOUR_WIRE: 4,
      },
      RUNSTATE: {
        STOP: 0,
        ACCEL: 1,
        DECEL: 2,
        RUN: 3,
      },
      DIRECTION: {
        CCW: 0,
        CW: 1,
      },
    };

    this.SERIAL_MODES = {
      CONTINUOUS_READ: 0x00,
      STOP_READING: 0x01,
    };

    // ids for hardware and software serial ports on the board
    this.SERIAL_PORT_IDs = {
      HW_SERIAL0: 0x00,
      HW_SERIAL1: 0x01,
      HW_SERIAL2: 0x02,
      HW_SERIAL3: 0x03,
      SW_SERIAL0: 0x08,
      SW_SERIAL1: 0x09,
      SW_SERIAL2: 0x10,
      SW_SERIAL3: 0x11,

      // Default can be used by depender libraries to key on a
      // single property name when negotiating ports.
      //
      // Firmata elects SW_SERIAL0: 0x08 as its DEFAULT
      DEFAULT: 0x08,
    };

    // map to the pin resolution value in the capability query response
    this.SERIAL_PIN_TYPES = {
      RES_RX0: 0x00,
      RES_TX0: 0x01,
      RES_RX1: 0x02,
      RES_TX1: 0x03,
      RES_RX2: 0x04,
      RES_TX2: 0x05,
      RES_RX3: 0x06,
      RES_TX3: 0x07,
    };

    this.HIGH = 1;
    this.LOW = 0;
    this.pins = [];
    this.ports = Array(16).fill(0);
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
      this.transport = new com.SerialPort(port, settings.serialport);
    }

    // For backward compat
    this.sp = this.transport;

    this.transport.on("close", () => {
      this.emit("close");
    });

    this.transport.on("disconnect", () => {
      this.emit("disconnect");
    });

    this.transport.on("open", () => {
      this.emit("open");
      // Legacy
      this.emit("connect");
    });

    this.transport.on("error", error => {
      if (!this.isReady && typeof callback === "function") {
        callback(error);
      } else {
        this.emit("error", error);
      }
    });

    this.transport.on("data", data => {
      let byte;
      let currByte;
      let response;
      let first;
      let last;
      let handler;

      for (let i = 0; i < data.length; i++) {
        byte = data[i];
        // we dont want to push 0 as the first byte on our buffer
        if (this.currentBuffer.length === 0 && byte === 0) {
          continue;
        } else {
          this.currentBuffer.push(byte);

          first = this.currentBuffer[0];
          last = this.currentBuffer[this.currentBuffer.length - 1];

          // [START_SYSEX, ... END_SYSEX]
          if (first === START_SYSEX && last === END_SYSEX) {

            handler = SYSEX_RESPONSE[this.currentBuffer[1]];

            // Ensure a valid SYSEX_RESPONSE handler exists
            // Only process these AFTER the REPORT_VERSION
            // message has been received and processed.
            if (handler && this.versionReceived) {
              handler(this);
            }

            // It is possible for the board to have
            // existing activity from a previous run
            // that will leave any of the following
            // active:
            //
            //    - ANALOG_MESSAGE
            //    - SERIAL_READ
            //    - I2C_REQUEST, CONTINUOUS_READ
            //
            // This means that we will receive these
            // messages on transport "open", before any
            // handshake can occur. We MUST assert
            // that we will only process this buffer
            // AFTER the REPORT_VERSION message has
            // been received. Not doing so will result
            // in the appearance of the program "hanging".
            //
            // Since we cannot do anything with this data
            // until _after_ REPORT_VERSION, discard it.
            //
            this.currentBuffer.length = 0;

          } else if (first === START_SYSEX && (this.currentBuffer.length > 0)) {
            // we have a new command after an incomplete sysex command
            currByte = data[i];
            if (currByte > 0x7F) {
              this.currentBuffer.length = 0;
              this.currentBuffer.push(currByte);
            }
          } else if (first !== START_SYSEX) {
            // Check if data gets out of sync: first byte in buffer
            // must be a valid response if not START_SYSEX
            // Identify response on first byte
            response = first < START_SYSEX ? (first & START_SYSEX) : first;

            // Check if the first byte is possibly
            // a valid MIDI_RESPONSE (handler)
            if (response !== REPORT_VERSION &&
                response !== ANALOG_MESSAGE &&
                response !== DIGITAL_MESSAGE) {
              // If not valid, then we received garbage and can discard
              // whatever bytes have been been queued.
              this.currentBuffer.length = 0;
            }
          }

          // There are 3 bytes in the buffer and the first is not START_SYSEX:
          // Might have a MIDI Command
          if (this.currentBuffer.length === 3 && first !== START_SYSEX) {
            // response bytes under 0xF0 we have a multi byte operation
            response = first < START_SYSEX ? (first & START_SYSEX) : first;

            if (MIDI_RESPONSE[response]) {
              // It's ok that this.versionReceived will be set to
              // true every time a valid MIDI_RESPONSE is received.
              // This condition is necessary to ensure that REPORT_VERSION
              // is called first.
              if (this.versionReceived || first === REPORT_VERSION) {
                this.versionReceived = true;
                MIDI_RESPONSE[response](this);
              }
              this.currentBuffer.length = 0;
            } else {
              // A bad serial read must have happened.
              // Reseting the buffer will allow recovery.
              this.currentBuffer.length = 0;
            }
          }
        }
      }
    });

    // if we have not received the version within the alotted
    // time specified by the reportVersionTimeout (user or default),
    // then send an explicit request for it.
    this.reportVersionTimeoutId = setTimeout(() => {
      if (this.versionReceived === false) {
        this.reportVersion(() => {});
        this.queryFirmware(() => {});
      }
    }, settings.reportVersionTimeout);

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
            for (let i = 0; i < (settings.pinCount || MAX_PIN_COUNT); i++) {
              let analogChannel = this.analogPins.indexOf(i);
              if (analogChannel < 0) {
                analogChannel = 127;
              }
              this.pins.push({supportedModes: [], analogChannel});
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
  }

  /**
   * Asks the arduino to tell us its version.
   * @param {function} callback A function to be called when the arduino has reported its version.
   */

  reportVersion(callback) {
    this.once("reportversion", callback);
    this.transport.write(new Buffer([REPORT_VERSION]));
  }

  /**
   * Asks the arduino to tell us its firmware version.
   * @param {function} callback A function to be called when the arduino has reported its firmware version.
   */

  queryFirmware(callback) {
    this.once("queryfirmware", callback);
    this.transport.write(new Buffer([START_SYSEX, QUERY_FIRMWARE, END_SYSEX]));
  }

  /**
   * Asks the arduino to read analog data. Turn on reporting for this pin.
   * @param {number} pin The pin to read analog data
   * @param {function} callback A function to call when we have the analag data.
   */

  analogRead(pin, callback) {
    this.reportAnalogPin(pin, 1);
    this.addListener(`analog-read-${pin}`, callback);
  }

  /**
   * Asks the arduino to write an analog message.
   * @param {number} pin The pin to write analog data to.
   * @param {nubmer} value The data to write to the pin between 0 and 255.
   */

  analogWrite(pin, value) {
    const data = [];

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
  }

  /**
   * Set a pin to SERVO mode with an explicit PWM range.
   *
   * @param {number} pin The pin the servo is connected to
   * @param {number} min A 14-bit signed int.
   * @param {number} max A 14-bit signed int.
   */

  servoConfig(pin, min, max) {
    let temp;

    if (typeof pin === "object" && pin !== null) {
      temp = pin;
      pin = temp.pin;
      min = temp.min;
      max = temp.max;
    }

    if (typeof pin === "undefined") {
      throw new Error("servoConfig: pin must be specified");
    }

    if (typeof min === "undefined") {
      throw new Error("servoConfig: min must be specified");
    }

    if (typeof max === "undefined") {
      throw new Error("servoConfig: max must be specified");
    }

    // [0]  START_SYSEX  (0xF0)
    // [1]  SERVO_CONFIG (0x70)
    // [2]  pin number   (0-127)
    // [3]  minPulse LSB (0-6)
    // [4]  minPulse MSB (7-13)
    // [5]  maxPulse LSB (0-6)
    // [6]  maxPulse MSB (7-13)
    // [7]  END_SYSEX    (0xF7)

    const data = [
      START_SYSEX,
      SERVO_CONFIG,
      pin,
      min & 0x7F,
      (min >> 7) & 0x7F,
      max & 0x7F,
      (max >> 7) & 0x7F,
      END_SYSEX,
    ];

    this.pins[pin].mode = this.MODES.SERVO;
    this.transport.write(new Buffer(data));
  }

  /**
   * Asks the arduino to move a servo
   * @param {number} pin The pin the servo is connected to
   * @param {number} value The degrees to move the servo to.
   */

  servoWrite(pin, value) {
    // Values less than 544 will be treated as angles in degrees
    // (valid values in microseconds are handled as microseconds)
    this.analogWrite(pin, value);
  }

  /**
   * Asks the arduino to set the pin to a certain mode.
   * @param {number} pin The pin you want to change the mode of.
   * @param {number} mode The mode you want to set. Must be one of board.MODES
   */

  pinMode(pin, mode) {
    this.pins[pin].mode = mode;
    this.transport.write(new Buffer([PIN_MODE, pin, mode]));
  }

  /**
   * Asks the arduino to write a value to a digital pin
   * @param {number} pin The pin you want to write a value to.
   * @param {value} value The value you want to write. Must be board.HIGH or board.LOW
   */

  digitalWrite(pin, value) {
    const port = pin >> 3;
    const bit = 1 << (pin & 0x07);

    this.pins[pin].value = value;

    if (value) {
      this.ports[port] |= bit;
    } else {
      this.ports[port] &= ~bit;
    }

    this.transport.write(new Buffer([
      DIGITAL_MESSAGE | port,
      this.ports[port] & 0x7F,
      (this.ports[port] >> 7) & 0x7F
    ]));
  }

  /**
   * Asks the arduino to read digital data. Turn on reporting for this pin's port.
   *
   * @param {number} pin The pin to read data from
   * @param {function} callback The function to call when data has been received
   */

  digitalRead(pin, callback) {
    this.reportDigitalPin(pin, 1);
    this.addListener(`digital-read-${pin}`, callback);
  }

  /**
   * Asks the arduino to tell us its capabilities
   * @param {function} callback A function to call when we receive the capabilities
   */

  queryCapabilities(callback) {
    this.once("capability-query", callback);
    this.transport.write(new Buffer([START_SYSEX, CAPABILITY_QUERY, END_SYSEX]));
  }

  /**
   * Asks the arduino to tell us its analog pin mapping
   * @param {function} callback A function to call when we receive the pin mappings.
   */

  queryAnalogMapping(callback) {
    this.once("analog-mapping-query", callback);
    this.transport.write(new Buffer([START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]));
  }

  /**
   * Asks the arduino to tell us the current state of a pin
   * @param {number} pin The pin we want to the know the state of
   * @param {function} callback A function to call when we receive the pin state.
   */

  queryPinState(pin, callback) {
    this.once(`pin-state-${pin}`, callback);
    this.transport.write(new Buffer([START_SYSEX, PIN_STATE_QUERY, pin, END_SYSEX]));
  }

  /**
   * Sends a string to the arduino
   * @param {String} string to send to the device
   */

  sendString(string) {
    const bytes = new Buffer(`${string}\0`, "utf8");
    const data = [];
    data.push(START_SYSEX);
    data.push(STRING_DATA);
    for (let i = 0, length = bytes.length; i < length; i++) {
      data.push(bytes[i] & 0x7F);
      data.push((bytes[i] >> 7) & 0x7F);
    }
    data.push(END_SYSEX);
    this.transport.write(data);
  }

  /**
   * Sends a I2C config request to the arduino board with an optional
   * value in microseconds to delay an I2C Read.  Must be called before
   * an I2C Read or Write
   * @param {number} delay in microseconds to set for I2C Read
   */

  sendI2CConfig(delay) {
    return this.i2cConfig(delay);
  }

  /**
   * Enable I2C with an optional read delay. Must be called before
   * an I2C Read or Write
   *
   * Supersedes sendI2CConfig
   *
   * @param {number} delay in microseconds to set for I2C Read
   *
   * or
   *
   * @param {object} with a single property `delay`
   */

  i2cConfig(options) {
    let settings = i2cActive.get(this);
    let delay;

    if (!settings) {
      settings = {
        /*
          Keys will be I2C peripheral addresses
         */
      };
      i2cActive.set(this, settings);
    }

    if (typeof options === "number") {
      delay = options;
    } else {
      if (typeof options === "object" && options !== null) {
        delay = Number(options.delay);

        // When an address was explicitly specified, there may also be
        // peripheral specific instructions in the config.
        if (typeof options.address !== "undefined") {

          if (!settings[options.address]) {
            settings[options.address] = {
              stopTX: true,
            };
          }

          // When settings have been explicitly provided, just bulk assign
          // them to the existing settings, even if that's empty. This
          // allows for reconfiguration as needed.
          if (typeof options.settings) {
            Object.assign(settings[options.address], options.settings);
            /*
              - stopTX: true | false
                  Set `stopTX` to `false` if this peripheral
                  expects Wire to keep the transmission connection alive between
                  setting a register and requesting bytes.

                  Defaults to `true`.
             */
          }
        }
      }
    }

    settings.delay = delay = delay || 0;

    i2cRequest(this, [
      START_SYSEX,
      I2C_CONFIG,
      delay & 0xFF, (delay >> 8) & 0xFF,
      END_SYSEX,
    ]);

    return this;
  }

  /**
   * Asks the arduino to send an I2C request to a device
   * @param {number} slaveAddress The address of the I2C device
   * @param {Array} bytes The bytes to send to the device
   */

  sendI2CWriteRequest(slaveAddress, bytes) {
    const data = [];
    bytes = bytes || [];

    data.push(
      START_SYSEX,
      I2C_REQUEST,
      slaveAddress,
      this.I2C_MODES.WRITE << 3
    );

    for (let i = 0, length = bytes.length; i < length; i++) {
      data.push(
        bytes[i] & 0x7F, (bytes[i] >> 7) & 0x7F
      );
    }

    data.push(END_SYSEX);

    i2cRequest(this, data);
  }

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

  i2cWrite(address, registerOrData, inBytes) {
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
    let bytes;
    const data = [
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

    for (let i = 0, length = bytes.length; i < length; i++) {
      data.push(
        bytes[i] & 0x7F, (bytes[i] >> 7) & 0x7F
      );
    }

    data.push(END_SYSEX);

    i2cRequest(this, data);

    return this;
  }

  /**
   * Write data to a register
   *
   * @param {number} address    The address of the I2C device.
   * @param {number} register   The register.
   * @param {number} byte       The byte value to write.
   *
   */

  i2cWriteReg(address, register, byte) {
    i2cRequest(this, [
      START_SYSEX,
      I2C_REQUEST,
      address,
      this.I2C_MODES.WRITE << 3,
      // register
      register & 0x7F, (register >> 7) & 0x7F,
      // byte
      byte & 0x7F, (byte >> 7) & 0x7F,
      END_SYSEX,
    ]);

    return this;
  }

  /**
   * Asks the arduino to request bytes from an I2C device
   * @param {number} slaveAddress The address of the I2C device
   * @param {number} numBytes The number of bytes to receive.
   * @param {function} callback A function to call when we have received the bytes.
   */

  sendI2CReadRequest(address, numBytes, callback) {
    i2cRequest(this, [
      START_SYSEX,
      I2C_REQUEST,
      address,
      this.I2C_MODES.READ << 3,
      numBytes & 0x7F, (numBytes >> 7) & 0x7F,
      END_SYSEX,
    ]);
    this.once(`I2C-reply-${address}-0` , callback);
  }

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

  i2cRead(address, register, bytesToRead, callback) {

    if (arguments.length === 3 &&
        typeof register === "number" &&
        typeof bytesToRead === "function") {
      callback = bytesToRead;
      bytesToRead = register;
      register = null;
    }

    let event = `I2C-reply-${address}-`;
    const data = [
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

    i2cRequest(this, data);

    return this;
  }

  /**
   * Stop continuous reading of the specified I2C address or register.
   *
   * @param {object} options Options:
   *   bus {number} The I2C bus (on supported platforms)
   *   address {number} The I2C peripheral address to stop reading.
   *
   * @param {number} address The I2C peripheral address to stop reading.
   */

  i2cStop(options) {
    // There may be more values in the future
    // var options = {};

    // null or undefined? Do nothing.
    if (options == null) {
      return this;
    }

    if (typeof options === "number") {
      options = {
        address: options
      };
    }

    const data = [
      START_SYSEX,
      I2C_REQUEST,
      options.address,
      this.I2C_MODES.STOP_READING << 3,
      END_SYSEX,
    ];

    this.transport.write(new Buffer(data));

    Object.keys(this._events).forEach(function(event) {
      if (event.startsWith(`I2C-reply-${options.address}`)) {
        this.removeAllListeners(event);
      }
    }, this);
  }

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


  i2cReadOnce(address, register, bytesToRead, callback) {

    if (arguments.length === 3 &&
        typeof register === "number" &&
        typeof bytesToRead === "function") {
      callback = bytesToRead;
      bytesToRead = register;
      register = null;
    }

    let event = `I2C-reply-${address}-`;
    const data = [
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

    i2cRequest(this, data);

    return this;
  }

  // CONTINUOUS_READ

  /**
   * Configure the passed pin as the controller in a 1-wire bus.
   * Pass as enableParasiticPower true if you want the data pin to power the bus.
   * @param pin
   * @param enableParasiticPower
   */

  sendOneWireConfig(pin, enableParasiticPower) {
    this.transport.write(new Buffer([START_SYSEX, ONEWIRE_DATA, ONEWIRE_CONFIG_REQUEST, pin, enableParasiticPower ? 0x01 : 0x00, END_SYSEX]));
  }

  /**
   * Searches for 1-wire devices on the bus.  The passed callback should accept
   * and error argument and an array of device identifiers.
   * @param pin
   * @param callback
   */

  sendOneWireSearch(pin, callback) {
    this._sendOneWireSearch(ONEWIRE_SEARCH_REQUEST, `1-wire-search-reply-${pin}`, pin, callback);
  }

  /**
   * Searches for 1-wire devices on the bus in an alarmed state.  The passed callback
   * should accept and error argument and an array of device identifiers.
   * @param pin
   * @param callback
   */

  sendOneWireAlarmsSearch(pin, callback) {
    this._sendOneWireSearch(ONEWIRE_SEARCH_ALARMS_REQUEST, `1-wire-search-alarms-reply-${pin}`, pin, callback);
  }

  _sendOneWireSearch(type, event, pin, callback) {
    this.transport.write(new Buffer([START_SYSEX, ONEWIRE_DATA, type, pin, END_SYSEX]));

    const searchTimeout = setTimeout(() => {
      callback(new Error("1-Wire device search timeout - are you running ConfigurableFirmata?"));
    }, 5000);
    this.once(event, devices => {
      clearTimeout(searchTimeout);

      callback(null, devices);
    });
  }

  /**
   * Reads data from a device on the bus and invokes the passed callback.
   *
   * N.b. ConfigurableFirmata will issue the 1-wire select command internally.
   * @param pin
   * @param device
   * @param numBytesToRead
   * @param callback
   */

  sendOneWireRead(pin, device, numBytesToRead, callback) {
    const correlationId = Math.floor(Math.random() * 255);
    const readTimeout = setTimeout(() => {
      callback(new Error("1-Wire device read timeout - are you running ConfigurableFirmata?"));
    }, 5000);
    this._sendOneWireRequest(pin, ONEWIRE_READ_REQUEST_BIT, device, numBytesToRead, correlationId, null, null, `1-wire-read-reply-${correlationId}`, data => {
      clearTimeout(readTimeout);

      callback(null, data);
    });
  }

  /**
   * Resets all devices on the bus.
   * @param pin
   */

  sendOneWireReset(pin) {
    this._sendOneWireRequest(pin, ONEWIRE_RESET_REQUEST_BIT);
  }

  /**
   * Writes data to the bus to be received by the passed device.  The device
   * should be obtained from a previous call to sendOneWireSearch.
   *
   * N.b. ConfigurableFirmata will issue the 1-wire select command internally.
   * @param pin
   * @param device
   * @param data
   */

  sendOneWireWrite(pin, device, data) {
    this._sendOneWireRequest(pin, ONEWIRE_WRITE_REQUEST_BIT, device, null, null, null, Array.isArray(data) ? data : [data]);
  }

  /**
   * Tells firmata to not do anything for the passed amount of ms.  For when you
   * need to give a device attached to the bus time to do a calculation.
   * @param pin
   */

  sendOneWireDelay(pin, delay) {
    this._sendOneWireRequest(pin, ONEWIRE_DELAY_REQUEST_BIT, null, null, null, delay);
  }

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

  sendOneWireWriteAndRead(pin, device, data, numBytesToRead, callback) {
    const correlationId = Math.floor(Math.random() * 255);
    const readTimeout = setTimeout(() => {
      callback(new Error("1-Wire device read timeout - are you running ConfigurableFirmata?"));
    }, 5000);
    this._sendOneWireRequest(pin, ONEWIRE_WRITE_REQUEST_BIT | ONEWIRE_READ_REQUEST_BIT, device, numBytesToRead, correlationId, null, Array.isArray(data) ? data : [data], `1-wire-read-reply-${correlationId}`, data => {
      clearTimeout(readTimeout);

      callback(null, data);
    });
  }

  // see http://firmata.org/wiki/Proposals#OneWire_Proposal
  _sendOneWireRequest(
    pin,
    subcommand,
    device,
    numBytesToRead,
    correlationId,
    delay,
    dataToWrite,
    event,
    callback) {
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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
      dataToWrite.forEach(byte => {
        bytes.push(byte);
      });
    }

    let output = [START_SYSEX, ONEWIRE_DATA, subcommand, pin];
    output = output.concat(Encoder7Bit.to7BitArray(bytes));
    output.push(END_SYSEX);

    this.transport.write(new Buffer(output));

    if (event && callback) {
      this.once(event, callback);
    }
  }

  /**
   * Set sampling interval in millis. Default is 19 ms
   * @param {number} interval The sampling interval in ms > 10
   */

  setSamplingInterval(interval) {
    const safeint = interval < 10 ? 10 : (interval > 65535 ? 65535 : interval); // constrained
    this.settings.samplingInterval = safeint;
    this.transport.write(new Buffer([START_SYSEX, SAMPLING_INTERVAL, (safeint & 0x7F), ((safeint >> 7) & 0x7F), END_SYSEX]));
  }

  /**
   * Get sampling interval in millis. Default is 19 ms
   */

  getSamplingInterval(interval) {
    return this.settings.samplingInterval;
  }

  /**
   * Set reporting on pin
   * @param {number} pin The pin to turn on/off reporting
   * @param {number} value Binary value to turn reporting on/off
   */

  reportAnalogPin(pin, value) {
    if (value === 0 || value === 1) {
      this.pins[this.analogPins[pin]].report = value;
      this.transport.write(new Buffer([REPORT_ANALOG | pin, value]));
    }
  }

  /**
   * Set reporting on pin
   * @param {number} pin The pin to turn on/off reporting
   * @param {number} value Binary value to turn reporting on/off
   */

  reportDigitalPin(pin, value) {
    const port = pin >> 3;
    if (value === 0 || value === 1) {
      this.pins[pin].report = value;
      this.transport.write(new Buffer([REPORT_DIGITAL | port, value]));
    }
  }

  /**
   *
   *
   */

  pingRead(opts, callback) {

    if (this.pins[opts.pin].supportedModes.indexOf(PING_READ) === -1) {
      throw new Error("Please upload PingFirmata to the board");
    }

    const pin = opts.pin;
    const value = opts.value;
    const pulseOut = opts.pulseOut || 0;
    const timeout = opts.timeout || 1000000;
    const pulseBytes = [
      (pulseOut >> 24) & 0xFF,
      (pulseOut >> 16) & 0xFF,
      (pulseOut >> 8) & 0XFF,
      (pulseOut & 0xFF),
    ];
    const timeoutBytes = [
      (timeout >> 24) & 0xFF,
      (timeout >> 16) & 0xFF,
      (timeout >> 8) & 0XFF,
      (timeout & 0xFF),
    ];
    const data = [
      START_SYSEX,
      PING_READ,
      pin,
      value,
      pulseBytes[0] & 0x7F, (pulseBytes[0] >> 7) & 0x7F,
      pulseBytes[1] & 0x7F, (pulseBytes[1] >> 7) & 0x7F,
      pulseBytes[2] & 0x7F, (pulseBytes[2] >> 7) & 0x7F,
      pulseBytes[3] & 0x7F, (pulseBytes[3] >> 7) & 0x7F,
      timeoutBytes[0] & 0x7F, (timeoutBytes[0] >> 7) & 0x7F,
      timeoutBytes[1] & 0x7F, (timeoutBytes[1] >> 7) & 0x7F,
      timeoutBytes[2] & 0x7F, (timeoutBytes[2] >> 7) & 0x7F,
      timeoutBytes[3] & 0x7F, (timeoutBytes[3] >> 7) & 0x7F,
      END_SYSEX,
    ];
    this.transport.write(new Buffer(data));
    this.once(`ping-read-${pin}`, callback);
  }

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

  stepperConfig(
    deviceNum,
    type,
    stepsPerRev,
    dirOrMotor1Pin,
    stepOrMotor2Pin,
    motor3Pin,
    motor4Pin) {
    const data = [
      START_SYSEX,
      STEPPER,
      0x00, // STEPPER_CONFIG from firmware
      deviceNum,
      type,
      stepsPerRev & 0x7F, (stepsPerRev >> 7) & 0x7F,
      dirOrMotor1Pin,
      stepOrMotor2Pin,
    ];
    if (type === this.STEPPER.TYPE.FOUR_WIRE) {
      data.push(motor3Pin, motor4Pin);
    }
    data.push(END_SYSEX);
    this.transport.write(new Buffer(data));
  }

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

  stepperStep(deviceNum, direction, steps, speed, accel, decel, callback) {
    if (typeof accel === "function") {
      callback = accel;
      accel = 0;
      decel = 0;
    }

    const data = [
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
    this.once(`stepper-done-${deviceNum}`, callback);
  }

  /**
   * Asks the Arduino to configure a hardware or serial port.
   * @param {object} options Options:
   *   portId {number} The serial port to use (HW_SERIAL1, HW_SERIAL2, HW_SERIAL3, SW_SERIAL0,
   *   SW_SERIAL1, SW_SERIAL2, SW_SERIAL3)
   *   baud {number} The baud rate of the serial port
   *   rxPin {number} [SW Serial only] The RX pin of the SoftwareSerial instance
   *   txPin {number} [SW Serial only] The TX pin of the SoftwareSerial instance
   */

  serialConfig(options) {

    let portId;
    let baud;
    let rxPin;
    let txPin;

    if (typeof options === "object" && options !== null) {
      portId = options.portId;
      baud = options.baud;
      rxPin = options.rxPin;
      txPin = options.txPin;
    }

    if (typeof portId === "undefined") {
      throw new Error("portId must be specified, see SERIAL_PORT_IDs for options.");
    }

    baud = baud || 57600;

    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_CONFIG | portId,
      baud & 0x007F,
      (baud >> 7) & 0x007F,
      (baud >> 14) & 0x007F
    ];
    if (portId > 7 && typeof rxPin !== "undefined" && typeof txPin !== "undefined") {
      data.push(rxPin);
      data.push(txPin);
    } else if (portId > 7) {
      throw new Error("Both RX and TX pins must be defined when using Software Serial.");
    }

    data.push(END_SYSEX);
    this.transport.write(new Buffer(data));
  }

  /**
   * Write an array of bytes to the specified serial port.
   * @param {number} portId The serial port to write to.
   * @param {array} inBytes An array of bytes to write to the serial port.
   */

  serialWrite(portId, inBytes) {
    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_WRITE | portId,
    ];
    for (let i = 0, len = inBytes.length; i < len; i++) {
      data.push(inBytes[i] & 0x007F);
      data.push((inBytes[i] >> 7) & 0x007F);
    }
    data.push(END_SYSEX);
    if (data.length > 0) {
      this.transport.write(new Buffer(data));
    }
  }

  /**
   * Start continuous reading of the specified serial port. The port is checked for data each
   * iteration of the main Arduino loop.
   * @param {number} portId The serial port to start reading continuously.
   * @param {number} maxBytesToRead [Optional] The maximum number of bytes to read per iteration.
   * If there are less bytes in the buffer, the lesser number of bytes will be returned. A value of 0
   * indicates that all available bytes in the buffer should be read.
   * @param {function} callback A function to call when we have received the bytes.
   */

  serialRead(portId, maxBytesToRead, callback) {
    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_READ | portId,
      this.SERIAL_MODES.CONTINUOUS_READ
    ];

    if (arguments.length === 2 && typeof maxBytesToRead === "function") {
      callback = maxBytesToRead;
    } else {
      data.push(maxBytesToRead & 0x007F);
      data.push((maxBytesToRead >> 7) & 0x007F);
    }

    data.push(END_SYSEX);
    this.transport.write(new Buffer(data));

    this.on(`serial-data-${portId}`, callback);
  }

  /**
   * Stop continuous reading of the specified serial port. This does not close the port, it stops
   * reading it but keeps the port open.
   * @param {number} portId The serial port to stop reading.
   */

  serialStop(portId) {
    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_READ | portId,
      this.SERIAL_MODES.STOP_READING,
      END_SYSEX,
    ];
    this.transport.write(new Buffer(data));

    this.removeAllListeners(`serial-data-${portId}`);
  }

  /**
   * Close the specified serial port.
   * @param {number} portId The serial port to close.
   */

  serialClose(portId) {
    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_CLOSE | portId,
      END_SYSEX,
    ];
    this.transport.write(new Buffer(data));
  }

  /**
   * Flush the specified serial port. For hardware serial, this waits for the transmission of
   * outgoing serial data to complete. For software serial, this removed any buffered incoming serial
   * data.
   * @param {number} portId The serial port to flush.
   */

  serialFlush(portId) {
    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_FLUSH | portId,
      END_SYSEX,
    ];
    this.transport.write(new Buffer(data));
  }

  /**
   * For SoftwareSerial only. Only a single SoftwareSerial instance can read data at a time.
   * Call this method to set this port to be the reading port in the case there are multiple
   * SoftwareSerial instances.
   * @param {number} portId The serial port to listen on.
   */

  serialListen(portId) {
    // listen only applies to software serial ports
    if (portId < 8) {
      return;
    }
    const data = [
      START_SYSEX,
      SERIAL_MESSAGE,
      SERIAL_LISTEN | portId,
      END_SYSEX,
    ];
    this.transport.write(new Buffer(data));
  }

  /**
   * Allow user code to handle arbitrary sysex responses
   *
   * @param {number} commandByte The commandByte must be associated with some message
   *                             that's expected from the slave device. The handler is
   *                             called with an array of _raw_ data from the slave. Data
   *                             decoding must be done within the handler itself.
   *
   *                             Use Board.decode(data) to extract useful values from
   *                             the incoming response data.
   *
   *  @param {function} handler Function which handles receipt of responses matching
   *                            commandByte.
   */

  sysexResponse(commandByte, handler) {
    if (Board.SYSEX_RESPONSE[commandByte]) {
      throw new Error(`${commandByte} is not an available SYSEX_RESPONSE byte`);
    }

    Board.SYSEX_RESPONSE[commandByte] = board => {
      handler(board.currentBuffer.slice(2, -1));
    };

    return this;
  }

  /**
   * Allow user code to send arbitrary sysex messages
   *
   * @param {array} message The message array is expected to be all necessary bytes
   *                        between START_SYSEX and END_SYSEX (non-inclusive). It will
   *                        be assumed that the data in the message array is
   *                        already encoded as 2 7-bit bytes LSB first.
   *
   *
   */

  sysexCommand(message) {

    if (!message.length) {
      throw new Error("Sysex Command cannot be empty");
    }

    const data = message.slice();

    data.unshift(START_SYSEX);
    data.push(END_SYSEX);

    this.transport.write(new Buffer(data));
    return this;
  }

  /**
   * Send SYSTEM_RESET to arduino
   */

  reset() {
    this.transport.write(new Buffer([SYSTEM_RESET]));
  }

  /**
   * Board.isAcceptablePort Determines if a `port` object (from SerialPort.list(...))
   * is a valid Arduino (or similar) device.
   * @return {Boolean} true if port can be connected to by Firmata
   */

  static isAcceptablePort(port) {
    const rport = /usb|acm|^com/i;

    if (rport.test(port.comName)) {
      return true;
    }

    return false;
  }

  /**
   * Board.requestPort(callback) Request an acceptable port to connect to.
   * callback(error, port)
   */

  static requestPort(callback) {
    com.list((error, ports) => {
      const port = ports.find(port => {
        if (Board.isAcceptablePort(port)) {
          return port;
        }
      });

      if (port) {
        callback(null, port);
      } else {
        callback(new Error("No Acceptable Port Found"), null);
      }
    });
  }

  // Expose encode/decode for custom sysex messages
  static encode(data) {
    const encoded = [];
    const length = data.length;

    for (let i = 0; i < length; i++) {
      encoded.push(
        data[i] & 0x7F,
        (data[i] >> 7) & 0x7F
      );
    }

    return encoded;
  }

  static decode(data) {
    const decoded = [];

    if (data.length % 2 !== 0) {
      throw new Error("Board.decode(data) called with odd number of data bytes");
    }

    while (data.length) {
      const lsb = data.shift();
      const msb = data.shift();
      decoded.push(lsb | (msb << 7));
    }

    return decoded;
  }
}

Board.prototype.pwmWrite = Board.prototype.analogWrite;

function i2cRequest(board, bytes) {
  const active = i2cActive.get(board);

  if (!active) {
    throw new Error("I2C is not enabled for this board. To enable, call the i2cConfig() method.");
  }

  // Do not tamper with I2C_CONFIG messages
  if (bytes[1] === I2C_REQUEST) {
    const address = bytes[2];

    // If no peripheral settings exist, make them.
    if (!active[address]) {
      active[address] = {
        stopTX: true,
      };
    }

    // READ (8) or CONTINUOUS_READ (16)
    // value & 0b00011000
    if (bytes[3] & I2C_READ_MASK) {
      // Invert logic to accomodate default = true,
      // which is actually stopTX = 0
      bytes[3] |= Number(!active[address].stopTX) << 6;
    }
  }

  board.transport.write(new Buffer(bytes));
}

// For backwards compatibility
Board.Board = Board;
Board.SYSEX_RESPONSE = SYSEX_RESPONSE;
Board.MIDI_RESPONSE = MIDI_RESPONSE;


if (process.env.IS_TEST_MODE) {
  Board.test = {
    i2cPeripheralSettings(board) {
      return i2cActive.get(board);
    },
    get i2cActive() {
      return i2cActive;
    }
  };
}

module.exports = Board;
