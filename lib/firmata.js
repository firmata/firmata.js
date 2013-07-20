/**
 * @author Julian Gautier
 */

/**
 * Module Dependencies
 */

var SerialPort = require('serialport').SerialPort,
    util = require('util'),
    events = require('events');

/**
 * constants
 */

var PIN_MODE = 0xF4,
    REPORT_DIGITAL = 0xD0,
    REPORT_ANALOG = 0xC0,
    DIGITAL_MESSAGE = 0x90,
    START_SYSEX = 0xF0,
    END_SYSEX = 0xF7,
    QUERY_FIRMWARE = 0x79,
    REPORT_VERSION = 0xF9,
    ANALOG_MESSAGE = 0xE0,
    CAPABILITY_QUERY = 0x6B,
    CAPABILITY_RESPONSE = 0x6C,
    PIN_STATE_QUERY = 0x6D,
    PIN_STATE_RESPONSE = 0x6E,
    ANALOG_MAPPING_QUERY = 0x69,
    ANALOG_MAPPING_RESPONSE = 0x6A,
    I2C_REQUEST = 0x76,
    I2C_REPLY = 0x77,
    I2C_CONFIG = 0x78,
    STRING_DATA = 0x71,
    SYSTEM_RESET = 0xFF,
    PULSE_OUT = 0x73,
    PULSE_IN = 0x74,
    SAMPLING_INTERVAL = 0x7A,
    STEPPER = 0x72;


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
    for (var i = 0; i < 16; i++) {
        board.sp.write([REPORT_DIGITAL | i, 1]);
        board.sp.write([REPORT_ANALOG | i, 1]);
    }
    board.emit('reportversion');
};

/**
 * Handles a ANALOG_MESSAGE response and emits 'analog-read' and 'analog-read-'+n events where n is the pin number.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

MIDI_RESPONSE[ANALOG_MESSAGE] = function(board) {
    var value = board.currentBuffer[1] | (board.currentBuffer[2] << 7);
    var port = board.currentBuffer[0] & 0x0F;
    if (board.pins[board.analogPins[port]]) {
        board.pins[board.analogPins[port]].value = value;
    }
    board.emit('analog-read-' + port, value);
    board.emit('analog-read', {
        pin: port,
        value: value
    });
};

/**
 * Handles a DIGITAL_MESSAGE response and emits a 'digital-read' and 'digital-read-'+n events where n is the pin number.
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
            board.emit('digital-read-' + pinNumber, pin.value);
            board.emit('digital-read', {
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
 * Handles a QUERY_FIRMWARE response and emits the 'queryfirmware' event
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


    board.firmware.name = new Buffer(firmwareBuf).toString('utf8', 0, firmwareBuf.length);
    board.emit('queryfirmware');
};

/**
 * Handles a CAPABILITY_RESPONSE response and emits the 'capability-query' event
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

    for (var i = 2, n = 0; i < board.currentBuffer.length - 1; i++) {
        if (board.currentBuffer[i] === 127) {
            var modesArray = [];
            Object.keys(board.MODES).forEach(pushModes.bind(null, modesArray));
            board.pins.push({
                supportedModes: modesArray,
                mode: board.MODES.OUTPUT,
                value : 0,
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
    board.emit('capability-query');
};

/**
 * Handles a PIN_STATE response and emits the 'pin-state-'+n event where n is the pin number
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[PIN_STATE_RESPONSE] = function(board) {
    var pin = board.currentBuffer[2];
    board.pins[pin].mode = board.currentBuffer[3];
    board.pins[pin].value = board.currentBuffer[4];
    if (board.currentBuffer.length > 6) {
        board.pins[pin].value |= (board.currentBuffer[5] << 7);
    }
    if (board.currentBuffer.length > 7) {
        board.pins[pin].value |= (board.currentBuffer[6] << 14);
    }
    board.emit('pin-state-' + pin);
};

/**
 * Handles a ANALOG_MAPPING_RESPONSE response and emits the 'analog-mapping-query' event.
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
    board.emit('analog-mapping-query');
};

/**
 * Handles a I2C_REPLY response and emits the 'I2C-reply-'+n event where n is the slave address of the I2C device.
 * The event is passed the buffer of data sent from the I2C Device
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[I2C_REPLY] = function(board) {
    var replyBuffer = [];
    var slaveAddress = (board.currentBuffer[2] & 0x7F) | ((board.currentBuffer[3] & 0x7F) << 7);
    var register = (board.currentBuffer[4] & 0x7F) | ((board.currentBuffer[5] & 0x7F) << 7);
    for (var i = 6, length = board.currentBuffer.length - 1; i < length; i += 2) {
        replyBuffer.push(board.currentBuffer[i] | (board.currentBuffer[i + 1] << 7));
    }
    board.emit('I2C-reply-' + slaveAddress, replyBuffer);
};

/**
 * Handles a STRING_DATA response and logs the string to the console.
 * @private
 * @param {Board} board the current arduino board we are working with.
 */

