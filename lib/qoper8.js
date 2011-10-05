/*

 ----------------------------------------------------------------------------
 | Q-Oper8: Node.js multi-process manager, to allow safe sync coding        |
 |                                                                          |
 | Copyright (c) 2011 M/Gateway Developments Ltd,                           |
 | Reigate, Surrey UK.                                                      |
 | All rights reserved.                                                     |
 |                                                                          |
 | http://www.mgateway.com                                                  |
 | Email: rtweed@mgateway.com                                               |
 |                                                                          |
 | The MIT License                                                          |
 |                                                                          |
 | Permission is hereby granted, free of charge, to any person obtaining a  |
 | copy of this software and associated documentation files (the            |
 | 'Software'), to deal in the Software without restriction, including      |
 | without limitation the rights to use, copy, modify, merge, publish,      |
 | distribute, sublicense, and/or sell copies of the Software, and to       |
 | permit persons to whom the Software is furnished to do so, subject to    |
 | the following conditions:                                                |
 |                                                                          |
 | The above copyright notice and this permission notice shall be included  |
 | in all copies or substantial portions of the Software.                   |
 |                                                                          |
 | THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS  |
 | OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF               |
 | MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.   |
 | IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY     |
 | CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,     |
 | TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE        |
 | SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                   |
 ----------------------------------------------------------------------------


 ************************************************************
 *
 *   See ReadMe documentation at https://github.com/robtweed/Q-Oper8
 *
 ************************************************************

  Get required modules:

*/

var cp = require('child_process');
var events = require("events");
var fs = require("fs");

/*
  Define the qoper8 object
*/

