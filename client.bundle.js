(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var Spell = function (dataUrl) {
  if (dataUrl[dataUrl.length - 1] !== '/') {
    dataUrl = dataUrl + '/'
  }
  var myWorker = new Worker(dataUrl + 'worker.bundle.js');

  function spell (word) {
    return new Promise((resolve) => {
      myWorker.addEventListener('message', function(e) {
        var data = JSON.parse(e.data)

        if (data.value === word) {
          resolve(data)
        }
      })

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'spell',
        value: word
      }));

    })
  }

  function suggest (word) {
    return new Promise((resolve) => {
      myWorker.onmessage = function(e) {
        var data = JSON.parse(e.data)
        if (data.value === word) {
          resolve(data)
        }
      }

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'suggest',
        value: word
      }));

    })
  }

  function define (word) {
    return new Promise((resolve) => {
      myWorker.onmessage = function(e) {
        var data = JSON.parse(e.data)
        if (data.value === word) {
          resolve(data)
        }
      }

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'define',
        value: word
      }));

    })
  }

  function alternative (word) {
    return new Promise((resolve) => {
      myWorker.onmessage = function(e) {
        var data = JSON.parse(e.data)
        if (data.value === word) {
          resolve(data)
        }
      }

      myWorker.postMessage(JSON.stringify({
        dataUrl,
        type: 'alternative',
        value: word
      }));

    })
  }
  return {
    spell,
    suggest,
    define,
    alternative
  }
}

if (module) {
  module.exports = {Spell}
}

if (window) {
  window.Spell = Spell
}
},{}]},{},[1]);
