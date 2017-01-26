'use strict';

const pluralize = require('pluralize');
const isObject = require('is-plain-obj');
const result = require('lodash.result');
const arrify = require('arrify');

const queryMethods = require('./util/query-methods');
const flatten = require('./util/join-obj-keys');
const Fields = require('./fields');
const Hooks = require('./hooks');
const Query = require('./query');

function Model(fields) {
	const defaultFields = this.constructor.defaultFields || {};

	this.fields = new Fields(Object.assign({}, flatten(defaultFields), flatten(fields || {})));
	this.previous = new Fields();

	this.globalHooks = this.constructor.hooks || new Hooks();
	this.hooks = new Hooks();

	// keep track of unset fields to delete on the next update
	this._unsetFields = [];

	this.configure();
}

const instanceMethods = {
	configure() {},

	get(key) {
		return this.fields.get(key);
	},

	set(key, value) {
		if (isObject(key)) {
			const obj = flatten(key);

			Object.keys(obj).forEach(key => {
				this.set(key, obj[key]);
			});

			return;
		}

		const previousValue = this.fields.get(key);

		if (previousValue !== value) {
			if (typeof previousValue !== 'undefined') {
				this.previous.set(key, previousValue);
			}

			this.fields.set(key, value);
		}
	},

	unset(keys) {
		this.fields.unset(keys);

		arrify(keys).forEach(key => {
			this._unsetFields.push(key);
		});
	},

	changed(key) {
		return this.fields.get(key) !== this.previous.get(key);
	},

	toJSON() {
		return this.get();
	},

	before(event, handler) {
		if (typeof handler === 'string') {
			handler = this[handler];
		}

		this.hooks.before(event, handler, {priority: 5});
	},

	after(event, handler) {
		if (typeof handler === 'string') {
			handler = this[handler];
		}

		this.hooks.after(event, handler, {priority: 5});
	},

	save() {
		const isSaved = Boolean(this.get('_id'));

		return this.globalHooks.run('before', 'save', [], this)
			.then(() => this.hooks.run('before', 'save', [], this))
			.then(() => isSaved ? this.update() : this.create())
			.then(() => this.hooks.run('after', 'save', [], this))
			.then(() => this.globalHooks.run('after', 'save', [], this));
	},

	create() {
		this.set('created_at', new Date());
		this.set('updated_at', new Date());

		return this.globalHooks.run('before', 'create', [], this)
			.then(() => this.hooks.run('before', 'create', [], this))
			.then(() => this.constructor.dbCollection())
			.then(collection => {
				return collection.insert(this.get());
			})
			.then(inserted => {
				this.set('_id', inserted.ops[0]._id);
			})
			.then(() => this.hooks.run('after', 'create', [], this))
			.then(() => this.globalHooks.run('after', 'create', [], this));
	},

	update() {
		this.set('updated_at', new Date());

		return this.globalHooks.run('before', 'update', [], this)
			.then(() => this.hooks.run('before', 'update', [], this))
			.then(() => this.constructor.dbCollection())
			.then(collection => {
				const update = {
					$set: this.get()
				};

				if (this._unsetFields.length > 0) {
					update.$unset = {};

					this._unsetFields.forEach(field => {
						update.$unset[field] = '';
					});

					this._unsetFields.length = 0;
				}

				return collection.update({_id: this.get('_id')}, update);
			})
			.then(() => this.hooks.run('after', 'update', [], this))
			.then(() => this.globalHooks.run('after', 'update', [], this));
	},

	inc(key, value) {
		if (!value) {
			value = 1;
		}

		const isSaved = Boolean(this.get('_id'));

		if (!isSaved) {
			return Promise.reject(new Error('Attribute can\'t be incremented in unsaved model.'));
		}

		this.set('updated_at', new Date());

		let fields;

		if (isObject(key)) {
			fields = key;
		} else {
			fields = {
				[key]: value
			};
		}

		return this.globalHooks.run('before', 'update', [], this)
			.then(() => this.hooks.run('before', 'update', [], this))
			.then(() => this.constructor.dbCollection())
			.then(collection => {
				const update = {
					$inc: fields,
					$set: {'updated_at': this.get('updated_at')} // eslint-disable-line quote-props
				};

				return collection.update({_id: this.get('_id')}, update);
			})
			.then(() => this.refresh())
			.then(() => this.hooks.run('after', 'update', [], this))
			.then(() => this.globalHooks.run('after', 'update', [], this));
	},

	refresh() {
		const isSaved = Boolean(this.get('_id'));

		if (!isSaved) {
			return Promise.reject(new Error('Unsaved model can\'t be refreshed.'));
		}

		return this.constructor.dbCollection()
			.then(collection => {
				return collection.findOne({_id: this.get('_id')});
			})
			.then(fields => {
				this.set(fields);
			});
	},

	remove() {
		const isSaved = Boolean(this.get('_id'));

		if (!isSaved) {
			return Promise.reject(new Error('Unsaved model can\'t be removed.'));
		}

		return this.globalHooks.run('before', 'remove', [], this)
			.then(() => this.hooks.run('before', 'remove', [], this))
			.then(() => this.constructor.dbCollection())
			.then(collection => {
				return collection.remove({_id: this.get('_id')});
			})
			.then(() => this.hooks.run('after', 'remove', [], this))
			.then(() => this.globalHooks.run('after', 'remove', [], this));
	}
};

const classMethods = {
	connection() {
		if (!this.database) {
			return Promise.reject(new Error('Model is not registered in a database.'));
		}

		return this.database.connection();
	},

	dbCollection() {
		return this.connection()
			.then(db => {
				const name = result(this, 'collection');

				return db.collection(name);
			});
	},

	collection() {
		return pluralize(this.displayName || this.name).toLowerCase();
	},

	drop() {
		return this.dbCollection()
			.then(collection => collection.drop());
	},

	index() {
		const args = [].slice.call(arguments);

		return this.dbCollection()
			.then(collection => collection.ensureIndex.apply(collection, args));
	},

	dropIndex() {
		const args = [].slice.call(arguments);

		return this.dbCollection()
			.then(collection => collection.dropIndex.apply(collection, args));
	},

	indexes() {
		const args = [].slice.call(arguments);

		return this.dbCollection()
			.then(collection => collection.listIndexes.apply(collection, args).toArray());
	},

	setupDefaultHooks() {
		this.hooks = new Hooks();
		this.hooks.after('find', docs => {
			return docs.map(doc => new this(doc)); // eslint-disable-line babel/new-cap
		}, {priority: 0});
	},

	before(event, handler) {
		if (!this.hooks) {
			this.setupDefaultHooks();
		}

		this.hooks.before(event, handler, {priority: 5});
	},

	after(event, handler) {
		if (!this.hooks) {
			this.setupDefaultHooks();
		}

		this.hooks.after(event, handler, {priority: 5});
	},

	use(plugin) {
		return plugin(this);
	}
};

const customMethods = [
	'findById',
	'findOne',
	'include',
	'exclude',
	'search',
	'remove',
	'count',
	'find',
	'sort',
	'mquery',
];

queryMethods.concat(customMethods).forEach(name => {
	classMethods[name] = function () {
		const args = [].slice.call(arguments);

		if (!this.hooks) {
			this.setupDefaultHooks();
		}

		const query = new Query();
		query.model = this;
		return query[name].apply(query, args);
	};
});

Object.assign(Model.prototype, instanceMethods);
Object.assign(Model, classMethods);

module.exports = Model;
