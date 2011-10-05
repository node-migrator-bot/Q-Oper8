var qoper8 = require('qoper8');

// Try modifying the poolSize and maxMsgLength to see the effect to overall processing time

// You'll need to modify the childProcessPath to the location of your copy of benchmarkChildProc.js

var params = {poolSize: 4, maxMsgLength: 8192, childProcessPath: '/home/rob/gdbwork/benchmarkChildProc.js'};

qoper8.start(params, function(queue) {
  console.log("started!!!");

  var startTime = new Date().getTime();

// Try modifying the number of requests and batch addToQueue interval to test the performance of Q-Oper8
// Tweak these values to try to create a balance where the queue is fed at the same rate as it's consumed
  var maxQueue = 500;
  var interval = 1;
  var noOfRequests = 0;
  var total = 0;
  var maxRequests = 500000;


  var total = 0;

  var handler = function(actionObj, response, pid) {
    total++;
    if (total % (maxRequests/10) === 0) {
      var now = new Date().getTime();
      var elap = (now - startTime)/1000;
      console.log(total + ": Total elapsed time: " + elap + "(" + total/elap + "/sec): queue length " + queue.length);
      console.log("response was " + JSON.stringify(response));
      console.log("original action was: " + JSON.stringify(actionObj.action));
      console.log("pid = " + pid);
    }
  };

  var iv = setInterval(function() {
    for (var i = 1; i < (maxQueue + 1); i++) {
      if (queue.length > maxQueue) {
        //console.log("queue length exceeded");
        break;
      }
      noOfRequests++;
      if (noOfRequests > maxRequests) {
        console.log("max (" + maxRequests + ") reached");
        clearInterval(iv);
        break;
      }
      qoper8.addToQueue({action: {domNo: noOfRequests}}, handler);
    }
  }, interval);


  
});





