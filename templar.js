module.exports = Templar

var path = require('path')
, fs = require('fs')
, LRU = require('lru-cache')
, compileCache = new LRU({max:50})
, outputCache = new LRU({max:500})
, crypto = require('crypto')
, templateCache = {}
, loaded = {}
, sigmund = require('sigmund')

// should really load the template folder before using it.
Templar.loadFolder = loadFolder

function Templar (req, res, opts) {
  if (!opts) throw new Error('Please provide options to Templar')

  var folder = opts.folder
  , engine = opts.engine
  , nocache = opts.cache === false
  , stamp = opts.stamp

  if (!engine || !folder) {
    throw new Error('Templar needs engine and folder options')
  }

  folder = path.resolve(folder)

  // In order to support include() methods, we need to load up
  // all of the templates in the folder.  This has the other
  // somewhat nice effect of meaning that we don't have to do
  // any fs.readFile calls later on.
  //
  // Of course, this sucks a lot if you have a lot of different
  // folders where templates go, but that's pretty rare.
  if (!loaded[folder]) loadFolder(folder)

  template.available = available
  template.has = has
  template.locals = {}
  template.locals.locals = template.locals
  return template

  function has (f) {
    f = path.resolve(folder, f)
    return !!templateCache[f]
  }

  function available () {
    return Object.keys(templateCache).filter(function (f) {
      return f.indexOf(folder) === 0
    }).map(function (f) {
      return path.relative(folder, f)
    })
  }

  function template () {
    var f, data, code
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
    if (!code) code = 200
    if (data && (typeof data === 'object')) {
      Object.keys(data).forEach(function (k) {
        template.locals[k] = data[k]
      })
      template.locals.locals = template.locals
    }

    var tpl = templateCache[f]
    if (!tpl) throw new Error('invalid template: '+f)

    // the data is part of the ETag
    // serving the same template with the same data = same result
    var ins = sigmund(template.locals)
    , tag = getETag(tpl.key + ":" + ins)

    if (!nocache && req.headers['if-none-match'] === tag) {
      res.statusCode = 304
      return res.end()
    }
    res.setHeader('etag', tag)
    if (stamp) res.setHeader('x-templar-stamp', stamp)

    // stamp is applied *after* getting the etag, otherwise
    // etags will be worker-specific which makes then much less
    // likely to hit the browser cache.
    template.locals.stamp = stamp
    var out = output(f, template.locals, tag)

    // ok, actually send a result.
    res.statusCode = code || 200
    var curCT = res.getHeader('content-type')
    if (!curCT) res.setHeader('content-type', 'text/html')
    res.end(out)
  }


  function output (f, data, tag) {
    // only generate if we have to
    var out = outputCache.get(tag)
    if (out) return out

    // we're not actually going to provide THAT data object
    // to the template, however.  Instead, we're going to make a copy,
    // so that we can provide an 'include' function, which works just
    // like require(), in that each template includes relative to
    // itself
    var tplData = {}

    Object.keys(data).forEach(function (k) {
      tplData[k] = data[k]
    })
    tplData.include = include(f, tag)

    // include a link to 'locals' to see what we've been provided.
    tplData.locals = tplData

    out = compile(f)(tplData)
    outputCache.set(tag, out)

    return out
  }

  // a partial's effective tag is the parent tag + f + data
  function include (from, tag) { return function (f, data) {
    var ins = sigmund(data)
    , t = tag + f + ins
    return output(path.resolve(path.dirname(from), f), data || {}, t)
  }}

  function compile (f) {
    var tpl = templateCache[f]
    // only compile if we have to.
    var compiled = compileCache.get(f)
    if (!compiled) {
      compiled = engine.compile(tpl.contents, { filename: f })
      compileCache.set(f, compiled)
    }
    if (!compiled) throw new Error('failed to compile template: '+f)
    return compiled
  }
}

function getETag (str) {
  var h = crypto.createHash("sha1")
  h.update(str)
  return '"' + h.digest('base64') + '"'
}

function loadFolder (folder) {
  loadFolder_(folder, templateCache, 0, 10)
  loaded[folder] = true
}

function loadFolder_ (folder, c, depth, maxDepth) {
  if (depth > maxDepth) return

  // synchronously read all the files in the folder, and save
  // their data and signatures for later.
  var queue = []
  fs.readdirSync(folder).forEach(function (file) {
    file = path.resolve(folder, file)
    var st = fs.statSync(file)
    if (!st) return
    if (st.isDirectory()) return queue.push(file)
    st.contents = fs.readFileSync(file, 'utf8')
    st.key = st.dev + ':' + st.ino
    c[file] = st
  })
  queue.forEach(function (folder) {
    loadFolder_(folder, c, depth + 1, maxDepth)
  })
}