SYSEX_RESPONSE[STRING_DATA] = function(board) {
    board.emit('string',new Buffer(board.currentBuffer.slice(2, -1)).toString('utf8'));
};
/**
 * Response from pulseIn
 */
SYSEX_RESPONSE[PULSE_IN] = function(board){
    var pin = (board.currentBuffer[2] & 0x7F) | ((board.currentBuffer[3] & 0x7F) << 7);
    var durationBuffer = [
        (board.currentBuffer[4] & 0x7F) | ((board.currentBuffer[5] & 0x7F) << 7),
        (board.currentBuffer[6] & 0x7F) | ((board.currentBuffer[7] & 0x7F) << 7),
        (board.currentBuffer[8] & 0x7F) | ((board.currentBuffer[9] & 0x7F) << 7),
        (board.currentBuffer[10] & 0x7F) | ((board.currentBuffer[11] & 0x7F) << 7)
    ];
    var duration = ( (durationBuffer[0] << 24) +
                     (durationBuffer[1] << 16) +
                     (durationBuffer[2] << 8) +
                     (durationBuffer[3] ) );
    board.emit('pulse-in-'+pin,duration);
};

/**
 * Handles the message from a stepper completing move
 * @param {Board} board
 */
SYSEX_RESPONSE[STEPPER] = function(board) {
    var deviceNum = board.currentBuffer[2];
    board.emit('stepper-done-'+deviceNum, true);
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
        events.EventEmitter.call(this);
        if (typeof options === 'function') {
            callback = options;
            options = {
                reportVersionTimeout: 5000
            };
        }
        var board = this;
        this.MODES = {
            INPUT: 0x00,
            OUTPUT: 0x01,
            ANALOG: 0x02,
            PWM: 0x03,
            SERVO: 0x04
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
        if(typeof port === 'object'){
            this.sp = port;
        } else {
            this.sp = new SerialPort(port, {
                baudrate: 57600,
                buffersize: 1
            });
        }
        this.sp.on('error', function(string) {
            callback(string);
        });

        this.sp.on('data', function(data) {
            var byt, cmd;

            if (!board.versionReceived && data[0] !== REPORT_VERSION) {
                return;
            } else {
                board.versionReceived = true;
            }

            for (var i = 0; i < data.length; i++) {
                byt = data[i];
                // we dont want to push 0 as the first byte on our buffer
                if (board.currentBuffer.length === 0 && byt === 0) {
                    continue;
                } else {
                    board.currentBuffer.push(byt);

                    // [START_SYSEX, ... END_SYSEX]
                    if (board.currentBuffer[0] === START_SYSEX &&
                        SYSEX_RESPONSE[board.currentBuffer[1]] &&
                        board.currentBuffer[board.currentBuffer.length - 1] === END_SYSEX) {

                        SYSEX_RESPONSE[board.currentBuffer[1]](board);
                        board.currentBuffer.length = 0;
                    }

                    // There are 3 bytes in the buffer and the first is not START_SYSEX:
                    // Might have a MIDI Command
                    if (board.currentBuffer.length === 3 && board.currentBuffer[0] !== START_SYSEX) {
                        //commands under 0xF0 we have a multi byte command
                        if (board.currentBuffer[0] < 240) {
                            cmd = board.currentBuffer[0] & 0xF0;
                        } else {
                            cmd = board.currentBuffer[0];
                        }

                        if (MIDI_RESPONSE[cmd]) {
                            MIDI_RESPONSE[cmd](board);
                            board.currentBuffer.length = 0;
                        }
                    }
                }
            }
        });
        // if we have not received the version in the timeout  ask for it
        this.reportVersionTimeoutId = setTimeout(function () {
            if (this.versionReceived === false) {
                this.reportVersion(function () {});
                this.queryFirmware(function () {});
            }                
        }.bind(this), options.reportVersionTimeout);    
        board.once('reportversion', function () {
            clearTimeout(board.reportVersionTimeoutId);
            board.versionReceived = true;
            board.once('queryfirmware', function () {
                board.queryCapabilities(function() {
                    board.queryAnalogMapping(function() { 
                        callback();
                    });
                });
            });
        });
    };
util.inherits(Board, events.EventEmitter);

/**
 * Asks the arduino to tell us its version.
 * @param {function} callback A function to be called when the arduino has reported its version.
 */

Board.prototype.reportVersion = function(callback) {
    this.once('reportversion', callback);
    this.sp.write([REPORT_VERSION]);
};

/**
 * Asks the arduino to tell us its firmware version.
 * @param {function} callback A function to be called when the arduino has reported its firmware version.
 */

Board.prototype.queryFirmware = function(callback) {
    this.once('queryfirmware', callback);
    this.sp.write([START_SYSEX, QUERY_FIRMWARE, END_SYSEX]);
};

/**
 * Asks the arduino to read analog data.
 * @param {number} pin The pin to read analog data
 * @param {function} callback A function to call when we have the analag data.
 */

Board.prototype.analogRead = function(pin, callback) {
    this.addListener('analog-read-' + pin, callback);
};

/**
 * Asks the arduino to write an analog message.
 * @param {number} pin The pin to write analog data to.
 * @param {nubmer} value The data to write to the pin between 0 and 255.
 */

Board.prototype.analogWrite = function(pin, value) {
    this.pins[pin].value = value;
    this.sp.write([ANALOG_MESSAGE | pin, value & 0x7F, (value >> 7) & 0x7F]);
};

/**
 * Asks the arduino to move a servo
 * @param {number} pin The pin the servo is connected to
 * @param {number} value The degrees to move the servo to.
 */

Board.prototype.servoWrite = function(pin, value) {
    this.analogWrite.apply(this, arguments);
};

/**
 * Asks the arduino to set the pin to a certain mode.
 * @param {number} pin The pin you want to change the mode of.
 * @param {number} mode The mode you want to set. Must be one of board.MODES
 */

Board.prototype.pinMode = function(pin, mode) {
    this.pins[pin].mode = mode;
    this.sp.write([PIN_MODE, pin, mode]);
};

/**
 * Asks the arduino to write a value to a digital pin
 * @param {number} pin The pin you want to write a value to.
 * @param {value} value The value you want to write. Must be board.HIGH or board.LOW
 */

Board.prototype.digitalWrite = function(pin, value) {
    var port = Math.floor(pin / 8);
    var portValue = 0;
    this.pins[pin].value = value;
    for (var i = 0; i < 8; i++) {
        if (this.pins[8 * port + i].value) {
            portValue |= (1 << i);
        }
    }
    this.sp.write([DIGITAL_MESSAGE | port, portValue & 0x7F, (portValue >> 7) & 0x7F]);
};

/**
 * Asks the arduino to read digital data
 * @param {number} pin The pin to read data from
 * @param {function} callback The function to call when data has been received
 */

Board.prototype.digitalRead = function(pin, callback) {
    this.addListener('digital-read-' + pin, callback);
};

/**
 * Asks the arduino to tell us its capabilities
 * @param {function} callback A function to call when we receive the capabilities
 */

Board.prototype.queryCapabilities = function(callback) {
    this.once('capability-query', callback);
    this.sp.write([START_SYSEX, CAPABILITY_QUERY, END_SYSEX]);
};

/**
 * Asks the arduino to tell us its analog pin mapping
 * @param {function} callback A function to call when we receive the pin mappings.
 */

Board.prototype.queryAnalogMapping = function(callback) {
    this.once('analog-mapping-query', callback);
    this.sp.write([START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]);
};

/**
 * Asks the arduino to tell us the current state of a pin
 * @param {number} pin The pin we want to the know the state of
 * @param {function} callback A function to call when we receive the pin state.
 */

Board.prototype.queryPinState = function(pin, callback) {
    this.once('pin-state-' + pin, callback);
    this.sp.write([START_SYSEX, PIN_STATE_QUERY, pin, END_SYSEX]);
};
/**
 * Sends a I2C config request to the arduino board with an optional
 * value in microseconds to delay an I2C Read.  Must be called before
 * an I2C Read or Write
 * @param {number} delay in microseconds to set for I2C Read
 */
Board.prototype.sendI2CConfig=function(delay){
  delay = delay || 0;
  this.sp.write([START_SYSEX,I2C_CONFIG,(delay & 0xFF),((delay >> 8) & 0xFF),END_SYSEX]);
};

/**
 * Asks the arduino to send an I2C request to a device
 * @param {number} slaveAddress The address of the I2C device
 * @param {Array} bytes The bytes to send to the device
 */

Board.prototype.sendI2CWriteRequest = function(slaveAddress, bytes) {
    var data = [];
    bytes = bytes || [];
    data.push(START_SYSEX);
    data.push(I2C_REQUEST);
    data.push(slaveAddress);
    data.push(this.I2C_MODES.WRITE << 3);
    for (var i = 0, length = bytes.length; i < length; i++) {
        data.push(bytes[i] & 0x7F);
        data.push((bytes[i] >> 7) & 0x7F);
    }
    data.push(END_SYSEX);
    this.sp.write(data);
};

/**
 * Asks the arduino to request bytes from an I2C device
 * @param {number} slaveAddress The address of the I2C device
 * @param {number} numBytes The number of bytes to receive.
 * @param {function} callback A function to call when we have received the bytes.
 */

Board.prototype.sendI2CReadRequest = function(slaveAddress, numBytes, callback) {
    this.sp.write([START_SYSEX, I2C_REQUEST, slaveAddress, this.I2C_MODES.READ << 3, numBytes & 0x7F, (numBytes >> 7) & 0x7F, END_SYSEX]);
    this.once('I2C-reply-' + slaveAddress, callback);
};

/**
 * Set sampling interval in millis. Default is 19 ms
 * @param {number} interval The sampling interval in ms > 10
 */
Board.prototype.setSamplingInterval = function(interval) {
    var safeint = interval < 10 ? 10 : (interval > 65535 ? 65535 : interval); // constrained
    this.sp.write([START_SYSEX, SAMPLING_INTERVAL, (safeint & 0xFF),((safeint >> 8) & 0xFF), END_SYSEX]);
};

/**
  * Set reporting on pin
  * @param {number} pin The pin to turn on/off reporting
  * @param {number} value Binary value to turn reporting on/off
  */
Board.prototype.reportAnalogPin = function(pin, value) {
    if(value === 0 || value === 1) {
        this.pins[this.analogPins[pin]].report = value;
        this.sp.write([REPORT_ANALOG | pin, value]);
    }
};

/**
  * Set reporting on pin
  * @param {number} pin The pin to turn on/off reporting
  * @param {number} value Binary value to turn reporting on/off
  */
Board.prototype.reportDigitalPin = function(pin, value) {
    if(value === 0 || value === 1) {
        this.pins[pin].report = value;
        this.sp.write([REPORT_DIGITAL | pin, value]);
    }
};

/**
 *
 *
 */
Board.prototype.pulseIn = function(opts, callback){
    var pin = opts.pin;
    var value = opts.value;
    var pulseOut = opts.pulseOut || 0;
    var timeout = opts.timeout || 1000000;
    var pulseOutArray = [
        ((pulseOut >> 24) & 0xFF),
        ((pulseOut >> 16) & 0xFF),
        ((pulseOut >> 8) & 0XFF),
        ((pulseOut & 0xFF))
    ];
    var timeoutArray = [
        ((timeout >> 24) & 0xFF),
        ((timeout >> 16) & 0xFF),
        ((timeout >> 8) & 0XFF),
        ((timeout & 0xFF))
    ];
    var data = [
        START_SYSEX,
        PULSE_IN,
        pin,
        value,
        pulseOutArray[0] & 0x7F,
        (pulseOutArray[0] >> 7) & 0x7F,
        pulseOutArray[1] & 0x7F,
        (pulseOutArray[1] >> 7) & 0x7F,
        pulseOutArray[2] & 0x7F,
        (pulseOutArray[2] >> 7) & 0x7F,
        pulseOutArray[3] & 0x7F,
        (pulseOutArray[3] >> 7) & 0x7F,
        timeoutArray[0] & 0x7F,
        (timeoutArray[0] >> 7) & 0x7F,
        timeoutArray[1] & 0x7F,
        (timeoutArray[1] >> 7) & 0x7F,
        timeoutArray[2] & 0x7F,
        (timeoutArray[2] >> 7) & 0x7F,
        timeoutArray[3] & 0x7F,
        (timeoutArray[3] >> 7) & 0x7F,
        END_SYSEX
    ];
    this.sp.write(data);
    this.once('pulse-in-'+pin,callback);
};

/**
 * Stepper functions to support AdvancedFirmata's asynchronous control of stepper motors
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
        0x00,       // STEPPER_CONFIG from firmware
        deviceNum,
        type,
        stepsPerRev & 0x7F,
        (stepsPerRev >> 7) & 0x7F,
        dirOrMotor1Pin,
        stepOrMotor2Pin
    ];
    if(type === this.STEPPER.TYPE.FOUR_WIRE) {
        data.push(motor3Pin, motor4Pin);
    }
    data.push(END_SYSEX);
    this.sp.write(data);
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
    if (typeof accel === 'function') {
        callback = accel;
        accel = 0;
        decel = 0;
    }

    var data = [
        START_SYSEX,
        STEPPER,
        0x01,       // STEPPER_STEP from firmware
        deviceNum,
        direction,  // one of this.STEPPER.DIRECTION.*
        steps & 0x7F,
        (steps >> 7) & 0x7F,
        (steps >> 14) & 0x7f,
        speed & 0x7F,
        (speed >> 7) & 0x7F
    ];
    if(accel > 0 || decel > 0) {
        data.push(
            accel & 0x7F,
            (accel >> 7) & 0x7F,
            decel & 0x7F,
            (decel >> 7) & 0x7F
        );
    }
    data.push(END_SYSEX);
    this.sp.write(data);
    this.once('stepper-done-'+deviceNum, callback);
};



/**
 * Send SYSTEM_RESET to arduino
 */
Board.prototype.reset = function(){
    this.sp.write([SYSTEM_RESET]);
};
module.exports = {
    Board: Board
};
