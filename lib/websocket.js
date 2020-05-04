'use strict';

var util = require('util');
var path = require('path');
var Utils = require('./utils.js').Utils;
var ip, port, plugin_name, accessories, Characteristic, addAccessory, removeAccessory, getAccessories;
const WebSocket = require('ws');

module.exports = {
  Websocket: Websocket
}

function Websocket(params) {

  this.log = params.log;
  ip = params.ip;
  port = params.port;
  plugin_name = params.plugin_name;
  accessories = params.accessories;
  Characteristic = params.Characteristic;
  addAccessory = params.addAccessory;
  removeAccessory = params.removeAccessory;
}

Websocket.prototype.startClient = function(deviceSettings) {
  var connection = new WebSocket("ws://" + ip + ":" + port);

  connection.on('open',() => {
    this.log.debug("on.open");  
  });

  connection.on('message',(data) => {
    this.onMessage(data, deviceSettings);
  });

}

Websocket.prototype.onMessage = function(data, deviceSettings) {

  var msg = JSON.parse(data);
  var event = msg.e;
  var deviceId = msg.id;
  var setting = deviceSettings[deviceId];

  if(setting === undefined)
  {
    return;
  }
  
  switch (event) {
    case "changed":
      this.log.debug("onMessage changed %s", data);

      // Handle toggle switch
      var characteristics = accessories[setting.name].i_value;

      var newValue = !characteristics.On;
      this.log("Set value from %s to %s", characteristics.On, newValue);
      accessories[setting.name].save_and_setValue("websocket", "On", newValue);
      this.log.warn("setValue %s", newValue);
      break;
    default:
      this.log.warn("onMessage unknown event %s", msg);
      break;
  }
}

Websocket.prototype.validate = function(accessory) {

  var name = accessory.name;
  var c = accessory.characteristic;
  var value = accessory.value;
  
  var isValid = false;
  var message = "";
  
  if(typeof(accessories[name]) === "undefined") {
    message = "name '" + name + "' undefined.";
  } else if (typeof(Characteristic[c]) !== "function") {
      message = "characteristic '" + c + "' undefined.";
  } else if (typeof(accessory.value) === "undefined" || accessory.value === null) {
      message = "name '" + name + "' value undefined.";
  } else if (typeof(accessories[name].service.getCharacteristic(Characteristic[c])) === "undefined"){
    message = "name '" + name + "' characteristic do not match.";
  } else {
    var result = {};
    result = accessories[name].parseValue(c, value);
    isValid = result.isValid;
    value = result.value;
    if (!isValid) {
      message = "value '" + value + "' outside range";
    } else {
      message = "name '" + name + "' is valid.";
    }
  }
  
  return {isValid: isValid, message: message, value: value};
}

Websocket.prototype.get = function(name, c, callback) {
  // callback not used
  
  // this.log.debug("get %s %s", name, c);
  
  if (typeof(this.ws) !== "undefined" && this.ws.OPEN) {
    var data = {"topic": "get", "payload": {"name": name, "characteristic": c}};
    this.sendData(data);
  } else {
    this.log.debug("get client disconnected.");
  }
}

Websocket.prototype.set = function(name, c, value, callback) {
 
  if (typeof(this.ws) !== "undefined" && this.ws.OPEN) {       

    if (c === "On") {
      value = (value == 0 || value == false) ? false : true;
    }
    
    var data = {"topic": "set", "payload": {"name": name, "characteristic": c, "value": value}};
    
    switch (c) {
      case "Brightness":
      case "TargetPosition":
      case "TargetHorizontalTiltAngle":
      case "TargetVerticalTiltAngle":
      case "TargetRelativeHumidity":
      case "TargetTemperature":
        if (set_timeout && name === pre_name && c === pre_c) {
          clearTimeout(set_timeout);
        }
        set_timeout = setTimeout(function() {
          this.log.debug("set %s %s %s", name, c, value);
          this.sendData(data);
        }.bind(this), 300);
        pre_name = name;
        pre_c = c;
        break;
        
      default:
        this.log.debug("set %s %s %s", name, c, value);
        this.sendData(data);
    }
    callback(); // todo error handling
  } else {
    this.log.debug("get client disconnected.");
    callback("disconnected");
  }
}

Websocket.prototype.sendAccessories = function (accessories) {

  if (typeof(this.ws) !== "undefined" && this.ws.OPEN) {
    var data = {"topic": "accessories", "payload": accessories};
    this.sendData(data);
  } else {
    this.log.error("sendAck client disconnected.");
  }
}

Websocket.prototype.sendAck = function (ack, message) {

  if (typeof(this.ws) !== "undefined" && this.ws.OPEN) {
    var data = {"topic":"response", "payload": {"ack": ack, "message": message}}; 
    this.sendData(data);
  } else {
    this.log.error("sendAck client disconnected.");
  }
}

Websocket.prototype.sendData = function(data) {

  if (typeof(this.ws) !== "undefined" && this.ws.OPEN) {
    var j_data = JSON.stringify(data);
    
    this.log.debug("sendData %s", JSON.stringify(data)); // JSON.stringify(data, null, 2));
    
    this.ws.send(j_data, function ack(error) {
      if (error) this.log("sendData %s", error);
    }.bind(this));
  }
}
