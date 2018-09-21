const Board = require("../");
const board = new Board("/dev/tty.usbmodem1421");

board.on("ready", () => {
  let degrees = 10;
  let incrementer = 10;

  // This will map 0-180 to 1000-1500
  board.servoConfig(9, 1000, 1500);
  board.servoWrite(9, 0);

  setInterval(() => {
    if (degrees >= 180 || degrees === 0) {
      incrementer *= -1;
    }
    degrees += incrementer;
    board.servoWrite(9, degrees);
    console.log(degrees);
  }, 500);
});
