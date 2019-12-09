const Board = require("../");

Board.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Board(port.path);

  board.on("ready", () => {

    board.accelStepperConfig({
      deviceNum: 0,
      type: board.STEPPER.TYPE.DRIVER,
      stepPin: 5,
      directionPin: 6,
      enablePin: 2,
      invertPins: [2]
    });

    board.accelStepperSpeed(0, 400);
    board.accelStepperAcceleration(0, 100);
    board.accelStepperEnable(0, true);
    board.accelStepperStep(0, 200, position => {
      console.log(`Current position: ${position}`);
    });

  });
});
