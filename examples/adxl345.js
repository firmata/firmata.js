var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }

  var register = {
    POWER: 0x2D,
    RANGE: 0x31,
    READ: 0xB2,
  };

  var board = new Board(port.comName);

  board.on("ready", function() {
    console.log("Ready");

    var adxl345 = 0x53;
    var sensitivity = 0.00390625;

    // Enable I2C
    this.i2cConfig();

    // Toggle power to reset
    this.i2cWrite(adxl345, register.POWER, 0);
    this.i2cWrite(adxl345, register.POWER, 8);

    // Set range (this is 2G range)
    this.i2cWrite(adxl345, register.RANGE, 8);

    // Set register to READ position and request 6 bytes
    this.i2cRead(adxl345, register.READ, 6, function(data) {
      var x = (data[1] << 8) | data[0];
      var y = (data[3] << 8) | data[2];
      var z = (data[5] << 8) | data[4];

      // Wrap and clamp 16 bits;
      var X = (x >> 15 ? ((x ^ 0xFFFF) + 1) * -1 : x) * sensitivity;
      var Y = (y >> 15 ? ((y ^ 0xFFFF) + 1) * -1 : y) * sensitivity;
      var Z = (z >> 15 ? ((z ^ 0xFFFF) + 1) * -1 : z) * sensitivity;

      console.log("X: ", X);
      console.log("Y: ", Y);
      console.log("Z: ", Z);
    });
  });
});
