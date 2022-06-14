'use strict';

/* eslint no-var: 0 */

const util = require('util');
const events = require('events');
const AGIChannel = require('./agi-channel');
const net = require('net');

// Embedded connection handler
const AGIConnection = function(mapper, conn) {
  this.conn = conn;
  this.mapper = mapper;
  this.buffer = '';

  const self = this;

  conn.on('data', this.handleData.bind(this));
  conn.on('end', function() {
    if (self.handler) {
      self.handler('hangup');
    }
    self.conn.destroy();
  });
};

AGIConnection.prototype.handleData = function(data) {
  const self = this;

  data = data.toString();

  if (data.indexOf('HANGUP') === 0) {
    if (self.handler) {
      self.handler('hangup');
    }
    return;
  }

  if (self.handler) {
    self.handler(data.trim());
  } else {
    this.buffer += data;
    if (this.buffer.indexOf('\n\n') >= 0) {
      // environment is sent
      const request = AGIChannel.parseBuffer(this.buffer);
      const channel = new AGIChannel(request, this.mapper);

      this.handler = channel.handleReply.bind(channel);

      channel.on('request', function(req) {
        self.conn.write(req + '\n');
      });

      channel.on('done', function() {
        self.conn.destroy();
        self.conn = null;
      });

      channel.on('error', function() {
        self.conn.destroy();
        self.conn = null;
      });
    }
  }
};


const AGIServer = function(mapper, listenPort) {
  this.listenPort = listenPort || 4573;
  this.mapper = mapper;

  this.tcpServer = net.createServer(this.handleConnection.bind(this));

  const self = this;

  process.nextTick(function() {
    self.tcpServer.listen(self.listenPort, function() {
      self.emit('ready');
    });
  });
};

util.inherits(AGIServer, events.EventEmitter);

AGIServer.prototype.handleConnection = function(conn) {
  return new AGIConnection(this.mapper, conn);
};

module.exports = AGIServer;
