// noinspection JSUnusedGlobalSymbols

'use strict';

/* eslint no-var: 0 */
const util = require('util');
const events = require('events');
const sprintf = require('sprintf-js').sprintf;

const AGIReply = function(line) {
  this.rawReply = line.trim();
  this.code = parseInt(this.rawReply);
  this.attributes = {};

  const self = this;

  const items = this.rawReply.split(' ');

  items.forEach(function(item) {
    if (item.indexOf('=') > 0) {
      const subItems = item.split('=');

      self.attributes[subItems[0]] = subItems[1];
    }
  });

  const m = this.rawReply.match(/\((.*)\)/);

  if (m) {
    this.extra = m[1];
  }
};


const AGIChannel = function(request, mapper) {
  events.EventEmitter.call(this);

  const self = this;

  self.request = request;
  self.cmdId = 0;
  self.active = true
  self.callback = null

  if (typeof mapper === 'function') {
    mapper = {
      default: mapper
    };
  } else if (typeof mapper != 'object') {
    self.emit('error', 'Invalid mapper');
    return;
  }

  // locate the script
  let script;

  if (request.network_script) {
    script = mapper[request.network_script];
  }

  if (!script) {
    script = mapper.default;
  }

  if (!script) {
    self.emit('error', 'Could not find requested script');
    return;
  }

  process.nextTick(function() {
    let stop = true
    try {
      stop = script(self);
    } catch (ex) {
      // console.log('Exception in script', ex, ex.stack);
      this.active = false
      self.emit('error', ex);
    }
    if (stop !== false) {
      self.done();
    }
  });
};

util.inherits(AGIChannel, events.EventEmitter);

AGIChannel.prototype.done = function () {
  if (this.active === true) {
    this.emit('done'); // script has finished
    this.active = false
  }
}

AGIChannel.prototype.handleReply = function(reply) {
  if (this.callback) {
    if (reply === 'hangup') {
      this.callback('hangup');
    } else {
      this.callback(null, new AGIReply(reply));
    }
  }
};

AGIChannel.prototype._sendRequest = function (request, myCallback) {
  if (this.callback === null) {
    this.callback = myCallback
    this.cmdId = this.cmdId + 1;
    this.emit('request', request, this.cmdId);
  } else {
    process.nextTick(function () {
      this._sendRequest(request, myCallback)
    });
  }
}

/**
 *
 * @param request
 * @returns {Promise<unknown>}
 */
AGIChannel.prototype.sendRequest = function(request) {
  const self = this;
  return new Promise((resolve, reject) => {
    const myCallback = function (hangup, reply) {
      self.callback = null
      if (hangup !== null) {
        reject(hangup)
      } else {
        resolve(reply)
      }
    };
    this._sendRequest(request, myCallback)
  });
};


// external API
/**
 *
 * @returns {Promise<number>}
 */
AGIChannel.prototype.answer = function() {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await this.sendRequest('ANSWER');
      resolve(parseInt(result.attributes.result || -1));
    } catch (e) {
      reject(e)
    }
  })
};

/**
 *
 * @param channelName
 * @returns {Promise<unknown>}
 */
AGIChannel.prototype.channelStatus = function(channelName) {
  return new Promise(async (resolve, reject) => {
    try {
      channelName = channelName || '';

      const result = await this.sendRequest(sprintf('CHANNEL STATUS %s', channelName));

      resolve(parseInt(result.attributes.result || -1));
    } catch (e) {
      reject(e)
    }
  })

};

/**
 *
 * @param app
 * @param params
 * @returns {Promise<*>}
 */
AGIChannel.prototype.exec = function(app, params) {

  if (params === undefined) {
    params = '';
  }

  return this.sendRequest(sprintf('EXEC %s %s', app, params));
};

/**
 *
 * @param file
 * @param timeout
 * @param maxDigits
 * @returns {Promise<unknown>}
 */
AGIChannel.prototype.getData = function(file, timeout, maxDigits) {
  timeout = (timeout === undefined) ? '' : timeout;
  maxDigits = (maxDigits === undefined) ? '' : maxDigits;
  return new Promise(async (resolve, reject) => {
    try {
      const result = await this.sendRequest(sprintf('GET DATA "%s" %s %s', file, timeout,
        maxDigits));

      resolve(result.attributes.result);
    } catch (e) {
      reject(e)
    }
  })

};

/**
 *
 * @param variable
 * @param channel
 * @returns {Promise<unknown>}
 */
