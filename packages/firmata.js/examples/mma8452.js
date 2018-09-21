const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const register = {
    CTRL_REG1: 0x2A,
    XYZ_DATA_CFG: 0x0E,
    READ_X_MSB: 0x01,
  };

  const board = new Board(port.comName);
  // var board = new Board("/dev/cu.usbmodem1411");

  board.on("ready", function() {
    console.log("Ready");

    const mma8452 = 0x1D;
    const scale = 2; // 2G
    const options = {
      address: mma8452,
      settings: {
        stopTX: false,
      },
    };

    this.i2cConfig(options);

    function mode(which, callback) {
      board.i2cReadOnce(mma8452, register.CTRL_REG1, 1, data => {
        let value = data[0];
        if (which === "standby") {
          // Clear the first bit
          value &= ~1;
        } else {
          // Set the first bit
          value |= 1;
        }

        board.i2cWrite(mma8452, register.CTRL_REG1, value);

        callback();
      });
    }

    new Promise(resolve => {
      mode("standby", () => {

        // 00: 2G (0b00000000)
        // 01: 4G (0b00000001)
        // 10: 8G (0b00000010)
        const fsr = scale >> 2; // 2G (0b00000000)
        board.i2cWrite(mma8452, register.XYZ_DATA_CFG, fsr);

        // 0: 800 Hz
        // 1: 400 Hz
        // 2: 200 Hz *
        // 3: 100 Hz
        // 4: 50 Hz
        // 5: 12.5 Hz
        // 6: 6.25 Hz
        // 7: 1.56 Hz
        const ctrlreg1 = 0b00000101 << 3; // 5 0b00[101]000
        board.i2cWrite(mma8452, register.CTRL_REG1, ctrlreg1);

        mode("active", resolve);
      });
    }).then(() => {

      board.i2cRead(mma8452, 0x00, 1, data => {
        const available = data[0];

        if ((available & 0x08) >> 3) {
          board.i2cReadOnce(mma8452, register.READ_X_MSB, 6, data => {
            let x = (data[0] << 8 | data[1]) >> 4;
            let y = (data[2] << 8 | data[3]) >> 4;
            let z = (data[4] << 8 | data[5]) >> 4;

            if (data[0] > 0x7F) {
              x = -(1 + 0xFFF - x);
            }

            if (data[2] > 0x7F) {
              y = -(1 + 0xFFF - y);
            }

            if (data[4] > 0x7F) {
              z = -(1 + 0xFFF - z);
            }

            console.log({
              x: x / ((1 << 12) / (2 * scale)),
              y: y / ((1 << 12) / (2 * scale)),
              z: z / ((1 << 12) / (2 * scale)),
            });
          });
        }
      });
    });
  });
});
