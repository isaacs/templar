module.exports = Templar

var path = require('path')
, fs = require('fs')
, util = require('util')
, LRU = require('lru-cache')
, compileCache = new LRU(50)
, outputCache = new LRU(500)
, crypto = require('crypto')

function Templar (req, res, opts) {
  opts = opts || {}
  var folder = path.resolve(opts.folder || process.cwd())
  , engine = opts.engine

  if (!engine) throw new Error('Templar needs an engine')

  return template

  function template (f, data, code) {
    for (var i = 0; i < arguments.length; i ++) {
      switch (typeof arguments[i]) {
        case 'number': code = arguments[i]; break
        case 'string': f = arguments[i]; break
        case 'object': data = arguments[i]; break
        default: throw new Error('bad argument to template')
      }
    }

    if (!f) throw new Error('no template provided')
    f = path.resolve(folder, f)

    // the data is part of the ETag
    var ins = util.inspect(data, true, Infinity, false)

    var compiled = compileCache.get(f)
    if (compiled) return gotCompiled()

    fs.stat(f, function (er, st) {
      if (er) throw new Error('invalid template: '+f)
      var key = st.dev + ':' + st.ino
      fs.readFile(f, 'utf8', function (er, data) {
        if (er) throw new Error('invalid template: '+f)
        compiled = engine.compile(data,
          { filename: f, debug: opts.debug })
        compiled.key = key
        compileCache.set(f, compiled)
        gotCompiled()
      })
    })

    function gotCompiled () {
      var tag = getETag(compiled.key + ":" + ins)
      if (req.headers['if-none-match'] === tag) {
        res.statusCode = 304
        return res.end()
      }
      res.setHeader('etag', tag)

      // if we use the same file with the same data
      // repeatedly, then serve it up cached.
      var finished = outputCache(tag) || compiled(data)
      outputCache.set(tag, finished)
      res.statusCode = code || 200
      var curCT = res.getHeader('content-type')
      if (!curCT) res.setHeader('content-type', 'text/html')
      res.end(finished)
    }
  }
}

function getETag (str) {
  var h = crypto.createHash("sha1")
  h.update(str)
  return '"' + h.digest("hex") + '"'
}

