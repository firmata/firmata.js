const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }
  const board = new Board(port.path);

  board.on("ready", () => {
    let degrees = 10;
    let incrementer = 10;
    board.pinMode(9, board.MODES.SERVO);
    board.servoWrite(9, 0);
    setInterval(() => {
      if (degrees >= 180 || degrees === 0) {
        incrementer *= -1;
      }
      degrees += incrementer;
      board.servoWrite(9, degrees);
    }, 500);
  });
});
