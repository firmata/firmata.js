const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Board(port.path);

  board.on("ready", () => {
    console.log("READY");

    const HW_SERIAL1 = board.SERIAL_PORT_IDs.HW_SERIAL1;

    board.serialConfig({
      portId: HW_SERIAL1,
      baud: 9600
    });

    board.serialRead(HW_SERIAL1, data => {
      console.log(new Buffer(data).toString("ascii"));
    });

    board.on("string", message => {
      console.log(message);
    });

    // log serial pin numbers
    for (const pin in board.pins) {
      const modes = board.pins[pin].supportedModes;
      for (const mode in modes) {
        if (modes[mode] === board.MODES.SERIAL) {
          console.log(`serial pin: ${pin}`);
        }
      }
    }

  });
});