var qoper8 = {

  buildNo: 8,
  buildDate: "05 October 2011",
  version: function() {
    return 'Q-Oper8 build ' + qoper8.buildNo + ', ' + qoper8.buildDate;
  },
  allBusy: true,
  handlerType: "sync",

  asyncHandler: function() {
    qoper8.handlerType = "async";
  },

  fd: "\x01",
  rd: "\x02",
  actionNo: 0,
  requestInProcess: [],

  logger: function(text, clear) {
     //if (qoper8.logging) {
       var logpath = "/home/rob/gdbwork/childProcLog.txt";
       var fd;
       if (clear) fd = fs.openSync(logpath, 'w', 0755);
       fd = fs.openSync(logpath, 'a+', 0755);
       fs.writeSync(fd, text + '\r\n');
       fs.closeSync(fd);
     //}
  },

  terminator: "\x11\x12\x13\x14\x15",

  addToQueue: function(requestObj, responseHandler) {
    // puts a request onto the queue and triggers the queue to be processed
    qoper8.actionNo++;
    var action = requestObj.action;
    var queuedRequest = {
      no: qoper8.actionNo,
      action: action,
      requestObj: requestObj,
      handler: responseHandler
    };
    qoper8.queue.push(queuedRequest);
    qoper8.totalRequests++;
    var qLength = qoper8.queue.length;
    if (qLength > qoper8.maxQueueLength) qoper8.maxQueueLength = qLength;
    //* if (qoper8.trace) console.log("action added to Queue: queue length = " + qLength + "; requestNo = " + qoper8.totalRequests + "; after " + qoper8.elapsedTime() + " sec");
    //console.log("action = " + JSON.stringify(queuedRequest.action));
    // trigger the processing of the queue
    if (!qoper8.allBusy) qoper8.queueEvent.emit("processQueue");
  },

  getChildProcess: function(pidToTryFirst) {
    if (typeof pidToTryFirst !== 'undefined') {
      if (pidToTryFirst !== '') {
        if (qoper8.process[pidToTryFirst].isAvailable) {
          qoper8.process[pidToTryFirst].isAvailable = false;
          //console.log("request given to pid " + pidToTryFirst);
          return pidToTryFirst;
          // otherwise continue to try other processes
        }
      }
    }
    var pid;
    // try to find a free child process, otherwise return false
    for (pid in qoper8.process) {
      if (qoper8.process[pid].isAvailable) {
        qoper8.process[pid].isAvailable = false;
        return pid;
      }
    }
    qoper8.allBusy = true;
    return false;
  },

  processResponses: function(responses, callback) {
    //console.log("in processResponses: responses = " + responses);
    var pieces = responses.split(qoper8.terminator);
    var response = pieces.shift();
    if (response !== '') {
      responses = pieces.join(qoper8.terminator);
      callback(response);
      qoper8.processResponses(responses, callback);
    }
  }, 

  startChildProcesses: function(callback) {
    var process;
    var pid;

    var onChildProcMessage = function(callback) {
      var contentStr = '';
      var dataStr;
      var pieces;
      var response;
      var terminator = qoper8.terminator;

      qoper8.process[pid].stdout.on('data', function(data) {
        //console.log("data received: " + data);
        dataStr = data.toString();
        contentStr = contentStr + dataStr;
        if (contentStr.substr(-terminator.length) === terminator) {
          if (qoper8.handlerType === 'sync') {
            pieces = contentStr.split(terminator);
            contentStr = '';
            for (var i = 0; i < pieces.length; i++) {
              var response = pieces[i];
              if (response !== '') callback(response);
            }
          }
          else {
            var responses = contentStr;
            contentStr = '';
            qoper8.processResponses(responses, callback);
          }
        }
      });
    };

    var noStarted = 0;
    for (var i = 0; i < this.poolSize; i++) {
      process = cp.spawn('node', [qoper8.childProcessPath]);
      pid = process.pid
      qoper8.process[pid] = process;
      qoper8.process[pid].isAvailable = false;
      qoper8.process[pid].started = false;
      qoper8.requestsByProcess[pid] = 0;

     // define how responses from child processes are handled
     // *****************************************************
      //if (qoper8.trace) console.log("defining message listener for pid " + pid);
      onChildProcMessage(function(response) {
        //console.log("child process returned response " + response);
        response = JSON.parse(response);
        if (response.ok) {
          //qoper8.process[response.ok].isAvailable = true;
          if (!qoper8.process[response.ok].started) {
            noStarted++;
            qoper8.process[response.ok].started = true;
            qoper8.process[response.ok].isAvailable = true;
            if (noStarted === qoper8.poolSize) {
              qoper8.started = true;
              //* if (qoper8.trace) console.log("Q-Oper8 is ready!");
              qoper8.allBusy = false;
              qoper8.queueEvent.emit("processQueue");
              callback(qoper8.queue);
            }
          }
          else {
            // do whatever the master process needs to do with the child 
            // process's response by invoking the handler

            var process = qoper8.process[response.ok];
            //console.log("response.actionNo = " + response.actionNo);
            var queuedRequest = qoper8.requestInProcess[response.actionNo];
            //console.log("typeof queuedRequest = " + typeof(queuedRequest));

            //  var queuedRequest = {
            //    no: qoper8.actionNo,
            //    action: action,
            //    requestObj: requestObj,
            //    handler: responseHandler
            //  };
            var handler = queuedRequest.handler;
            var requestObj = queuedRequest.requestObj;
            delete qoper8.requestInProcess[response.actionNo];
            if (typeof handler !== 'undefined') {
              //if (qoper8.trace) console.log("running handler");
              qoper8.process[response.ok].isLastAction = false;
              if (parseInt(response.actionNo) === qoper8.process[response.ok].lastActionNo) qoper8.process[response.ok].isLastAction = true;
              handler(requestObj, response.response, response.ok);
              // release the child process back to the available pool
              if (qoper8.handlerType === 'sync') {
                //console.log("actionNo = " + response.actionNo + "; " + typeof(response.actionNo));
                //console.log("lastActionNo = " + qoper8.process[response.ok].lastActionNo + "; " + typeof(qoper8.process[response.ok].lastActionNo));
                if (parseInt(response.actionNo) === qoper8.process[response.ok].lastActionNo) {
                  //console.log("child process released!");
                  qoper8.process[response.ok].isAvailable = true;
                  qoper8.allBusy = false;
                  // now that it's available again, trigger the queue to be processed
                  //if (qoper8.trace) console.log("Child process " + response.ok + " returned to available pool");
                  qoper8.processQueue(response.ok);
                }
              }
            }
            else {
              qoper8.process[response.ok].isAvailable = true;
              qoper8.allBusy = false;
              // now that it's available again, trigger the queue to be processed
              //* if (qoper8.trace) console.log("Child process " + response.ok + " returned to available pool");
              //qoper8.queueEvent.emit("processQueue");
              qoper8.processQueue(response.ok);
            }
          }
        }
      });

      // *******************************************************

    }
  },
  
  processQueue: function(pidToTryFirst) {
    // tries to allocate queued actions to available child processes
    if (qoper8.queue.length > 0)  {
      qoper8.queueEvents++;
      //if (qoper8.trace) console.log("processing queue: " + qoper8.queueEvents + "; queue length " + qoper8.queue.length + "; after " + qoper8.elapsedTime() + " seconds");
      var queuedRequest;
      var pid = true;
      var process;
      var pidToTry = pidToTryFirst;
      while (pid) {
        //queuedRequest = qoper8.queue.shift();
        pid = qoper8.getChildProcess(pidToTry);
        pidToTry = '';
        if (pid) {
          process = qoper8.process[pid];
          // A free child process was found, so
          // dispatch action(s) to it
          //if (qoper8.trace) console.log("dispatching action to " + pid + ": action = " + JSON.stringify(queuedRequest.action));

          var getAnother = true;
          var requestString = '';
          var requestAction;
          var totalLen;
          var lastActionNo;

          while (getAnother) {
            if (qoper8.queue.length === 0) {
              getAnother = false;
              //console.log("1: sending to process " + pid + ": " + requestString);
              //console.log("1: sending (queue exhausted)");
              if (requestString !== '') {
                process.stdin.write(requestString + qoper8.terminator);
                requestString = '';
                process.lastActionNo = lastActionNo;
              }
            }
            else {
              queuedRequest = qoper8.queue.shift();
              actionNo = queuedRequest.no;
              requestAction = actionNo + qoper8.fd + JSON.stringify(queuedRequest.action) + qoper8.rd;
              totalLen = requestString.length + requestAction.length;
              if (totalLen > qoper8.maxMsgLength) {
                qoper8.queue.unshift(queuedRequest); // put last request back on the queue
                getAnother = false;
                //console.log("2: sending to process " + pid + ": " + requestString);
                //console.log("2: sending (" + requestString.length + ")");
                process.stdin.write(requestString + qoper8.terminator);
                requestString = '';
                process.lastActionNo = lastActionNo;
              }
              else {
                requestString = requestString + requestAction;
                qoper8.requestInProcess[actionNo] = queuedRequest;
                lastActionNo = actionNo;
              }
            }
          }

          // ****************************************

          // increment usage stats
          qoper8.connectionUpdate = true;
          qoper8.requestsByProcess[pid]++;
        }
        if (qoper8.queue.length === 0) {
          pid = false;
          //* if (qoper8.trace) console.log("queue exhausted");
        }
      }
      if (qoper8.queue.length > 0) {
        //if (qoper8.trace) console.log("queue processing aborted: no free child proceses available");
      }
    }
  },

  startTime: new Date().getTime(),

  elapsedTime: function() {
    var now = new Date().getTime();
    return (now - this.startTime)/1000;
  },

  maxQueueLength: 0,
  process: {},
  queue: [],
  queueEvent: new events.EventEmitter(),
  queueEvents: 0,
  requestsByProcess: {},

  started: false,
  totalRequests: 0,

  makeProcessAvailable: function(pid) {
    //console.log("in makeProcessAvailable - isLastAction = " + qoper8.process[pid].isLastAction);
    if (qoper8.process[pid].isLastAction) {
      //* if (qoper8.trace) console.log("makeProcessAvailable: pid = " + pid);
      qoper8.process[pid].isAvailable = true;
      qoper8.allBusy = false;
      // now that it's available again, trigger the queue to be processed
      //* if (qoper8.trace) console.log("Asynch handler: Child process " + pid + " returned to available pool");
      qoper8.processQueue(pid);
    }
  }

};


