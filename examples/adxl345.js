var Board = require("../lib/firmata").Board;
var SerialPort = require("serialport");
var rport = /usb|acm|^com/i;

SerialPort.list(function(err, ports) {
  ports.forEach(function(port) {
    if (rport.test(port.comName)) {
      console.log("ATTEMPTING: ", port.comName);

      var board = new Board(port.comName);

      var accel = {
        ADDRESS: 0x53,
        POWER_CTL: 0x2D,
        RANGE: 0x31,
        ALL_DATA: 0xB2,
      };

      // board.on("string", function(data) {
      //   console.log("data: ", data);
      // });

      board.on("ready", function() {
        console.log("Ready");

        var sensitivity = 0.00390625;

        // This is required to enable I2C
        this.i2cConfig();

        // Standby mode
        this.i2cWrite(accel.ADDRESS, accel.POWER_CTL, 0);

        // Enable measurements
        this.i2cWrite(accel.ADDRESS, accel.POWER_CTL, 8);

        // Set range (this is 2G range)
        this.i2cWrite(accel.ADDRESS, accel.RANGE, 8);

        // Set the Register to ALL_DATA and request 6 bytes
        this.i2cRead(accel.ADDRESS, accel.ALL_DATA, 6, function(data) {
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
    }
  });
});
