'use strict';

const isObject = require('is-plain-obj');

function flattenObject(obj) {
	if (!obj) {
		obj = {};
	}

	const newObj = {};

	Object.keys(obj).forEach(key => {
		let value = obj[key];

		if (isObject(value)) {
			value = flattenObject(value);
			const keys = Object.keys(value);
			keys.forEach(childKey => {
				newObj[childKey] = value[childKey];
			});
			if (keys.length === 0) {
				newObj[key] = value;
			}
		} else {
			newObj[key] = value;
		}
	});

	return newObj;
}

module.exports = flattenObject;
