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
  this.MODES={
    INPUT:0x00,
    OUTPUT:0x01,
    ANALOG:0x02,
    PWM:0x03,
    SERVO:0x04   
  };
  this.HIGH=1;
  this.LOW=0;
  //the first two pins are for serial communication
  this.pins=[];
  this.analogPins=[];
  this.version={};
  this.firmware={};
  this.timeoutId = setTimeout(function(){
      //callback('Time Out');
  },10000);
  this.currentBuffer=[];
  this.sp=new SerialPort(port,{baudrate:57600,buffersize:1});
  this.sp.on('data',function(data){
    if((board.currentBuffer.length == 0 && data[0] != 0 || board.currentBuffer.length)){
      board.currentBuffer.push(data[0]);
    }
    var cmd=board.currentBuffer[0]&0xF0;
    if(board.currentBuffer.length==3 && board.currentBuffer[0] != START_SYSEX){
      if(board.currentBuffer[0]==REPORT_VERSION){
        board.version.major = board.currentBuffer[1];
        board.version.minor = board.currentBuffer[2];
        board.emit('reportversion');
        for(i=0;i<16;i++){
          board.sp.write([REPORT_DIGITAL | i,1]);
          board.sp.write([REPORT_ANALOG | i,1]);
        }
      }else if(board.pins.length > 2) {
          if(cmd == ANALOG_MESSAGE){
            var value =board.currentBuffer[1]|(board.currentBuffer[2] << 7);
            var port = board.currentBuffer[0]&0x0F;
            if(board.pins[board.analogPins[port]]){
                board.pins[board.analogPins[port]].value = value;
            }
            board.emit('analog-read-'+port,value);
            board.emit('analog-read',{pin:port,value:value});
          }else if(cmd == DIGITAL_MESSAGE){
            var port = (board.currentBuffer[0]&0x0F);
            var portValue = board.currentBuffer[1]|(board.currentBuffer[2] << 7);
            for(var i = 0; i < 8; i++){
               var pinNumber = 8*port+i;
               var pin = board.pins[pinNumber];
               if(pin.mode == board.MODES.INPUT){
                 console.log(portValue);
                 pin.value = (portValue >> (i & 0x07)) & 0x01;
                 board.emit('digital-read-'+pinNumber,pin.value);
                 board.emit('digital-read',{pin: pinNumber,value:pin.value});
               }
            }
          }
      }
      board.currentBuffer=[];
    }else if (board.currentBuffer[0]==START_SYSEX && board.currentBuffer[board.currentBuffer.length-1]==END_SYSEX){
      switch(board.currentBuffer[1]){
        case QUERY_FIRMWARE:
          var firmwareBuf = [];
          board.firmware.version={};
          board.firmware.version.major=board.currentBuffer[2];
          board.firmware.version.minor=board.currentBuffer[3];
          for(var i = 4, length = board.length-3;i < length;i+=2){
              firmwareBuf.push((board.currentBuffer[i] & 0x7F)|((board.currentBuffer[i+1] & 0x7F) << 7));
          }
          board.firmware.name = new Buffer(firmwareBuf).toString('utf8',0,firmwareBuf.length);
          board.emit('queryfirmware');
          break;
        case CAPABILITY_RESPONSE:
          var supportedModes=0;
          var modesArray;
          for(i = 2 , n=0; i < board.currentBuffer.length-1; i++){
            if(board.currentBuffer[i]==127){        
              modesArray=[];
              Object.keys(board.MODES).forEach(function(mode){
                  if(supportedModes & (1 << board.MODES[mode])){
                      modesArray.push(board.MODES[mode]);
                  }
              });
              board.pins.push({supportedModes:modesArray,mode:board.MODES.OUTPUT});
              supportedModes=0;
              n=0;
              continue;
            }
            if(n==0){
              supportedModes|=(1<<board.currentBuffer[i]);
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
          var currentValue;
          for(i = 2 ; i < board.currentBuffer.length-1;i++){
            currentValue = board.currentBuffer[i];  
            board.pins[pin].analogChannel=currentValue;
            if(currentValue != 127){
                board.analogPins.push(pin);
            }
            pin++;
          }
          board.emit('analog-mapping-query');
          break;
      }
      board.currentBuffer=[];
    }
  });
  this.sp.on('error',function(string){
     if(board.timeoutId){
        clearTimeout(board.timeoutId);
        board.timeoutId == null;
     }
    callback(string);
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
            board.queryPinState(pinsToQuery[i],function(){
                callback();
            });
          }
          else{
            board.queryPinState(pinsToQuery[i],function(){});
          }
        }
      });
    });
  });
  process.on('SIGINT',function(){
      board.sp.close();
  });
    process.on('SIGTERM',function(){
      board.sp.close();
  });
}
sys.inherits(Board,events.EventEmitter);
Board.prototype.reportDigital=function(pin,bit){
  this.sp.write([REPORT_DIGITAL|pin,1]);
};
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
  this.pins[pin].value=value;
  this.sp.write([ANALOG_MESSAGE|pin,value & 0x7F,(value >> 7) & 0x7F]);
};
Board.prototype.pinMode=function(number,state){
  this.pins[number].mode=state;  
  this.sp.write([PIN_MODE,number,state]);
};
Board.prototype.digitalWrite=function(pin,value){
  var port = Math.floor(pin/8);
  var portValue=0;
  this.pins[pin].value=value;
  for(var i=0;i<8;i++){
    if(this.pins[8*port+i].value)
     portValue |= (1<<i);
  }
  this.sp.write([DIGITAL_MESSAGE|port,portValue & 0x7F,(portValue >> 7) & 0x7F]);
};
Board.prototype.digitalRead=function(pin,callback){
  this.addListener('digital-read-'+pin,callback);
};
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
