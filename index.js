/*jshint node:true */

"use strict";

var colors = require('chalk');
var callbacks = {};

function verifyTaskSets(gulp, taskSets, skipArrays) {
	if(taskSets.length === 0) {
		throw new Error('No tasks were provided to run-sequence');
	}
	var foundTasks = {};
	taskSets.forEach(function(t) {
		var isTask = typeof t === "string",
			isArray = !skipArrays && Array.isArray(t);
		if(!isTask && !isArray) {
			throw new Error("Task "+t+" is not a valid task string.");
		}
		if(isTask && !gulp.hasTask(t)) {
			throw new Error("Task "+t+" is not configured as a task on gulp.  If this is a submodule, you may need to use require('run-sequence').use(gulp).");
		}
		if(skipArrays && isTask) {
			if(foundTasks[t]) {
				throw new Error("Task "+t+" is listed more than once. This is probably a typo.");
			}
			foundTasks[t] = true;
		}
		if(isArray) {
			if(t.length === 0) {
				throw new Error("An empty array was provided as a task set");
			}
			verifyTaskSets(gulp, t, true, foundTasks);
		}
	});
}

function runSequence(gulp) {
	// Slice and dice the input to prevent modification of parallel arrays.
	var taskSets = Array.prototype.slice.call(arguments, 1).map(function(task) {
			return Array.isArray(task) ? task.slice() : task;
		}),
		callBack = typeof taskSets[taskSets.length-1] === 'function' ? taskSets.pop() : false,
		currentTaskSet,

		finish = function(err) {
			gulp.removeListener('task_start', onTaskStart);
			gulp.removeListener('task_stop', onTaskEnd);
			gulp.removeListener('task_err', onError);
			if(callBack) {
				callBack(err);
			} else if(err) {
				console.log(colors.red('Error running task sequence:'), err);
			}
		},

		onError = function(err) {
			var end = (callbacks['task_err'] || []).some(function(callback) {
				var result = callback(err);
				if(result === false) {
					finish();
					return true;   // short-circuit the some() loop
				}
			});

			if(end) {
				return;
			}

			finish(err);
		},

		onTaskStart = function(event) {
			(callbacks['task_start'] || []).some(function(callback) {
				var result = callback(event);
				if(result === false) {
					finish();
					return true;   // short-circuit the some() loop
				}
			});
		},

		onTaskEnd = function(event) {
			var end = (callbacks['task_stop'] || []).some(function(callback) {
				var result = callback(event);
				if(result === false) {
					finish();
					return true;   // short-circuit the some() loop
				}
			});

			if(end) {
				return;
			}

			var idx = currentTaskSet.indexOf(event.task);
			if(idx > -1) {
				currentTaskSet.splice(idx,1);
			}
			if(currentTaskSet.length === 0) {
				runNextSet();
			}
		},

		runNextSet = function() {
			if(taskSets.length) {
				var command = taskSets.shift();
				if(!Array.isArray(command)) {
					command = [command];
				}
				currentTaskSet = command;
				gulp.start.apply(gulp, command);
			} else {
				finish();
			}
		};

	verifyTaskSets(gulp, taskSets);

	gulp.on('task_start', onTaskStart);
	gulp.on('task_stop', onTaskEnd);
	gulp.on('task_err', onError);

	runNextSet();
}

module.exports = runSequence.bind(null, require('gulp'));
module.exports.use = function(gulp) {
	return runSequence.bind(null, gulp);
};
module.exports.on = function(event, callback) {
	callbacks[event] = callbacks[event] || [];
	callbacks[event].push(callback);
	return function () {
		callbacks[event].splice(callbacks[event].indexOf(callback), 1);
	};
};