AGIChannel.prototype.getFullVariable = function(variable, channel) {
  channel = (channel === undefined) ? '' : channel;
  return new Promise(async (resolve, reject) => {
    try {
      const result = await this.sendRequest(sprintf('GET FULL VARIABLE %s %s', variable, channel));

      if (result.extra) {
        resolve(result.extra);
      } else {
        resolve(null);
      }
    } catch (e) {
      reject(e)
    }
  })
};

/**
 *
 * @param file
 * @param escapeDigits
 * @param timeout
 * @returns {Promise<*>}
 */
AGIChannel.prototype.getOption = function(file, escapeDigits, timeout) {
  escapeDigits = (escapeDigits === undefined) ? '' : escapeDigits;
  timeout = (timeout === undefined) ? '' : timeout;

  return this.sendRequest(sprintf('GET OPTION "%s" %s" %s', file, escapeDigits, timeout));
};

/**
 *
 * @param variable
 * @returns {Promise<unknown>}
 */
AGIChannel.prototype.getVariable = function(variable) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await this.sendRequest(sprintf('GET VARIABLE "%s"', variable));


      if (result.extra) {
        resolve(result.extra);
      } else {
        resolve(null);
      }
    } catch (e) {
      reject(e)
    }
  })
};

/**
 *
 * @returns {Promise<*>}
 */
AGIChannel.prototype.noop = function() {
  return this.sendRequest('NOOP');
};

/**
 *
 * @param file
 * @param format
 * @param escapeDigits
 * @param timeout
 * @param silenceSeconds
 * @param beep
 * @returns {Promise<*>}
 */
AGIChannel.prototype.recordFile = function(file, format, escapeDigits, timeout, silenceSeconds,
  beep) {
  format = format || 'wav';
  escapeDigits = escapeDigits || '';
  timeout = (timeout === undefined) ? -1 : timeout;
  silenceSeconds = (silenceSeconds === undefined) ? '' : 's=' + silenceSeconds;
  beep = (beep) ? 'BEEP' : '';


  return this.sendRequest(sprintf('RECORD FILE "%s" "%s" "%s" %s %s %s',
    file, format, escapeDigits, timeout, beep, silenceSeconds));
};

/**
 *
 * @param file
 * @param escapeDigits
 * @returns {Promise<*>}
 */
AGIChannel.prototype.streamFile = function(file, escapeDigits) {
  escapeDigits = escapeDigits || '';

  return this.sendRequest(sprintf('STREAM FILE "%s" "%s"', file, escapeDigits));
};

/**
 *
 * @returns {Promise<*>}
 */
AGIChannel.prototype.hangup = function() {
  return this.sendRequest('HANGUP');
};

/**
 *
 * @param context
 * @returns {Promise<*>}
 */
AGIChannel.prototype.setContext = async function(context) {
  return this.sendRequest(sprintf('SET CONTEXT %s', context));
};

/**
 *
 * @param extension
 * @returns {Promise<*>}
 */
AGIChannel.prototype.setExtension = async function(extension) {
  return this.sendRequest(sprintf('SET EXTENSION %s', extension));
};

/**
 *
 * @param priority
 * @returns {Promise<*>}
 */
AGIChannel.prototype.setPriority = async function(priority) {
  return this.sendRequest(sprintf('SET PRIORITY %s', priority));
};

/**
 *
 * @param variable
 * @param value
 * @returns {Promise<*>}
 */
AGIChannel.prototype.setVariable = function(variable, value) {
  return this.sendRequest(sprintf('SET VARIABLE %s %s', variable, value));
};

/**
 *
 * @param context
 * @param extension
 * @param priority
 * @returns {Promise<unknown>}
 */
AGIChannel.prototype.continueAt = function(context, extension, priority) {
  return new Promise(async (resolve, reject) => {
    try {
      extension = extension || this.request.extension;
      priority = priority || 1;

      await this.setContext(context);
      await this.setExtension(extension);
      await this.setPriority(priority);
      resolve()
    } catch (e) {
      reject(e)
    }
  });
};

/**
 *
 * @param buffer
 * @returns {{}}
 */
AGIChannel.parseBuffer = function(buffer) {
  const request = {};

  buffer.split('\n').forEach(function(line) {
    const items = line.split(/:\s?/);

    if (items.length === 2) {
      let name = items[0].trim();

      if (name.indexOf('agi_') === 0) {
        name = name.substring(4);
      }
      request[name] = items[1].trim();
    }
  });

  return request;
};


module.exports = AGIChannel;