module.exports = {
  start: function(params, callback) {

    // define parameters / set defaults

    qoper8.poolSize = 4;
    if (typeof params.poolSize !== 'undefined') qoper8.poolSize = params.poolSize;
    qoper8.trace = true;
    if (typeof params.trace !== 'undefined') qoper8.trace = params.trace;
    qoper8.childProcessPath = __dirname + '/qoper8ChildProcess.js'
    if (typeof params.childProcessPath !== 'undefined') qoper8.childProcessPath = params.childProcessPath;
    qoper8.silentStart = false;
    if (typeof params.silentStart !== 'undefined') qoper8.silentStart = params.silentStart;
    qoper8.monitorInterval = 30000;
    if (typeof params.monitorInterval !== 'undefined') qoper8.monitorInterval = params.monitorInterval;
    qoper8.logging = false;
    if (typeof params.logging !== 'undefined') qoper8.logging = params.logging;
    qoper8.maxMsgLength = 8192 - (qoper8.terminator.length + 1);
    if (typeof params.maxMsgLength !== 'undefined') qoper8.maxMsgLength = params.maxMsgLength - (qoper8.terminator.length + 1);

    // now start it all up

    // start up message queue

    qoper8.queueEvent.on("processQueue", qoper8.processQueue);

    setInterval(function() {
      qoper8.queueEvent.emit("processQueue");
      // report connection stats if they've changed
      var pid;
      //if (qoper8.trace) {
        if (qoper8.connectionUpdate) {
          console.log("Child Process utilitisation:");
          for (pid in qoper8.requestsByProcess) {
            console.log(pid + ": " + qoper8.requestsByProcess[pid]);
          }
          console.log("Max queue length: " + qoper8.maxQueueLength);
          qoper8.connectionUpdate = false;
          qoper8.maxQueueLength = 0;
        }
      //}
    },qoper8.monitorInterval);


    if (!qoper8.silentStart) {
      console.log("********************************************");
      console.log("*** Q-Oper8 Build " + qoper8.buildNo + " (" + qoper8.buildDate + ") ***");
      console.log("********************************************");
      console.log(qoper8.poolSize + " child Node processes running");
      if (qoper8.trace) {
        console.log("Trace mode is on");
      }
      else {
        console.log("Trace mode is off");
      }
    }

    // start up child Node processes

    qoper8.startChildProcesses(callback);

  },

  addToQueue: qoper8.addToQueue,

  childProcess: {
    handler: function(actionMethod, isAsync) {
      qoper8.logger("Child process " + process.pid + " started ok", true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      if (typeof isAsync === 'undefined') isAsync = false;

      var processMessage = function(message) {
        var parts = message.split(qoper8.terminator);
        var part = parts.shift();
        if (part !== '') {
          message = parts.join(qoper8.terminator);
          processPart(part, function() {
            processMessage(message);
          });
        }
      };

      var processPart = function(part, callback) {
        var requests = part.split(qoper8.rd);
        var request = requests.shift();
        if (request !== '') {
          part = requests.join(qoper8.rd);
          processRequest(request, function() {
            processPart(part, callback);
          });
        }
      };

      var processRequest = function(request, callback) {
        var pieces = request.split(qoper8.fd);
        var actionNo = pieces[0];
        var action = pieces[1];
        //qoper8.logger("actionNo = " + actionNo);
        //qoper8.logger("piece[1] = " + pieces[1]);
        action = JSON.parse(action);
        //qoper8.logger("action = " + JSON.stringify(action));
        action.actionNo = actionNo;
        var response = '';
        if (typeof actionMethod !== 'undefined') {
          actionMethod(action, function(response) {
            //qoper8.logger("sending response: " + JSON.stringify(response));
            sendResponse(response, actionNo);
          });
        }
        callback();
      };

      var onParentMessage = function(callback) {
        contentStr = '';
        var dataStr = '';
        var len = qoper8.terminator.length;
        process.stdin.on('data', function(data) {
          dataStr = dataStr + data.toString();
          if (dataStr.substr(-len) === qoper8.terminator) {
            //qoper8.log("terminator found!");
            contentStr = dataStr;
            dataStr = '';
            callback(contentStr);
          }
        });
      };

      var sendResponse = function(response, actionNo) {
        var json = {ok: process.pid, actionNo: actionNo, response: response};
        var message = JSON.stringify(json) + qoper8.terminator;
        //qoper8.log("sending " + message);
        process.stdout.write(message);
      };
      
      onParentMessage(function(message) {
        qoper8.logger("message received: " + message);
        if (isAsync) {
          processMessage(message);
        }
        else {
          var parts = message.split(qoper8.terminator);
          //qoper8.log("message contains " + (parts.length - 1) + "parts");
          var part;
          var request;
          var pieces;
          var actionNo;
          var action;
          var response;
          for (var partNo = 0; partNo < (parts.length - 1); partNo++) {
            //qoper8.log("processing part " + partNo);
            part = parts[partNo];
            var requests = part.split(qoper8.rd);
            //qoper8.log("part contains " + (requests.length - 1) + "requests");
            for (var no = 0; no < (requests.length - 1); no++) {
              //qoper8.log("processing request " + no);
              request = requests[no];
              pieces = request.split(qoper8.fd);
              actionNo = pieces[0];
              action = pieces[1];
              //qoper8.log("actionNo = " + actionNo);
              //qoper8.logger("piece[1] = " + pieces[1]);
              action = JSON.parse(action);
              //qoper8.logger("action = " + JSON.stringify(action));
              action.actionNo = actionNo;
              response = '';
              if (typeof actionMethod !== 'undefined') {
                //if (isAsync) {
                //  actionMethod(action, function(response, actionNo) {
                //    sendResponse(response, actionNo);
                //  });
                //}
                response = actionMethod(action);
                sendResponse(response, action.actionNo);
              }
            }
          }
        }
      });

      //console.log("Child process " + process.pid + " has started");
      var json = {ok: process.pid};
      var message = JSON.stringify(json) + qoper8.terminator;
      process.stdout.write(message);
    }
  },

  asyncHandler: qoper8.asyncHandler,

  makeProcessAvailable: qoper8.makeProcessAvailable,

  version: qoper8.version,

  logger: qoper8.logger,
  logging: qoper8.logging,
  terminator: qoper8.terminator

};





