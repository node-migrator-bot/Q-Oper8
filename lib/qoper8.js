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
 | This program is free software: you can redistribute it and/or modify     |
 | it under the terms of the GNU Affero General Public License as           |
 | published by the Free Software Foundation, either version 3 of the       |
 | License, or (at your option) any later version.                          |
 |                                                                          |
 | This program is distributed in the hope that it will be useful,          |
 | but WITHOUT ANY WARRANTY; without even the implied warranty of           |
 | MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the            |
 | GNU Affero General Public License for more details.                      |
 |                                                                          |
 | You should have received a copy of the GNU Affero General Public License |
 | along with this program.  If not, see <http://www.gnu.org/licenses/>.    |
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

/*
  Define the qoper8 object
*/

var qoper8 = {

  buildNo: 1,
  buildDate: "30 August 2011",
  version: function() {
    return 'Q-Oper8 build ' + this.buildNo + ', ' + this.buildDate;
  },

  addToQueue: function(requestObj, responseHandler) {
    // puts a request onto the queue and triggers the queue to be processed
    var action = requestObj.action;
    var queuedRequest = {
      action: action,
      requestObj: requestObj,
      handler: responseHandler
    };
    qoper8.queue.push(queuedRequest);
    qoper8.totalRequests++;
    var qLength = qoper8.queue.length;
    if (qLength > qoper8.maxQueueLength) qoper8.maxQueueLength = qLength;
    if (qoper8.trace) console.log("action added to Queue: queue length = " + qLength + "; requestNo = " + qoper8.totalRequests + "; after " + qoper8.elapsedTime() + " sec");
    //console.log("action = " + JSON.stringify(queuedRequest.action));
    // trigger the processing of the queue
    qoper8.queueEvent.emit("processQueue");
  },

  getChildProcess: function() {
    var pid;
    // try to find a free child process, otherwise return false
    for (pid in qoper8.process) {
      if (qoper8.process[pid].isAvailable) {
        qoper8.process[pid].isAvailable = false;
        return pid;
      }
    }
    return false;
  },

  startChildProcesses: function(callback) {
    var process;
    var pid;
    var noStarted = 0;
    for (var i = 0; i < this.poolSize; i++) {
      process = cp.fork(qoper8.childProcessPath);
      pid = process.pid
      qoper8.process[pid] = process;
      qoper8.process[pid].isAvailable = false;
      qoper8.process[pid].started = false;
      qoper8.requestsByProcess[pid] = 0;

     // define how responses from child processes are handled
     // *****************************************************

      qoper8.process[pid].on('message', function(response) {
        if (qoper8.trace) console.log("child process returned response " + JSON.stringify(response));
        if (response.ok) {
          // release the child process back to the available pool
          //qoper8.process[response.ok].isAvailable = true;
          //if (qoper8.trace) console.log("Child process " + response.ok + " added to available pool");
          if (!qoper8.process[response.ok].started) {
            noStarted++;
            qoper8.process[response.ok].started = true;
            qoper8.process[response.ok].isAvailable = true;
            if (noStarted === qoper8.poolSize) {
              qoper8.started = true;
              if (qoper8.trace) console.log("Q-Oper8 is ready!");
              qoper8.queueEvent.emit("processQueue");
              callback();
            }
          }
          else {
            // now that it's available again, trigger the queue to be processed
            // do whatever the master process needs to do with the child 
            // process's response by invoking the handler

            var process = qoper8.process[response.ok];
            var handler = process.handler;
            var requestObj = process.queuedRequest;
            if (typeof handler !== 'undefined') {
              if (qoper8.trace) console.log("running handler");
              handler(requestObj, response.response);
              qoper8.process[response.ok].isAvailable = true;
              qoper8.queueEvent.emit("processQueue");
            }
          }
        }
      });

      // *******************************************************

    }
  },
  
  processQueue: function() {
    // tries to allocate queued actions to available child processes
    if (qoper8.queue.length > 0)  {
      qoper8.queueEvents++;
      if (qoper8.trace) console.log("processing queue: " + qoper8.queueEvents + "; queue length " + qoper8.queue.length + "; after " + qoper8.elapsedTime() + " seconds");
      var queuedRequest;
      var pid = true;
      var process;
      while (pid) {
        queuedRequest = qoper8.queue.shift();
        pid = qoper8.getChildProcess();
        if (!pid) {
          qoper8.queue.unshift(queuedRequest);
        }
        else {
          // A free child process was found, so
          // dispatch action to it
          if (qoper8.trace) console.log("dispatching action to " + pid + ": action = " + JSON.stringify(queuedRequest.action));
          process = qoper8.process[pid];

          process.queuedRequest = queuedRequest.requestObj;
          process.handler = queuedRequest.handler;

          // ***** pass request to child process ****
          process.send(queuedRequest.action);

          // ****************************************

          // increment usage stats
          qoper8.connectionUpdate = true;
          qoper8.requestsByProcess[pid]++;
        }
        if (qoper8.queue.length === 0) {
          pid = false;
          if (qoper8.trace) console.log("queue exhausted");
        }
      }
      if (qoper8.queue.length > 0) {
        if (qoper8.trace) console.log("queue processing aborted: no free child proceses available");
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
  totalRequests: 0

};


module.exports = {
  start: function(params, callback) {

    // define parameters / set defaults

    qoper8.poolSize = 5;
    if (typeof params.poolSize !== 'undefined') qoper8.poolSize = params.poolSize;
    qoper8.trace = true;
    if (typeof params.trace !== 'undefined') qoper8.trace = params.trace;
    qoper8.childProcessPath = __dirname + '/qoper8ChildProcess.js'
    if (typeof params.childProcessPath !== 'undefined') qoper8.childProcessPath = params.childProcessPath;
    qoper8.silentStart = false;
    if (typeof params.silentStart !== 'undefined') qoper8.silentStart = params.silentStart;
    qoper8.monitorInterval = 30000;
    if (typeof params.monitorInterval !== 'undefined') qoper8.monitorInterval = params.monitorInterval;

    // now start it all up

    // start up message queue

    qoper8.queueEvent.on("processQueue", qoper8.processQueue);

    setInterval(function() {
      qoper8.queueEvent.emit("processQueue");
      // report connection stats if they've changed
      var pid;
      if (qoper8.trace) {
        if (qoper8.connectionUpdate) {
          console.log("Child Process utilitisation:");
          for (pid in qoper8.requestsByProcess) {
            console.log(pid + ": " + qoper8.requestsByProcess[pid]);
          }
          console.log("Max queue length: " + qoper8.maxQueueLength);
          qoper8.connectionUpdate = false;
          qoper8.maxQueueLength = 0;
        }
      }
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
    handler: function(actionMethod) {
      process.on('message', function(action) {
        //console.log("Child process received message: " + JSON.stringify(action));
        var response = '';
        if (typeof actionMethod !== 'undefined') response = actionMethod(action);
        process.send({ok: process.pid, response: response});
      });

      //console.log("Child process " + process.pid + " has started");

      process.send({ok: process.pid});
    }
  }

};





