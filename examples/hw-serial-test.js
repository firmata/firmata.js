/*
 Functional test for Firmata hardware serial.

 Step 1 (main board - Arduino Mega, Leonardo or other board with multiple HW ports):
 Install the serial branch of Firmata: https://github.com/firmata/arduino/tree/serial
 Compile and upload StandardFirmata from the serial branch to an Arduino board

 Step 2 (serial test board - the mock serial peripheral device):
 Compile and upload the following on an Arduino Uno or similar board:
 https://gist.github.com/soundanalogous/3c21496ce3f1a1af2235

 Step 3:
 Wire the TX pin of the serial test board to RX1 the main board
 Wire the RX pin of the serial test board to TX1 of the main board
 Wire GND between both boards
 Power the serial test board from an external power source

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
  // not that HW_SERIAL0 cannot yet be used (it maps to RX and TX)
  // HW_SERIAL1 maps to RX1 and TX1
  var hwSerial1 = board.SERIAL_PORT_IDs.HW_SERIAL1;

  // portId, baud, bytesToRead
  board.serialConfig({
    portId: hwSerial1,
    baud: 57600,
    bytesToRead: 0
  });

  var logSerialData = function(data) {
    console.log("serial data received: " + data);
  };

  board.serialRead(hwSerial1, logSerialData);

  // stop reading after 2 seconds
  setTimeout(function() {
    console.log("stop reading hwSerial1");
    board.serialStop(hwSerial1);
  }, 2000);

  // restart reading after 4 seconds
  setTimeout(function() {
    console.log("continue reading hwSerial1");
    board.serialRead(hwSerial1, logSerialData);
  }, 4000);

  // TODO - test flush and close

  // testing serial write
  setInterval(function() {
    var msg = "hello!";
    var msgArray = [];
    for (var i = 0, len = msg.length; i < len; i++) {
      msgArray.push(msg[i].charCodeAt(0));
    }
    board.serialWrite(hwSerial1, msgArray);
  }, 2000);
});
