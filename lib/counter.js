/**
 * Counter metric
 */
'use strict';

const util = require('util');
const {
	hashObject,
	isObject,
	getLabels,
	removeLabels,
	nowTimestamp,
} = require('./util');
const { validateLabel } = require('./validation');
const { Metric } = require('./metric');
const Exemplar = require('./exemplar');

class Counter extends Metric {
	constructor(config) {
		super(config);
		this.type = 'counter';
		this.defaultLabels = {};
		this.defaultValue = 1;
		this.defaultExemplarLabelSet = {};
		if (config.enableExemplars) {
			this.enableExemplars = true;
			this.inc = this.incWithExemplar;
		} else {
			this.inc = this.incWithoutExemplar;
		}
	}

	/**
	 * Increment counter.
	 * @param {object} labels - What label you want to be incremented
	 * @param {number} value - Value to increment, if omitted increment with 1
	 * @returns {object} results - object with information about the inc operation
	 */
	incWithoutExemplar(labels, value) {
		let hash = '';
		if (isObject(labels)) {
			hash = hashObject(labels, this.sortedLabelNames);
			validateLabel(this.labelNames, labels);
		} else {
			value = labels;
			labels = {};
		}

		if (value && !Number.isFinite(value)) {
			throw new TypeError(`Value is not a valid number: ${util.format(value)}`);
		}
		if (value < 0) {
			throw new Error('It is not possible to decrease a counter');
		}

		if (value === null || value === undefined) value = 1;

		setValue(this.hashMap, value, labels, hash);

		return { labelHash: hash };
	}

	/**
	 * Increment counter with exemplar, same as inc but accepts labels for an
	 * exemplar.
	 * If no label is provided the current exemplar labels are kept unchanged
	 * (defaults to empty set).
	 *
	 * @param {object} incOpts - Object with options about what metric to increase
	 * @param {object} incOpts.labels - What label you want to be incremented,
	 *                                  defaults to null (metric with no labels)
	 * @param {number} incOpts.value - Value to increment, defaults to 1
	 * @param {object} incOpts.exemplarLabels - Key-value  labels for the
	 *                                          exemplar, defaults to empty set {}
	 * @returns {void}
	 */
	incWithExemplar({
		labels = this.defaultLabels,
		value = this.defaultValue,
		exemplarLabels = this.defaultExemplarLabelSet,
	} = {}) {
		const res = this.incWithoutExemplar(labels, value);
		this.updateExemplar(exemplarLabels, value, res.labelHash);
	}

	updateExemplar(exemplarLabels, value, hash) {
		if (exemplarLabels === this.defaultExemplarLabelSet) return;

		const entry = this.hashMap.get(hash);
		if (!isObject(entry.exemplar)) {
			entry.exemplar = new Exemplar();
		}
		entry.exemplar.validateExemplarLabelSet(exemplarLabels);
		entry.exemplar.labelSet = exemplarLabels;
		entry.exemplar.value = value ? value : 1;
		entry.exemplar.timestamp = nowTimestamp();
	}

	/**
	 * Reset counter.
	 * @returns {void}
	 */
	reset() {
		this.hashMap = new Map();
		if (this.labelNames.length === 0) {
			setValue(this.hashMap, 0);
		}
	}

	async get() {
		if (this.collect) {
			const v = this.collect();
			if (v instanceof Promise) await v;
		}

		return {
			help: this.help,
			name: this.name,
			type: this.type,
			values: Array.from(this.hashMap.values()),
			aggregator: this.aggregator,
		};
	}

	labels(...args) {
		const labels = getLabels(this.labelNames, args) || {};
		return {
			inc: this.inc.bind(this, labels),
		};
	}

	remove(...args) {
		const labels = getLabels(this.labelNames, args) || {};
		validateLabel(this.labelNames, labels);
		return removeLabels.call(this, this.hashMap, labels, this.sortedLabelNames);
	}
}

function setValue(hashMap, value, labels = {}, hash = '') {
	const entry = hashMap.get(hash);

	if (entry !== undefined) {
		entry.value += value;
	} else {
		hashMap.set(hash, { value, labels });
	}
	return hashMap;
}

module.exports = Counter;
