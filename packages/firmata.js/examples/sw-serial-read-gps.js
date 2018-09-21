const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }
  const board = new Board(port.comName);

  board.on("ready", () => {
    console.log("READY");

    const SW_SERIAL0 = board.SERIAL_PORT_IDs.SW_SERIAL0;
    const maxBytesToRead = 4;

    board.serialConfig({
      portId: SW_SERIAL0,
      baud: 9600,
      rxPin: 10,
      txPin: 11
    });

    board.serialRead(SW_SERIAL0, maxBytesToRead, data => {
      console.log(new Buffer(data).toString("ascii"));
    });
  });
});
