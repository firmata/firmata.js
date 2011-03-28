var firmata=require('../lib/firmata.js')
   ,dataPin=12
   ,clockPin=11;
var board=new firmata.Board('/dev/ttyACM0',function(version){
  console.log(version);
  board.pinMode(dataPin,board.OUTPUT);
  board.pinMode(clockPin,board.OUTPUT);
  board.digitalWrite(dataPin,board.HIGH);
  board.digitalWrite(clockPin,board.HIGH);
  board.digitalWrite(dataPin,board.LOW);
  board.digitalWrite(clockPin,board.LOW);
  board.digitalWrite(clockPin,board.HIGH);
  board.digitalWrite(dataPin,board.HIGH);
  board.digitalWrite(clockPin,board.LOW);
  //try shift out
  tempCommand=00000011;
  for(i=0;i<8;i++){
    board.digitalWrite(dataPin,!!(tempCommand & (1 << (7 - i))));
    board.digitalWrite(clockPin,board.LOW);
    board.digitalWrite(clockPin,board.HIGH);
  }
  board.digitalWrite(clockPin,board.HIGH);
  board.pinMode(dataPin,board.INPUT);
});
