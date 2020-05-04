'use strict';

var util = require('util');
var Utils = require('./lib/utils.js').Utils;
var WebsocketAccessory = require('./lib/accessory.js').Accessory;
var Websocket = require('./lib/websocket.js').Websocket;

var Accessory, Service, Characteristic, UUIDGen;

var platform_name = "deconz-websocket";
var plugin_name = "homebridge-" + platform_name;

module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version);
  
  Accessory = homebridge.platformAccessory;
  
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid; // Universally Unique IDentifier
  
  
  homebridge.registerPlatform(plugin_name, platform_name, WebsocketPlatform, true);
}

function WebsocketPlatform(log, config, api) {

  this.log = log;
  this.accessories = {};
  this.hap_accessories = {};
  
  this.log.debug("config = %s", JSON.stringify(config));
  
  if (typeof(config) !== "undefined" && config !== null) {
    this.port = config.port || {"port": 443};
  } else {
    this.log.error("config undefined or null!");
    process.exit(1);
  }

  if(config.ip === "undefined" || config.ip  === null)
  {
    this.log.error("ip undefined or null");
    process.exit(1);
  }
     
  var plugin_version = Utils.readPluginVersion();
  this.log("%s v%s", plugin_name, plugin_version);
  
  var params = {
    "log": this.log,
    "plugin_name": plugin_name,
    "ip": config.ip,
    "port": this.port,
    "accessories": this.accessories,
    "deviceSettings": config.deviceSettings,
    "Characteristic": Characteristic,
    "addAccessory": this.addAccessory.bind(this),
    "removeAccessory": this.removeAccessory.bind(this)
  }

  if (api) {
    this.api = api;

    this.api.on('didFinishLaunching', function() {
      this.log("Plugin - DidFinishLaunching");
     
      // Add accessory in config
      var deviceSettings = {};
      for(var i = 0; i< config.deviceSettings.length; i++)
      {
        var setting = config.deviceSettings[i];
        deviceSettings[setting.id] = setting;
        // Create the mapping device
        switch(setting.type)
        {
          case "toggleSwitch":
            var accessoryDef = {};
            accessoryDef.name = setting.name;
            accessoryDef.service = "Switch";
            this.addAccessory(accessoryDef);
            break;
            default:
              this.log.warn("Unknown type of device " + setting.id + "with type " + setting.type);
              break;

        }
     }

     this.Websocket.startClient(deviceSettings);
             
      this.log("Number of Accessories: %s", Object.keys(this.accessories).length);

    }.bind(this));
  }

  this.Websocket = new Websocket(params);
}

WebsocketPlatform.prototype.addAccessory = function(accessoryDef) {

  var name = accessoryDef.name;
  var ack, message;
  var isValid;
  var service_type = accessoryDef.service;
  var manufacturer = accessoryDef.manufacturer;
  var model = accessoryDef.model;
  var serialnumber = accessoryDef.serialnumber;
  var firmwarerevision = accessoryDef.firmwarerevision;
  var service_name;
  
  if (!this.accessories[name]) {
    var uuid = UUIDGen.generate(name);
    
    var newAccessory = new Accessory(name, uuid);
    newAccessory.reachable = true;
    newAccessory.context.service_name = accessoryDef.service;
    
    //this.log.debug("addAccessory UUID = %s", newAccessory.UUID);
    
    var i_accessory = new WebsocketAccessory(this.buildParams(accessoryDef));
    isValid = i_accessory.addService(newAccessory);
    if (isValid) {
      i_accessory.configureAccessory(newAccessory);
      
      this.accessories[name] = i_accessory;
      this.hap_accessories[name] = newAccessory;
      this.api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);
      
      ack = true;
      message =  "accessory '" + name + "' is added.";
    } else {
      ack = false;
      message = "service '" + accessoryDef.service + "' undefined.";
    }
  } else {
    ack = false;
    message = "name '" + name + "' is already used.";
  }

  this.log("addAccessory %s", message);
}

WebsocketPlatform.prototype.setAccessoryInformation = function(accessory) {

  this.log("WebsocketPlatform.setAccessoryInformation %s", JSON.stringify(accessory));
  var message;
  var ack;
  var name = accessory.name;

  if (typeof this.hap_accessories[name] === "undefined") {
    ack = false; message = "accessory '" + name + "' undefined.";
  } else {
    var service = this.hap_accessories[name].getService(Service.AccessoryInformation);

    if (typeof accessory.manufacturer !== "undefined") {
      service.setCharacteristic(Characteristic.Manufacturer, accessory.manufacturer);
      ack = true;
    }
    if (typeof accessory.model !== "undefined") {
      service.setCharacteristic(Characteristic.Model, accessory.model);
      ack = true;
    }
    if (typeof accessory.serialnumber !== "undefined") {
      service.setCharacteristic(Characteristic.SerialNumber, accessory.serialnumber);
      ack = true;
    }
    if (typeof accessory.firmwarerevision !== "undefined") {
      service.setCharacteristic(Characteristic.FirmwareRevision, accessory.firmwarerevision);
      ack = true;
    }

    if (ack) {
      message = "accessory '" + name + "', accessoryinformation is set.";
    } else {
      message = "accessory '" + name + "', accessoryinforrmation properties undefined.";
    }
  }
} 
  
WebsocketPlatform.prototype.configureAccessory = function(accessory) {

  //this.log.debug("configureAccessory %s", JSON.stringify(accessory.services, null, 2));
  
  var name = accessory.displayName;
  var uuid = accessory.UUID;
    
  var accessoryDef = {};
  accessoryDef.name = name;
  accessoryDef.service = accessory.context.service_name;

  var i_accessory = this.accessories[name];

  if(i_accessory)
  {
    return;
  }
  
  if (i_accessory === undefined || i_accessory === null) {
    i_accessory = new WebsocketAccessory(this.buildParams(accessoryDef));
  
    this.accessories[name] = i_accessory;
    this.hap_accessories[name] = accessory;
  }
  
  accessory.reachable = true;
    
  i_accessory.configureAccessory(accessory);
}

WebsocketPlatform.prototype.removeAccessory = function(name) {

  var ack, message;
  
  if (typeof(this.accessories[name]) !== "undefined") {
    this.log.debug("removeAccessory '%s'", name);
    
    this.api.unregisterPlatformAccessories(plugin_name, platform_name, [this.hap_accessories[name]]);
    delete this.accessories[name];
    delete this.hap_accessories[name];
    ack = true;
    message = "accessory '" + name + "' is removed.";
  } else {
    ack = false;
    message = "accessory '" + name + "' not found.";
  }
  this.log("removeAccessory %s", message);
  this.Websocket.sendAck(ack, message);
}

WebsocketPlatform.prototype.getAccessory = function(name) {
  return this.accessories[name];
}

WebsocketPlatform.prototype.buildParams = function (accessoryDef) {

  var params = {
    "accessoryDef": accessoryDef,
    "log": this.log,
    "Service": Service,
    "Characteristic": Characteristic,
    "Websocket": this.Websocket
  }
  //this.log.debug("configureAccessories %s", JSON.stringify(params.accessory_config));
  return params;
}