const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Board(port.comName);

  board.on("close", () => {
    // Unplug the board to see this event!
    console.log("Closed!");
  });
});
