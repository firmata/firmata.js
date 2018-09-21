const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Board(port.comName);

  console.log(__filename);
  console.log("------------------------------");

  board.on("open", () => {
    console.log("  ✔ open");
  });

  board.on("reportversion", () => {
    console.log("  ✔ reportversion");
  });

  board.on("queryfirmware", () => {
    console.log("  ✔ queryfirmware");
  });

  board.on("capability-query", () => {
    console.log("  ✔ capability-query");
  });

  board.on("ready", () => {
    console.log("  ✔ ready");
    clearTimeout(timeout);

    const SW_SERIAL0 = board.SERIAL_PORT_IDs.SW_SERIAL0;

    board.serialConfig({
      portId: SW_SERIAL0,
      baud: 9600,
      rxPin: 2,
      txPin: 3
    });

    board.serialRead(SW_SERIAL0, () => {
      console.log("  ✔ received data (exiting)");
      console.log("------------------------------");
      process.exit();
    });
  });

  var timeout = setTimeout(() => {
    console.log(board.currentBuffer);
    console.log(">>>>>>>>>>>>>>TIMEOUT<<<<<<<<<<<<<<");
    console.log("------------------------------");
    process.exit();
  }, 10000);
});
