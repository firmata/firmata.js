/*
 Functional test for Firmata software serial.

 Step 1 (main board):
 Install the serial branch of Firmata: https://github.com/firmata/arduino/tree/serial
 Compile and upload StandardFirmata from the serial branch to an Arduino board

 Step 2 (serial test board - the mock serial peripheral device):
 Compile and upload the following on an Arduino Uno or similar board:
 https://gist.github.com/soundanalogous/3c21496ce3f1a1af2235

 Step 3:
 Wire the TX pin of the serial test board to pin 10 of the main board
 Wire the RX pin of the serial test board to pin 11 of the main board
 Wire GND between both boards
 Power the serial test board from an external power source
 [optional] - prepare another serial test board and wire TX to pin 12 and RX to pin 13

 Step 4:
 If you have an FTDI cable or similar (I use Adafruit console cable), wire the cable TX wire
 (green wire if using an Adafruit console cable) to the serial test board pin 10 and wire the RX
 wire to the serial test board pin 11. This will enable you to view data written to the serial test
 board.

 Step 5:
 Run this node js file. It should continuously print 0 - 255 to the node console.
*/


var Board = require("../lib/firmata").Board;
var board = new Board("/dev/tty.usbmodem14531");

board.on("ready", function() {
  var swSerial0 = board.SERIAL_PORT_IDs.SW_SERIAL0;
  var swSerial1 = board.SERIAL_PORT_IDs.SW_SERIAL1;

  // create an unused port to test listen functionality
  // you can alternatively attach a 2nd serial test board but this will still run without it
  board.serialConfig({
    portId: swSerial1,
    baud: 57600,
    bytesToRead: 0,
    rxPin: 12,
    txPin: 13
  });

  // since swSerial0 is last configed, it will be the current listening port
  board.serialConfig({
    portId: swSerial0,
    baud: 57600,
    bytesToRead: 0,
    rxPin: 10,
    txPin: 11
  });

  var logSerial0Data = function (data) {
    console.log("serial0 data: " + data);
  };

  board.serialRead(swSerial0, logSerial0Data);

  // won't actually report anything unless you connect a second serial test board
  board.serialRead(swSerial1, function (data) {
    console.log("serial1 data: " + data);
  });

  // stop reading after 2 seconds
  setTimeout(function() {
    console.log("stop reading swSerial0");
    board.serialStop(swSerial0);
  }, 2000);

  // restart reading after 4 seconds
  setTimeout(function() {
    console.log("continue reading swSerial0");
    board.serialRead(swSerial0, logSerial0Data);
  }, 4000);

  // switch to SW_SERIAL_1 (output from SW_SERIAL0 will stop)
  // if serial input is hooked up (not required for this test),
  // you should see it logged and reporting ID 9
  // only 1 software serial port can be listening at a time (restriction of the Arduino
  // SoftwareSerial library)
  setTimeout(function() {
    console.log("listen to swSerial1 instead of swSerial0");
    board.serialListen(swSerial1);
  }, 6000);

  // output from SW_SERIAL0 will resume
  setTimeout(function() {
    console.log("switch back to listening to swSerial0");
    board.serialListen(swSerial0);
  }, 8000);

  // TODO - test flush and close

  // testing serial write
  setInterval(function() {
    var msg = "hello!";
    var msgArray = [];
    for (var i = 0, len = msg.length; i < len; i++) {
      msgArray.push(msg[i].charCodeAt(0));
    }
    board.serialWrite(swSerial0, msgArray);
  }, 2000);
});
