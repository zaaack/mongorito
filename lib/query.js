'use strict';

const isObject = require('is-plain-obj');
const mquery = require('mquery');

const queryMethods = require('./util/query-methods');

class Query {
	constructor() {
		this._mquery = mquery();
	}

	find(query) {
		this.where(query || {});

		return this.model.hooks.run('before', 'find', [], this)
			.then(() => this.model.dbCollection())
			.then(collection => this._mquery.collection(collection).find())
			.then(docs => this.model.hooks.run('after', 'find', [docs], this));
	}

	findOne(query) {
		this.where(query || {});

		return this.model.hooks.run('before', 'find', [], this)
			.then(() => this.model.dbCollection())
			.then(collection => this._mquery.collection(collection).findOne())
			.then(doc => doc ? [doc] : [])
			.then(docs => this.model.hooks.run('after', 'find', [docs], this))
			.then(models => models[0]);
	}

	findById(id) {
		this.where('_id', id);

		return this.model.dbCollection()
			.then(collection => this._mquery.collection(collection).findOne())
			.then(doc => doc ? new this.model(doc) : null); // eslint-disable-line babel/new-cap
	}

	remove(query) {
		this.where(query || {});

		return this.model.dbCollection()
			.then(collection => this._mquery.collection(collection).remove());
	}

	count(query) {
		this.where(query || {});

		return this.model.dbCollection()
			.then(collection => this._mquery.collection(collection).count());
	}

	include(field, value) {
		if (!value) {
			value = 1;
		}

		if (Array.isArray(field)) {
			field.forEach(field => this.include(field));
			return this;
		}

		let select = {};

		if (isObject(field)) {
			select = field;
		}

		select[field] = value;

		this._mquery.select(select);

		return this;
	}

	exclude(field, value) {
		if (!value) {
			value = 0;
		}

		if (Array.isArray(field)) {
			field.forEach(field => this.exclude(field));
			return this;
		}

		let select = {};

		if (isObject(field)) {
			select = field;
		}

		select[field] = value;

		this._mquery.select(select);

		return this;
	}

	sort(field, value) {
		if (!value) {
			value = 'desc';
		}

		if (Array.isArray(field)) {
			field.forEach(field => this.sort(field));
			return this;
		}

		let sort = {};

		if (isObject(field)) {
			sort = field;
		}

		sort[field] = value;

		this._mquery.sort(sort);

		return this;
	}

	search(query) {
		return this.where({
			$text: {
				$search: query
			}
		});
	}

	mquery(resolve, reject) {
		this._mquery.model = this.model
		this._mquery.then = mqueryThen
		return this._mquery
	}
}


function mqueryThen(resolve, reject) {
	return this.model.dbCollection()
		.then(collection => this.collection(collection).exec())
		.then(resolve, reject);
}

queryMethods.forEach(name => {
	Query.prototype[name] = function () {
		const args = [].slice.call(arguments);
		this._mquery[name].apply(this._mquery, args);

		return this;
	};
});

module.exports = Query;
