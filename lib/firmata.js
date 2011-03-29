var SerialPort=require('serialport').SerialPort
,   sys=require('sys')
,   events=require('events');
const  PIN_MODE=0xF4
,      REPORT_DIGITAL=0xD0
,      REPORT_ANALOG=0xC0
,      DIGITAL_MESSAGE=0x90
,      START_SYSEX=0xF0
,      END_SYSEX=0xF7
,      QUERY_FIRMWARE=0x79
,      REPORT_VERSION=0xF9
,      ANALOG_MESSAGE=0xE0
,      CAPABILITY_QUERY=0x6B
,      CAPABILITY_RESPONSE=0x6C
,      PIN_STATE_QUERY=0x6D
,      PIN_STATE_RESPONSE=0x6E
,      ANALOG_MAPPING_QUERY=0x69
,      ANALOG_MAPPING_RESPONSE=0x6A;
var Board=function(port,callback){
  events.EventEmitter.call(this);
  var board=this;
  this.OUTPUT=1;
  this.INPUT=0;
  this.PWM=3;
  this.HIGH=1;
  this.LOW=0;
  this.pins=new Array(128);
  for(i=0;i<128;i++){
    this.pins[i]={
      value:0,
      supportedModes:0,
      mode:255
    };
  }
  this.currentBuffer=[];
  this.sp=new SerialPort(port,{baudrate:57600,buffersize:1});
  this.sp.on('data',function(data){
    if((board.currentBuffer.length == 0 && data[0] != 0 || board.currentBuffer.length)){
      board.currentBuffer.push(data[0]);
    }
    var cmd=board.currentBuffer[0]&0xF0;
    if(board.currentBuffer.length==3 && board.currentBuffer[0] != START_SYSEX){
      if(board.currentBuffer[0]==REPORT_VERSION){
        board.emit('reportversion',{major:board.currentBuffer[1],minor:board.currentBuffer[2]});
        for(i=0;i<16;i++){
          board.sp.write([REPORT_DIGITAL | i,1]);
          board.sp.write([REPORT_ANALOG | i,1]);
        }
      }else if(cmd == ANALOG_MESSAGE){
        var port = board.currentBuffer[0]&0x0F;      
        board.emit('analog-read-'+port,board.currentBuffer[1]|(board.currentBuffer[2] << 7));
        board.emit('analog-read',{pin:port,data:board.currentBuffer[1]|(board.currentBuffer[2] << 7)});
      }else if(cmd == DIGITAL_MESSAGE){
        //to do
      }
      board.currentBuffer=[];
    }else if (board.currentBuffer[0]==START_SYSEX && board.currentBuffer[board.currentBuffer.length-1]==END_SYSEX){
      switch(board.currentBuffer[1]){
        case QUERY_FIRMWARE:
          break;
        case CAPABILITY_RESPONSE:
          var pin = 0;
          for(i = 2 , n=0; i < board.currentBuffer.length-1; i++){
            if(board.currentBuffer[i]==127){
              pin++;
              n=0;
              continue;
            }
            if(n==0){
              board.pins[pin].supportedModes|=(1<<board.currentBuffer[i]);
            }
            n^=1;
          }
          board.emit('capability-query');
          break;
        case PIN_STATE_RESPONSE:
          var pin = board.currentBuffer[2];
          board.pins[pin].mode=board.currentBuffer[3];
          board.pins[pin].value=board.currentBuffer[4];
          if(board.currentBuffer.length > 6){
            board.pins[pin].value |=(board.currentBuffer[5] << 7)
          }
          if(board.currentBuffer.length > 7){
            board.pins[pin].value |=(board.currentBuffer[6] << 14);
          }
          board.emit('pin-state-'+pin);
          break;
        case ANALOG_MAPPING_RESPONSE:
          var pin = 0;
          for(i = 2 ; i < board.currentBuffer-1;i++){
            board.pins[pin].analogChannel=board.currentBuffer[i];
            pin++;
          }
          break;
      }
      board.currentBuffer=[];
    }
  });
  this.sp.on('error',function(string){
    console.log(string);
  });
  this.reportVersion(function(){
    board.queryCapabilities(function(){
      board.queryAnalogMapping(function(){
        var pinsToQuery=[]
        for(i = 0; i < board.pins.length ; i++){
          pinsToQuery[i]=i;
        }
        for(i = 0; i < pinsToQuery.length;i++){
          if(i == pinsToQuery.length - 1){
            board.queryPinState(pinsToQuery[i],callback);
          }
          else{
            board.queryPinState(pinsToQuery[i],function(){});
          }
        }
      });
    });
  });
}
sys.inherits(Board,events.EventEmitter);
Board.prototype.reportVersion=function(callback){
  this.once('reportversion',callback);
  this.sp.write(REPORT_VERSION);
};
Board.prototype.queryFirmware=function(callback){
  this.once('queryfirmware',callback);
  this.sp.write([START_SYSEX,QUERY_FIRMWARE,END_SYSEX]);
};
Board.prototype.analogRead=function(pin,callback){
  this.addListener('analog-read-'+pin,callback);
};
Board.prototype.analogWrite=function(pin,value){
  this.sp.write([ANALOG_MESSAGE|pin,value&0x7F,(value >> 7)& 0x7F]);
};
Board.prototype.pinMode=function(number,state){
  this.sp.write([PIN_MODE,number,state]);
};
Board.prototype.digitalWrite=function(pin,value){
  var port = Math.floor(pin/8);
  var portValue=0;
  this.pins[pin]=value;
  for(i=0;i<8;i++){
    if(this.pins[8*port+i])
     portValue |= (1<<i);
  }
  this.sp.write([DIGITAL_MESSAGE|port,portValue & 0x7F,(portValue >> 7)&0x7F]);
}
Board.prototype.queryCapabilities=function(callback){
  this.once('capability-query',callback);
  this.sp.write([START_SYSEX,CAPABILITY_QUERY,END_SYSEX]);
};
Board.prototype.queryAnalogMapping=function(callback){
  this.once('analog-mapping-query',callback);
  this.sp.write([START_SYSEX,ANALOG_MAPPING_QUERY,END_SYSEX]);
};
Board.prototype.queryPinState=function(pin,callback){
  this.once('pin-state-'+pin,callback);
  this.sp.write([START_SYSEX,PIN_STATE_QUERY,pin,END_SYSEX]);
};
module.exports={Board:Board}; 
