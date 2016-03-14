[![Travis Build Status](https://travis-ci.org/firmata/firmata.js.svg?branch=master)](https://travis-ci.org/firmata/firmata.js) 
[![Appveyor Build status](https://ci.appveyor.com/api/projects/status/w026oorwsq44223j?svg=true)](https://ci.appveyor.com/project/rwaldron/firmata)



# Firmata.js

[Firmata protocol](https://github.com/firmata/protocol) implementation for programmatic interaction with Arduino and Arduino compatible development boards.

# Install

As a project dependency:

```sh
npm install firmata
```


For global cli use: 

```sh
npm install -g firmata
```

# Usage

```js    
var Board = require("firmata");
var board = new Board("path to serialport", function() {
  // Arduino is ready to communicate
});  
```

Or

```js    
var Board = require("firmata");
var board = new Board("path to serialport");

board.on("ready", function() {
  // Arduino is ready to communicate
});  
```

# REPL

If you run *firmata* from the command line it will prompt you for the serial port. Then it will present you with a REPL with a board variable available.

# Board
  The Board object is where all the functionality is for the library.

## Board Instance API

- `board.MODES`
  This is an enumeration of the different modes available. These are used in calls to the *pinMode* function.
  ```js    
  {
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
    IGNORE: 0x7F,
    UNKOWN: 0x10
  }
  ```


- `board.HIGH* and *board.LOW`

  Constants used to set a digital pin's voltage will be set to the corresponding value: 5V (or 3.3V, or 1.8V, depending on board) for `HIGH`, 0V (Ground) for `LOW`.

- `board.pins`

  This is an array of all the pins on the board.

  Each value in the array is an object:

  ```js
  {
    mode: Number, // Current mode of pin which is on the the board.MODES.
    value: Number, // Current value of the pin. when pin is digital and set to output it will be Board.HIGH or Board.LOW. If the pin is an analog pin it will be an numeric value between 0 and 1023.
    supportedModes: [ ...Number ], // Array of modes from board.MODES that are supported on this pin.
    analogChannel: Number, // Will be 127 for digital pins and the pin number for analog pins.
    state: Number // For output pins this is the value of the pin on the board, for digital input it's the status of the pullup resistor (1 = pullup enabled, 0 = pullup disabled)
  }
  ```

  This array holds all pins digital and analog. To get the analog pin number as seen on the arduino board use the analogChannel attribute.

- `analogPins`

  This is an array of all the array indexes of the analog pins in the `board.pins` array. For example to get the analog pin 5 from the `board.pins` attributes use:

  ```js
  board.pins[board.analogPins[5]];`
  ```
  
## Board Prototype API

### Pin

- `pinMode(pin,mode)`

  Set a mode for a pin. pin is the number of the pin and the mode is on of the Board.MODES values.

- `digitalWrite(pin,value)`

  Write an output to a digital pin. pin is the number of the pin and the value is either board.HGH or board.LOW.

- `digitalRead(pin,callback)`

  Read a digital value from the pin. Evertime there is data for the pin the callback will be fired with a value argument. 

- `analogWrite(pin,value)`

  Write an output to an analog pin. pin is the number of the pin and the value is between 0 and 255. 

- `analogRead(pin,callback)`

  Read an input for an analog pin. Every time there is data on the pin the callback will be fired with a value argument. 

### Servo 

- `servoWrite(pin, degree)`

  Write a degree value to a servo pin.

- `servoConfig(pin, min, max)`

  Setup a servo with a specific min and max pulse (call instead of `pinMode`, which will provide default).
  
### I2C
  
- `i2cConfig(delay)` 

  Configure and enable I2C, optionally provide a value in μs to delay between reads (defaults to `0`). Required to enable I2C communication. 

- `i2cConfig(options)` 

  Configure and enable I2C, optionally provide an object that contains properties to use for  whose value is a number in μs to delay between reads. Required to enable I2C communication. 
  
  | Option  | Description | Default | Required? |
  |---------|-------------|---------|-----------|
  | delay   | µS delay between setting a register and requesting bytes from the register | 0 | No |
  | address | Valid I2C address, used when there are specific configurations for a given address | none | No |
  | settings | An object of properties to associate with a given address. | none | No |


  | Setting | Description | Default | Required? |
  |---------|-------------|---------|-----------|
  | stopTX  | Stop transmission after setting a register to read from. Setting to `false` will keep the transmission connection active. An example of the `false` behavior is the [MMA8452](https://github.com/sparkfun/MMA8452_Accelerometer/blob/master/Libraries/Arduino/src/SparkFun_MMA8452Q.cpp#L242-L270) | true | No |
  

- `i2cWrite(address, [...bytes])` 

  Write an arbitrary number of bytes. May not exceed 64 Bytes.

- `i2cWrite(address, register, [...bytes])` 

  Write an arbitrary number of bytes to the specified register. May not exceed 64 Bytes.

- `i2cWriteReg(address, register, byte)` 

  Write a byte value to a specific register. 

- `i2cRead(address, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes, continuously. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

- `i2cRead(address, register, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes from a register, continuously. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

- `i2cReadOnce(address, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes, one time. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

- `i2cReadOnce(address, register, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes from a register, one time. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

- `sendI2CConfig(delay)` **Deprecated**

  Set I2C Config on the arduino

- `sendI2CWriteRequest(slaveAddress, [bytes])` **Deprecated**

  Write an array of bytes to a an I2C device.

- `sendI2CReadRequest(slaveAddress, numBytes, function(data))` **Deprecated**

  Requests a number of bytes from a slave I2C device. When the bytes are received from the I2C device the callback is called with the byte array.

### Debug

- `sendString("a string")`
    
  Send an arbitrary string.

### One-Wire

- `sendOneWireConfig(pin, enableParasiticPower)`
  
  Configure the pin as the controller in a 1-wire bus. Set `enableParasiticPower` to `true` if you want the data pin to power the bus.

- `sendOneWireSearch(pin, callback)`
  
  Searches for 1-wire devices on the bus. The callback should accept an error argument and an array of device identifiers.

- `sendOneWireAlarmsSearch(pin, callback)`
  
  Searches for 1-wire devices on the bus in an alarmed state. The callback should accept and error argument and an array of device identifiers.

- `sendOneWireRead(pin, device, numBytesToRead, callback)`
  
  Reads data from a device on the bus and invokes the callback.

- `sendOneWireReset()`

  Resets all devices on the bus.

- `sendOneWireWrite(pin, device, data)`
  
  Writes data to the bus to be received by the device. The device should be obtained from a previous call to `sendOneWireSearch`.

- `sendOneWireDelay(pin, delay)`
  
  Tells Firmata to not do anything for the amount of ms. Use when you need to give a device attached to the bus time to do a calculation.

- `sendOneWireWriteAndRead(pin, device, data, numBytesToRead, callback)`
  
  Sends the `data` to the `device` on the bus, reads the specified number of bytes and invokes the `callback`.


### Serial

- `board.SERIAL_PORT_IDs`

  IDs for both hardware and software serial ports on the board.

  ```js
  {
    HW_SERIAL0: 0x00,
    HW_SERIAL1: 0x01,
    HW_SERIAL2: 0x02,
    HW_SERIAL3: 0x03,
    SW_SERIAL0: 0x08,
    SW_SERIAL1: 0x09,
    SW_SERIAL2: 0x10,
    SW_SERIAL3: 0x11,
  }
  ```

- `board.serialConfig(options)` 

  Configure a hardware or serial port

  ```
  options {
    portId {number} 
      The serial port to use 
      (HW_SERIAL1, HW_SERIAL2, HW_SERIAL3, SW_SERIAL0, SW_SERIAL1, SW_SERIAL2, SW_SERIAL3)
    baud {number} 
      The baud rate of the serial port
    rxPin {number} 
      [SW Serial only] The RX pin of the SoftwareSerial instance
    txPin {number} 
      [SW Serial only] The TX pin of the SoftwareSerial instance
  }
  ```


- `board.serialWrite(portId, inBytes)`

  Write an array of bytes to the specified serial port.


- `board.serialRead(portId, callback)`
- `board.serialRead(portId, maxBytesToRead, callback)`
  
  Start continuous reading of the specified serial port. The port is checked for data each iteration of the main Arduino loop.

> `maxBytesToRead` specifies the maximum number of bytes to read per iteration. If there are less bytes in the buffer, the lesser number of bytes will be returned. A value of 0 indicates that all available bytes in the buffer should be read. 

- `board.serialStop(portId)`

  Stop continuous reading of the specified serial port. This does not close the port, it stops reading it but keeps the port open.

- `board.serialClose(portId)`

  Close the specified serial port.

- `board.serialFlush(portId)`

  Flush the specified serial port. For hardware serial, this waits for the transmission of outgoing serial data to complete. For software serial, this removes any buffered incoming serial data.

- `board.serialListen(portId)`

  **For SoftwareSerial only**. Only a single SoftwareSerial instance can read data at a time. Call this method to set this port to be the reading port in the case there are multiple SoftwareSerial instances.


### Sysex

- `board.sysexResponse(commandByte, handler)` 
  
  Allow user code to handle arbitrary sysex responses. `commandByte` must be associated with some message that's expected from the slave device. The `handler` is called with an array of _raw_ data from the slave. Data decoding must be done within the handler itself.
  
  - Use `Board.decode(data)` to extract useful values from the incoming response data.
 
- `board.sysexCommand(message)`
  
  Allow user code to send arbitrary sysex messages. The `message` array is expected to be all necessary bytes between START_SYSEX and END_SYSEX (non-inclusive). It will be assumed that the data in the message array is already encoded as 2 7-bit bytes LSB first.

  - Use `Board.encode(data)` to encode data values into an array of 7 bit byte pairs.


### Encode/Decode

- `Board.encode(data)`
  
  Encode an array of 8 bit data values as two 7 bit byte pairs (each). (LSB first)

- `Board.decode(data)`
  
  Decode an array of 7 bit byte pairs into a an array of 8 bit data values. (LSB first)


## License 

(The MIT License)

Copyright (c) 2011-2015 Julian Gautier <julian.gautier@alumni.neumont.edu>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
