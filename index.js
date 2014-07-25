'use strict';

var es = require('event-stream');
var knox = require('knox');
var gutil = require('gulp-util');
var mime = require('mime');
mime.default_type = 'text/plain';

module.exports = function (aws, options) {
	options = options || {};

	if (!options.delay) { options.delay = 0; }

	var client = knox.createClient(aws);
	var waitTime = 0;
	var regexGzip = /\.([a-z]{2,})\.gz$/i;
	var regexGeneral = /\.([a-z]{2,})$/i;
	var filesUploaded = 0;

	var stream = es.map(function (file, callback) {
		if (file.stat.isDirectory()) {
			return callback();
		}
		if (!file.isBuffer()) {
			return callback(file); // fail if we don't know how to upload
		}

		var uploadPath = file.path.replace(file.base, options.uploadPath || '');
		uploadPath = uploadPath.replace(new RegExp('\\\\', 'g'), '/');
		var headers = { 'x-amz-acl': 'public-read' };
		if (options.headers) {
			for (var key in options.headers) {
				headers[key] = options.headers[key];
			}
		}

		if (regexGzip.test(file.path)) {
			// Set proper encoding for gzipped files, remove .gz suffix
			headers['Content-Encoding'] = 'gzip';
			uploadPath = uploadPath.substring(0, uploadPath.length - 3);
		} else if (options.gzippedOnly) {
			// Ignore non-gzipped files
			return file;
		}

		// Set content type based of file extension
		if (!headers['Content-Type'] && regexGeneral.test(uploadPath)) {
			headers['Content-Type'] = mime.lookup(uploadPath);
			if (options.encoding) {
				headers['Content-Type'] += '; charset=' + options.encoding;
			}
		}

		headers['Content-Length'] = file.stat.size;
		client.putBuffer(file.contents, uploadPath, headers, function (err, res) {
			if (err) {
				gutil.log(gutil.colors.red('[FAILED]', file.path, err, res));
				return callback(err);
			} else if (res.statusCode !== 200) {
				gutil.log(gutil.colors.red('[FAILED]', file.path, res.statusCode));
				res.resume();
				return callback("Upload error: bad status code " + res.statusCode);
			} else {
				if (!options.silent) {
					gutil.log(gutil.colors.green('[SUCCESS]', file.path + " -> " + uploadPath));
				}
				filesUploaded++;
				res.resume();
				callback(null, file);
			}
		});
	});

	if (options.silent) {
		stream.on('end', function () {
			gutil.log(gutil.colors.green(
				'[SUCCESS] uplodaded', filesUploaded,
				'files to', options.uploadPath
			));
		});
	}

	return stream;
}
