'use strict';

var extend = require('node.extend');

exports.Const = require('./Const');
exports.Utils = require('./Utils');
exports.SDD = require('./SDD');

exports.V_MAJOR = 0;
exports.V_MINOR = 2;
exports.V_PATCH = 0;
exports.VERSION = exports.V_MAJOR + '.' + exports.V_MINOR + '.' + exports.V_PATCH;
