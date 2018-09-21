const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Board(port.comName);

  board.on("ready", () => {
    const pin = 13;
    let state = 1;

    board.pinMode(pin, board.MODES.OUTPUT);

    setInterval(() => {
      board.digitalWrite(pin, (state ^= 1));
    }, 500);
  });
});
