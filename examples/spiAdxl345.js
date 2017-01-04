/**
 * NOTE: This example has not been tested on actual hardware.
 */

var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }
  var board = new Board(port.comName);

  board.on("ready", function() {
    console.log("Board ready.");

    var register = {
      POWER: 0x2D,
      RANGE: 0x31,
      READ: 0x32,
    };
  
    var READ_BIT = 0x80;
    var MULTI_BYTE_BIT = 0x40;
    var sensitivity = 0.00390625;
    var BYTES_TO_READ = 6;

    board.spiBegin();

    var deviceId = 9; // must be unique per device per application
    board.spiBeginTransaction(deviceId, {
      bitOrder: board.SPI_BIT_ORDER.MSBFIRST,
      dataMode: board.SPI_DATA_MODES.MODE3,
      maxClockSpeed: 5000000, // 5 Mhz
      csPin: 2,
      csActiveState: board.SPI_CS_ACTIVE_STATE.LOW
    });

    // power off
    board.spiWriteRegister(register.POWER, 0x00);
    // power on and set measurement mode
    board.spiWriteRegister(register.POWER, 0x08);
    // full resolution, +/- 2g, 4-wire SPI
    board.spiWriteRegister(register.RANGE, 0x08);

    // setup multi-byte read
    var readAddress = register.READ | READ_BIT | MULTI_BYTE_BIT;

    var counter = 100; // read 100 times
    console.log("Read accelerometer 100 times...");
    var interval = setInterval(function() {
      board.spiReadRegister(readAddress, BYTES_TO_READ, function(data) {
        var x = (data[1] << 8) | data[0];
        var y = (data[3] << 8) | data[2];
        var z = (data[5] << 8) | data[4];

        // Wrap and clamp 16 bits;
        var X = (x >> 15 ? ((x ^ 0xFFFF) + 1) * -1 : x) * sensitivity;
        var Y = (y >> 15 ? ((y ^ 0xFFFF) + 1) * -1 : y) * sensitivity;
        var Z = (z >> 15 ? ((z ^ 0xFFFF) + 1) * -1 : z) * sensitivity;

        console.log("X: " + X + " Y: " + Y + " Z: " + Z);
        if (counter === 0) {
          console.log("Done reading.");
        }
      });

      if (--counter === 0) {
        clearInterval(interval);
      }
    }, 100);

    // Get debug messages from board.
    board.on("string", function (message) {
      console.log("message from board: " + message);
    });

  });
});
