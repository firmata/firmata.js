[![Build Status](https://secure.travis-ci.org/jgautier/firmata.png)](http://travis-ci.org/jgautier/firmata)
#Firmata
A Node library to interact with an Arduino running the firmata protocol.
#Install
    npm install -g firmata
#Tests
The tests are written with expresso and assume you have the async library install globally. It also assumes you have an Arduino Uno running firmata 2.2 with a photocell and an LED hooked up.
#Usage
    
    var firmata = require('firmata');
    var board = new firmata.Board('path to usb',function(){
      //arduino is ready to communicate
    });  
#REPL
If you run *firmata* from the command line it will prompt you for the usb port. Then it will present you with a REPL with a board variable available.
# Board
  The Board object is where all the functionality is for the library.

## Board Instance API
  
  *MODES*

```js    
{
  INPUT: 0x00,
  OUTPUT: 0x01,
  ANALOG: 0x02,
  PWM: 0x03,
  SERVO: 0x04
}
```

This is an enumeration of the different modes available. These are used in calls to the *pinMode* function.

*HIGH* and *LOW*

These are constants used to set a digital pin low or high. Used in calls to the *digitalWrite* function.

*pins*

This is an array of all the pins on the arduino board.

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

  *analogPins*

  This is an array of all the array indexes of the analog pins in the *Board.pins* array. 
  For example to get the analog pin 5 from the *Board.pins* attributes use:

`pins[board.analogPins[5]];`


## Board Prototype API

### Pin

`pinMode(pin,mode)`

  Set a mode for a pin. pin is the number of the pin and the mode is on of the Board.MODES values.

`digitalWrite(pin,value)`

  Write an output to a digital pin. pin is the number of the pin and the value is either board.HGH or board.LOW.

`digitalRead(pin,callback)`

  Read a digital value from the pin. Evertime there is data for the pin the callback will be fired with a value argument. 

`analogWrite(pin,value)`

  Write an output to an analog pin. pin is the number of the pin and the value is between 0 and 255. 

`analogRead(pin,callback)`

  Read an input for an analog pin. Every time there is data on the pin the callback will be fired with a value argument. 

### Servo 

`servoWrite(pin, degree)`

  Write a degree value to a servo pin.

`servoConfig(pin, min, max)`

  Setup a servo with a specific min and max pulse (call instead of `pinMode`, which will provide default).
  
### I2C
  
`i2cConfig()` 

  Configure and enable I2C, provide no options or delay. Required to enable I2C communication. 

`i2cConfig(delay)` 

  Configure and enable I2C, optionally provide a value in μs to delay between reads (defaults to `0`). Required to enable I2C communication. 

`i2cConfig(options)` 

  Configure and enable I2C, optionally provide an object that contains a `delay` property whose value is a number in μs to delay between reads. Required to enable I2C communication. 


`i2cWrite(address, [...bytes])` 

  Write an arbitrary number of bytes. May not exceed 64 Bytes.

`i2cWrite(address, register, [...bytes])` 

  Write an arbitrary number of bytes to the specified register. May not exceed 64 Bytes.

`i2cWriteReg(address, register, byte)` 

  Write a byte value to a specific register. 

`i2cRead(address, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes, continuously. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

`i2cRead(address, register, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes from a register, continuously. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

`i2cReadOnce(address, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes, one time. `handler` receives an array of values, with a length corresponding to the number of read bytes. 

`i2cReadOnce(address, register, numberOfBytesToRead, handler(data))` 

  Read a specified number of bytes from a register, one time. `handler` receives an array of values, with a length corresponding to the number of read bytes. 


`sendI2CConfig(delay)` **Deprecated**

  Set I2C Config on the arduino

`sendI2CWriteRequest(slaveAddress,[bytes])` **Deprecated**

  Write an array of bytes to a an I2C device.

`sendI2CReadRequest(slaveAddress,numBytes,function(data))` **Deprecated**

  Requests a number of bytes from a slave I2C device. When the bytes are received from the I2C device the callback is called with the byte array.

### Debug

`sendString("a string")`
    
  Send an arbitrary string.

### One-Wire

`sendOneWireConfig(pin, enableParasiticPower)`
  
  Configure the pin as the controller in a 1-wire bus. Set `enableParasiticPower` to `true` if you want the data pin to power the bus.

`sendOneWireSearch(pin, callback)`
  
  Searches for 1-wire devices on the bus. The callback should accept an error argument and an array of device identifiers.

`sendOneWireAlarmsSearch(pin, callback)`
  
  Searches for 1-wire devices on the bus in an alarmed state. The callback should accept and error argument and an array of device identifiers.

`sendOneWireRead(pin, device, numBytesToRead, callback)`
  
  Reads data from a device on the bus and invokes the callback.

`sendOneWireReset()`

  Resets all devices on the bus.

`sendOneWireWrite(pin, device, data)`
  
  Writes data to the bus to be received by the device. The device should be obtained from a previous call to `sendOneWireSearch`.

`sendOneWireDelay(pin, delay)`
  
  Tells Firmata to not do anything for the amount of ms. Use when you need to give a device attached to the bus time to do a calculation.

`sendOneWireWriteAndRead(pin, device, data, numBytesToRead, callback)`
  
  Sends the `data` to the `device` on the bus, reads the specified number of bytes and invokes the `callback`.

  
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
