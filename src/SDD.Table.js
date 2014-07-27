EVEoj.SDD.Table = EVEoj.SDD.Table || {};
(function () {

var ME = EVEoj.SDD.Table,
	// namespace quick refs
	E = EVEoj,
	SDD = EVEoj.data,
	
	_P = {}, // private methods
	P = {} // public methods
	;
			
// default object properties
ME.D = {
	'src': null, // the EVEoj.SDD.Source that owns this table
	'name': null, // the name of this table
	'keyname': null, // the primary key name
	'columns': [], // the list of columns
	'colmap': {}, // a reverse lookup map for column indexes
	'subkeys': [], // any subkeys (this implies a nested entry structure)
	'data': {}, // the data for this table (shallow references into raw data from source)
	'segments': [], // the segment information for this table
	'length': 0, // the total number of entries in this table
	'loaded': 0 // the total number of currently loaded entries
};
ME.Create = function (name, src, meta) {
	var obj,
		i,
		keyarr
		;
							
	obj = E.create(P);
	E.extend(true, obj, ME.D);
	
	// sort out relevant metadata details
	obj.src = src;
	obj.name = name;
	
	// determine the source(s) of this table's data
	if (meta.hasOwnProperty('j')) {
		// only one segment and it is stored with other stuff
		obj.segments.push({ 'min': 0, 'max': -1, 'tag': meta['j'], 'loaded': false, 'p': null });
	}
	else if (meta.hasOwnProperty('s')) {
		//  at least one segment that is stored independently
		for (i = 0; i < meta['s'].length; i++) {
			obj.segments.push({ 'min': meta['s'][i][1], 'max': meta['s'][i][2], 'tag': name + '_' + meta['s'][i][0], 'loaded': false, 'p': null });
		}
	}
	
	// if this table has a column array, create a reverse lookup map for it
	if (meta.hasOwnProperty('c') && meta['c'].length > 0) {
		obj.columns.push(meta['c']);
		for (i = 0; i < meta['c'].length; i++) obj.colmap[meta['c'][i]] = i;
	}
	
	// find out the key info for this table
	if (meta.hasOwnProperty('k')) {
		keyarr = meta['k'].split(':');
		obj.keyname = keyarr.shift();
		obj.subkeys.push(keyarr);
	}

	// grab the length
	if (meta.hasOwnProperty('l')) {
		obj.length = meta['l'];
	}
	
	return obj;
};

// get the entry for the key provided; all keys must be numeric values for segmentation
P.GetEntry = function (key) {
	var i,
		nkey,
		skey;
	
	// get a guaranteed numeric and guaranteed string version of the key; numeric
	// is for segment comparison, string is for object property lookup
	nkey = parseInt(key);
	if (isNaN(nkey)) return null;
	skey = nkey.toString(10);
	if (this.data.hasOwnProperty(skey)) return this.data[skey];
	
	// if we don't have this key, determine if we ought to by now
	for (i = 0; i < this.segments.length; i++) {
		if (nkey >= this.segments[i].min && (nkey <= this.segments[i].max || this.segments[i].max == -1)) {
			// the key should be in this segment
			if (this.segments[i].loaded) return null; // {
				// the segment is loaded, so either we have this key or it doesn't exist
				// if (this.segments[i].data.hasOwnProperty(skey)) return this.segments[i].data[skey];
				// else return null;
			// }
			else return false; // the segment isn't loaded yet
		}
	}
	
	return null;		
};		

// get the value for the key (or entry array) and column provided
P.GetValue = function (key, col) {
	var entry;
	if (key instanceof Array) entry = key;
	else entry = this.GetEntry(key);
	if (entry === null || entry === false) return entry;
	if (isNaN(col)) {
		if (!this.colmap.hasOwnProperty(col)) return null;
		col = this.colmap[col];
	}
	return entry[col];
};

_P.SegLoadDone = function(tag, data, done, p, ctx) {
	var i;
	done.has++;
	for (i = 0; i < this.segments.length; i++) {
		if (this.segments[i].tag != tag) continue;
		if (data['tables'].hasOwnProperty(this.name) && data['tables'][this.name].hasOwnProperty('d')) {
			E.extend(this.data, data['tables'][this.name]['d']);
			if (data['tables'][this.name].hasOwnProperty('L')) {
				this.loaded += data['tables'][this.name]['L'];
			}
			else if (done.needs == 1) {
				this.loaded = this.length;
			}
		}
		break;
	}	
	if (done.has >= done.needs) p.resolveWith(ctx, [this]);
	else p.notifyWith(ctx, [this, done.has, done.needs]);
};
_P.SegLoadFail = function(tag, status, error, p, ctx) {
	p.rejectWith(ctx, [this, status, error]);
};

// load data for this table; returns a deferred promise object as this is an async thing
// if key is provided, loads ONLY the segment containing that key
P.Load = function(opts) {
	var p = E.deferred(),
		self = this,
		all_needs,
		done,
		nkey,
		skey,
		i,
		segment,
		o = {'ctx': null, 'key': null}
		;
	E.extend(o, opts);
	
	if (o.key === null) {
		// load all segments
		all_needs = [];
		for (i = 0; i < this.segments.length; i++) {
			if (!this.segments[i].loaded) {
				// this segment not yet loaded
				all_needs.push(i);
			}
		}
		done = {'needs': all_needs.length, 'has': 0};
		if (all_needs.length > 0) {
			for (i = 0; i < all_needs.length; i++) {
				if (!this.segments[all_needs[i]].p) {
					// this segment not pending load
					this.segments[all_needs[i]].p = this.src.LoadTag(this.segments[i].tag);
				}
				this.segments[all_needs[i]].p
					.done(function (tag, data) { _P.SegLoadDone.apply(self, [tag, data, done, p, o.ctx]) })
					.fail(function (tag, status, error) { _P.SegLoadFail.apply(self, [tag, status, error, p, o.ctx]) });
			}
			return p.promise();
		}
		else {
			p.resolveWith(o.ctx, [this]);
			return p.promise();
		}	
	}
	else {
		// determine which segment the key is in
		nkey = parseInt(o.key);
		if (isNaN(nkey)) {
			p.rejectWith(o.ctx, [this, 'badkey', 'invalid key; not numeric']);
			return this.p.promise();
		}
		skey = nkey.toString(10);
		segment = -1;
		for (i = 0; i < this.segments.length; i++) {
			if (nkey >= this.segments[i].min && (nkey <= this.segments[i].max || this.segments[i].max == -1)) {
				// the key should be in this segment
				segment = this.segments[i];
				break;
			}
		}
		
		if (segment === -1) return p.rejectWith(o.ctx, [this, 'badkey', 'invalid key; no segment contains it']).promise();			
		if (segment.loaded) return p.resolveWith(o.ctx, [this]).promise();
		
		if (segment.p == null) segment.p = this.src.LoadTag(segment.tag);
		done = {'needs': 1, 'has': 0};
		segment.p
			.done(function (tag, data) { _P.SegLoadDone.apply(self, [tag, data, done, p, o.ctx]) })
			.fail(function (tag, status, error) { _P.SegLoadFail.apply(self, [tag, status, error, p, o.ctx]) });
		
		return p.promise();
	}
};

P.ColIter = function (colname) {
	var colnum;
	if (this.colmap.hasOwnProperty(colname)) {
		colnum = this.colmap[colname];
		return function (e) { return e[colnum] };
	}
	else return function (e) { return undefined };	
};
		
})();