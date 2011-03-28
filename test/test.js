var firmata=require('../lib/firmata');
var board=new firmata.Board('/dev/ttyACM0',function(firmwareVersion){
  var pin = 0;
  console.log(firmwareVersion);
  console.dir(board);
  board.setActive(7,1);
  board.pinMode(7,1);
  setInterval(function(){
    if(pin==1){
      pin=0;
    }else{
      pin=1;
    }
    board.digitalWrite(7,1);
  },500);
//  board.queryFirmware();
});
