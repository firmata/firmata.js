var firmata=require('../lib/firmata.js');
var board=new firmata.Board('/dev/ttyACM0',function(){
//  board.pinMode(0,board.INPUT);
    board.pinMode(17,board.OUTPUT);
    console.log('board ready');
    board.analogRead(0,function(data){
      console.log(data);
      if(data > 500){
        board.digitalWrite(17,0);
      }else{
        board.digitalWrite(17,1);
      }
    });
});
