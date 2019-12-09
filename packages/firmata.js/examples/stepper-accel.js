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
      type: board.STEPPER.TYPE.FOUR_WIRE,
      motorPin1: 4,
      motorPin2: 5,
      motorPin3: 6,
      motorPin4: 7,
      stepSize: board.STEPPER.STEP_SIZE.WHOLE
    });

    board.accelStepperSpeed(0, 300);
    board.accelStepperAcceleration(0, 100);
    board.accelStepperStep(0, 2000, position => {
      console.log(`Current position: ${position}`);
    });
  });
});
